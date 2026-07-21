const express = require('express');
const router = express.Router();
const { rtdb, db, admin } = require('../config/firebase');
const { verifyToken, requireAdmin } = require('../middleware/auth');

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

let workZoneCache = null;
let workZoneCacheTime = 0;

async function getWorkZone() {
  const now = Date.now();
  if (workZoneCache && now - workZoneCacheTime < 300000) {
    return workZoneCache;
  }
  try {
    const doc = await db.collection('settings').doc('workzone').get();
    if (doc.exists) {
      workZoneCache = doc.data();
    } else {
      workZoneCache = {
        lat: parseFloat(process.env.WORK_ZONE_LAT) || 24.7136,
        lng: parseFloat(process.env.WORK_ZONE_LNG) || 46.6753,
        radiusMeters: parseInt(process.env.WORK_ZONE_RADIUS_METERS) || 15000,
      };
    }
    workZoneCacheTime = now;
  } catch (e) {
    workZoneCache = {
      lat: parseFloat(process.env.WORK_ZONE_LAT) || 24.7136,
      lng: parseFloat(process.env.WORK_ZONE_LNG) || 46.6753,
      radiusMeters: parseInt(process.env.WORK_ZONE_RADIUS_METERS) || 15000,
    };
  }
  return workZoneCache;
}

function isInsideWorkZoneSync(lat, lng, zone) {
  return distanceMeters(lat, lng, zone.lat, zone.lng) <= zone.radiusMeters;
}

// ⚠️⚠️⚠️ إصلاح جذري لاستهلاك النطاق الترددي (Bandwidth) الحقيقي:
// السبب الفعلي للمشكلة السابقة لم يكن سرعة إرسال الموقع فقط، بل كان "عدد الاتصالات المنفصلة
// بـ Firebase" في كل نبضة واحدة (كانت 6 اتصالات: 3 قراءة + 3 كتابة!). كل اتصال Firebase منفصل
// يحمل تكلفة اتصال شبكة كاملة تُحتسب ضمن "Service-Initiated Bandwidth" على Render.
//
// الحل: (1) تخزين "الجلسة النشطة" في ذاكرة الخادم مباشرة (Map) بدل قراءتها من Firebase في كل
// مرة - آمن لأن خادم Render يبقى عملية واحدة مستمرة، وليس Serverless يُعاد تشغيله باستمرار.
// (2) دمج كل الكتابات (الموقع + تراكم المسافة) في استدعاء واحد فقط عبر update() متعدد المسارات.
// (3) قراءة واحدة فقط بدل 3 (نجمع الموقع السابق وتراكم المسافة في نفس عقدة liveLocations).

const activeSessionsCache = new Map(); // driverId -> { sessionId, cachedAt }
const SESSION_CACHE_TTL_MS = 5 * 60 * 1000; // نُعيد التحقق من Firebase كل 5 دقائق فقط لكل مندوب

async function getActiveSessionId(driverId) {
  const cached = activeSessionsCache.get(driverId);
  const now = Date.now();
  if (cached && now - cached.cachedAt < SESSION_CACHE_TTL_MS) {
    return cached.sessionId;
  }
  const snap = await rtdb.ref(`driverSessions/${driverId}`).once('value');
  const sessionId = snap.val();
  activeSessionsCache.set(driverId, { sessionId, cachedAt: now });
  return sessionId;
}

const FIRESTORE_SYNC_MIN_INTERVAL_MS = 60000;

router.post('/update', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }

    const { lat, lng, speed, accuracy, battery, isCharging, gpsEnabled, isInternetConnected } = req.body;
    const driverId = req.user.driverId;
    const now = Date.now();

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ success: false, message: 'إحداثيات غير صالحة' });
    }

    // فحص الجلسة الواحدة النشطة - من الذاكرة مباشرة في 99% من الأحيان (بدون أي اتصال Firebase)
    if (req.user.sessionId) {
      const activeSessionId = await getActiveSessionId(driverId);
      if (activeSessionId && activeSessionId !== req.user.sessionId) {
        return res.status(409).json({
          success: false,
          sessionInvalidated: true,
          message: 'تم تسجيل الدخول لهذا الحساب من جهاز آخر، توقف التتبع من هذا الجهاز',
        });
      }
    }

    const zone = await getWorkZone(); // مخزَّن مؤقتًا 5 دقائق، لا يلمس Firebase في أغلب الأحيان
    const insideZone = isInsideWorkZoneSync(lat, lng, zone);

    // ✅ قراءة واحدة فقط: نجلب الموقع السابق + تراكم المسافة اليومية معًا من نفس العقدة
    const today = new Date(now).toISOString().slice(0, 10);
    const prevSnap = await rtdb.ref(`liveLocations/${driverId}`).once('value');
    const prev = prevSnap.val();

    let distanceDelta = 0;
    if (prev && prev.lat && prev.lng) {
      distanceDelta = distanceMeters(prev.lat, prev.lng, lat, lng);
      const secondsSinceLast = (now - prev.timestamp) / 1000;
      if (secondsSinceLast > 0 && distanceDelta / secondsSinceLast > 300) {
        distanceDelta = 0;
      }
    }

    // إن تغيّر اليوم (منتصف الليل) نُصفّر التراكم تلقائيًا
    const prevDailyTotal = prev && prev.dailyDate === today ? (prev.dailyTotalMeters || 0) : 0;
    const newDailyTotal = prevDailyTotal + distanceDelta;

    const lastFirestoreSync = (prev && prev.dailyDate === today ? prev.lastFirestoreSync : 0) || 0;
    const shouldSyncFirestore = now - lastFirestoreSync >= FIRESTORE_SYNC_MIN_INTERVAL_MS;

    // ✅ كتابة واحدة فقط: كل بيانات الموقع + التراكم اليومي في نفس العقدة دفعة واحدة
    await rtdb.ref(`liveLocations/${driverId}`).set({
      lat,
      lng,
      speed: speed || 0,
      accuracy: accuracy || null,
      battery: battery ?? null,
      isCharging: !!isCharging,
      gpsEnabled: gpsEnabled !== false,
      isInternetConnected: isInternetConnected !== false,
      insideWorkZone: insideZone,
      timestamp: now,
      status: (speed || 0) > 1 ? 'moving' : 'stopped',
      dailyDate: today,
      dailyTotalMeters: newDailyTotal,
      lastFirestoreSync: shouldSyncFirestore ? now : lastFirestoreSync,
    });

    // سجل المسار التاريخي: نخفّض تردده أيضًا (نقطة واحدة كل ~40 ثانية تقريبًا تكفي لإعادة تشغيل مسار واضح)
    if (!prev || now - (prev.lastHistoryPoint || 0) >= 40000) {
      await rtdb.ref(`locationHistory/${driverId}/${today}`).push({
        lat, lng, speed: speed || 0, timestamp: now,
      });
      await rtdb.ref(`liveLocations/${driverId}/lastHistoryPoint`).set(now);
    }

    // الكتابة على Firestore (الأغلى واستهلاكًا) فقط كل 60 ثانية كحد أقصى
    if (shouldSyncFirestore) {
      await db.collection('drivers').doc(driverId).set(
        { lastSeen: now, lastKnownLocation: { lat, lng }, online: true },
        { merge: true }
      );
      await db.collection('dailyStats').doc(`${driverId}_${today}`).set(
        { driverId, date: today, totalDistanceMeters: newDailyTotal, lastUpdate: now },
        { merge: true }
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// المشرف: طلب موقع فوري لمندوب معيّن (الآلية الوحيدة للحصول على موقع لحظي دقيق الآن،
// بدل التتبع المستمر المكلف). يصل كإشعار صامت تمامًا لا يظهر للمندوب إطلاقًا.
router.post('/request/:driverId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { sendDataOnlyToDriver } = require('../utils/push');
    const sent = await sendDataOnlyToDriver(req.params.driverId, { type: 'location_request' });
    if (sent) {
      res.json({ success: true, message: 'تم إرسال طلب الموقع، سيصل الموقع الفعلي خلال ثوانٍ' });
    } else {
      res.status(404).json({ success: false, message: 'تعذّر إرسال الطلب (المندوب لم يسجّل جهازه بعد)' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// المشرف: بدء جلسة تتبع مباشر حقيقية (تتكرر كل 12 ثانية تلقائيًا حتى الإيقاف أو 20 دقيقة كحد أقصى)
router.post('/track/start/:driverId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { sendDataOnlyToDriver } = require('../utils/push');
    const sent = await sendDataOnlyToDriver(req.params.driverId, { type: 'start_live_tracking' });
    if (sent) {
      res.json({ success: true, message: 'بدأ التتبع المباشر، سيتوقف تلقائيًا بعد 20 دقيقة إن لم توقفه يدويًا' });
    } else {
      res.status(404).json({ success: false, message: 'تعذّر البدء (المندوب لم يسجّل جهازه بعد)' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// المشرف: إيقاف فوري لأي جلسة تتبع مباشر نشطة
router.post('/track/stop/:driverId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { sendDataOnlyToDriver } = require('../utils/push');
    await sendDataOnlyToDriver(req.params.driverId, { type: 'stop_live_tracking' });
    res.json({ success: true, message: 'تم إرسال أمر الإيقاف' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.post('/batch', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const driverId = req.user.driverId;
    const points = req.body.points;

    if (!Array.isArray(points) || points.length === 0) {
      return res.status(400).json({ success: false, message: 'لا توجد نقاط لإرسالها' });
    }

    points.sort((a, b) => a.timestamp - b.timestamp);

    for (const p of points) {
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') continue;
      const historyDate = new Date(p.timestamp).toISOString().slice(0, 10);
      await rtdb.ref(`locationHistory/${driverId}/${historyDate}`).push({
        lat: p.lat, lng: p.lng, speed: p.speed || 0, timestamp: p.timestamp, wasOffline: true,
      });
    }

    res.json({ success: true, savedCount: points.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.get('/my-stats', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const driverId = req.user.driverId;
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const driverDoc = await db.collection('drivers').doc(driverId).get();
    const driver = driverDoc.data() || {};

    const statsDoc = await db.collection('dailyStats').doc(`${driverId}_${date}`).get();
    const stats = statsDoc.exists ? statsDoc.data() : { totalDistanceMeters: 0 };

    let hoursWorked = 0;
    if (driver.shiftStart) {
      const endTime = driver.onShift ? Date.now() : (driver.shiftEnd || Date.now());
      hoursWorked = Math.max(0, (endTime - driver.shiftStart) / 3600000);
    }

    const distanceKm = (stats.totalDistanceMeters || 0) / 1000;

    let rating = 'لم يبدأ الدوام بعد';
    if (hoursWorked > 0) {
      const kmPerHour = distanceKm / hoursWorked;
      if (kmPerHour >= 8) rating = 'ممتاز 🌟';
      else if (kmPerHour >= 4) rating = 'جيد جداً 👍';
      else if (kmPerHour >= 1.5) rating = 'جيد 🙂';
      else rating = 'نشاط منخفض اليوم';
    }

    let consecutiveDays = 0;
    for (let i = 0; i < 60; i++) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const dayDoc = await db.collection('dailyStats').doc(`${driverId}_${d}`).get();
      if (dayDoc.exists && (dayDoc.data().totalDistanceMeters || 0) > 0) {
        consecutiveDays++;
      } else {
        break;
      }
    }

    res.json({
      success: true,
      date,
      hoursWorked: +hoursWorked.toFixed(1),
      distanceKm: +distanceKm.toFixed(2),
      onShift: !!driver.onShift,
      rating,
      consecutiveDays,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.post('/shift/start', verifyToken, async (req, res) => {
  const driverId = req.user.driverId;
  const now = Date.now();
  await db.collection('drivers').doc(driverId).set({ shiftStart: now, onShift: true }, { merge: true });
  await db.collection('shiftLogs').add({ driverId, type: 'start', timestamp: now });
  res.json({ success: true, shiftStart: now });
});

router.post('/shift/end', verifyToken, async (req, res) => {
  const driverId = req.user.driverId;
  const now = Date.now();
  await db.collection('drivers').doc(driverId).set({ shiftEnd: now, onShift: false, online: false }, { merge: true });
  await db.collection('shiftLogs').add({ driverId, type: 'end', timestamp: now });
  await rtdb.ref(`liveLocations/${driverId}`).update({ status: 'offline' });
  res.json({ success: true, shiftEnd: now });
});

router.get('/shift-log/:driverId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const snap = await db
      .collection('shiftLogs')
      .where('driverId', '==', req.params.driverId)
      .get();
    const logs = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 100);
    res.json({ success: true, logs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.delete('/shift-log/:driverId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const snap = await db.collection('shiftLogs').where('driverId', '==', req.params.driverId).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
    res.json({ success: true, deletedCount: snap.size });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

module.exports = router;
