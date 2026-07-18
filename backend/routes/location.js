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
  if (workZoneCache && now - workZoneCacheTime < 60000) {
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

async function isInsideWorkZone(lat, lng) {
  const zone = await getWorkZone();
  return distanceMeters(lat, lng, zone.lat, zone.lng) <= zone.radiusMeters;
}

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

    const insideZone = await isInsideWorkZone(lat, lng);

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

    const locationData = {
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
    };

    await rtdb.ref(`liveLocations/${driverId}`).set(locationData);

    const historyDate = new Date(now).toISOString().slice(0, 10);
    await rtdb.ref(`locationHistory/${driverId}/${historyDate}`).push({
      lat, lng, speed: speed || 0, timestamp: now,
    });

    await db.collection('drivers').doc(driverId).set(
      {
        lastSeen: now,
        lastKnownLocation: { lat, lng },
        online: true,
      },
      { merge: true }
    );

    const today = new Date(now).toISOString().slice(0, 10);
    const dailyStatsRef = db.collection('dailyStats').doc(`${driverId}_${today}`);
    await dailyStatsRef.set(
      {
        driverId,
        date: today,
        totalDistanceMeters: admin.firestore.FieldValue.increment(distanceDelta),
        lastUpdate: now,
      },
      { merge: true }
    );

    res.json({ success: true });
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
