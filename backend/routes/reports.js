const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken, requireAdmin);

// تقرير مندوب واحد بين تاريخين (يومي/أسبوعي/شهري - نفس المنطق بفرق نطاق التاريخ)
router.get('/driver/:driverId', async (req, res) => {
  try {
    const { driverId } = req.params;
    const { from, to } = req.query; // صيغة YYYY-MM-DD

    const snap = await db
      .collection('dailyStats')
      .where('driverId', '==', driverId)
      .where('date', '>=', from)
      .where('date', '<=', to)
      .get();

    const days = snap.docs.map((d) => d.data());

    const totalDistanceMeters = days.reduce((sum, d) => sum + (d.totalDistanceMeters || 0), 0);
    const totalDisconnects = days.reduce((sum, d) => sum + (d.disconnectCount || 0), 0);
    const totalGpsOffCount = days.reduce((sum, d) => sum + (d.gpsOffCount || 0), 0);

    res.json({
      success: true,
      driverId,
      from,
      to,
      totalDistanceKm: (totalDistanceMeters / 1000).toFixed(2),
      totalDisconnects,
      totalGpsOffCount,
      daysCount: days.length,
      dailyBreakdown: days,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// إحصائيات لوحة المعلومات اللحظية
router.get('/dashboard-stats', async (req, res) => {
  try {
    const snap = await db.collection('drivers').get();
    const drivers = snap.docs.map((d) => d.data());
    const now = Date.now();

    const online = drivers.filter((d) => d.online && now - (d.lastSeen || 0) < 60000).length;
    const offline = drivers.length - online;

    res.json({
      success: true,
      totalDrivers: drivers.length,
      online,
      offline,
      onShift: drivers.filter((d) => d.onShift).length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// جلب مسار حركة مندوب في يوم محدد (لإعادة التشغيل على الخريطة)
router.get('/route/:driverId', async (req, res) => {
  try {
    const { rtdb } = require('../config/firebase');
    const { driverId } = req.params;
    const date = req.query.date; // YYYY-MM-DD

    if (!date) return res.status(400).json({ success: false, message: 'حدد التاريخ' });

    const snap = await rtdb.ref(`locationHistory/${driverId}/${date}`).once('value');
    const data = snap.val() || {};
    const points = Object.values(data).sort((a, b) => a.timestamp - b.timestamp);

    res.json({ success: true, driverId, date, points });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// لوحة أداء ومقارنة بين كل المناديب خلال فترة محددة
router.get('/leaderboard', async (req, res) => {
  try {
    const { from, to } = req.query; // YYYY-MM-DD
    if (!from || !to) return res.status(400).json({ success: false, message: 'حدد الفترة (from, to)' });

    const driversSnap = await db.collection('drivers').get();
    const drivers = driversSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const statsSnap = await db
      .collection('dailyStats')
      .where('date', '>=', from)
      .where('date', '<=', to)
      .get();

    const byDriver = {};
    statsSnap.docs.forEach((doc) => {
      const s = doc.data();
      if (!byDriver[s.driverId]) byDriver[s.driverId] = { totalDistanceMeters: 0, daysActive: 0 };
      byDriver[s.driverId].totalDistanceMeters += s.totalDistanceMeters || 0;
      byDriver[s.driverId].daysActive += 1;
    });

    const leaderboard = drivers
      .map((d) => {
        const stats = byDriver[d.id] || { totalDistanceMeters: 0, daysActive: 0 };
        const shiftHours =
          d.shiftStart && d.shiftEnd ? Math.max(0, (d.shiftEnd - d.shiftStart) / 3600000) : null;
        return {
          driverId: d.id,
          name: d.name,
          driverCode: d.driverCode,
          totalDistanceKm: +(stats.totalDistanceMeters / 1000).toFixed(2),
          daysActive: stats.daysActive,
          avgDistanceKmPerDay: stats.daysActive > 0 ? +(stats.totalDistanceMeters / 1000 / stats.daysActive).toFixed(2) : 0,
          lastShiftHours: shiftHours ? +shiftHours.toFixed(1) : null,
        };
      })
      .sort((a, b) => b.totalDistanceKm - a.totalDistanceKm);

    res.json({ success: true, from, to, leaderboard });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// تقرير شامل للمشرف: أداء كل المناديب في يوم محدد (طلبات ناجحة/فاشلة وأسبابها)
router.get('/orders-summary', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const driversSnap = await db.collection('drivers').get();
    const drivers = {};
    driversSnap.docs.forEach((d) => { drivers[d.id] = d.data(); });

    const ordersSnap = await db.collection('orders').where('date', '==', date).get();
    const allOrders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const byDriver = {};
    for (const driverId of Object.keys(drivers)) {
      byDriver[driverId] = {
        driverId,
        name: drivers[driverId].name,
        driverCode: drivers[driverId].driverCode,
        completed: 0,
        failed: 0,
        total: 0,
        failureReasons: {},
        verificationMethods: {},
        orders: [],
      };
    }

    for (const o of allOrders) {
      if (!byDriver[o.driverId]) continue; // مندوب محذوف لاحقاً، تجاهله
      const entry = byDriver[o.driverId];
      entry.total++;
      entry.orders.push(o);
      if (o.status === 'completed') {
        entry.completed++;
        if (o.verificationMethod) {
          entry.verificationMethods[o.verificationMethod] = (entry.verificationMethods[o.verificationMethod] || 0) + 1;
        }
      } else {
        entry.failed++;
        if (o.failureReason) {
          entry.failureReasons[o.failureReason] = (entry.failureReasons[o.failureReason] || 0) + 1;
        }
      }
    }

    const result = Object.values(byDriver).sort((a, b) => b.total - a.total);

    res.json({ success: true, date, drivers: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

module.exports = router;
