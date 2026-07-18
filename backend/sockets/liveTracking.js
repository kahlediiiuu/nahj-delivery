const { rtdb, db } = require('../config/firebase');

// يبث تحديثات المواقع لحظيًا لكل المشرفين المتصلين بلوحة التحكم عبر Socket.io
function initLiveTracking(io) {
  const liveRef = rtdb.ref('liveLocations');

  // ⚠️ إصلاح تسريب ذاكرة حرج: كان الكود القديم يبث بيانات كل المناديب لكل المشرفين المتصلين
  // في كل مرة "أي" مندوب واحد يُحدِّث موقعه (كل 8 ثوانٍ لكل مندوب نشط) - مع عدة مناديب هذا يعني
  // بثًا متكررًا جدًا (أحيانًا عدة مرات في الثانية)، مما يُثقل ذاكرة Socket.io تدريجيًا حتى الانهيار.
  // الحل: تقييد البث الفعلي لمرة واحدة كحد أقصى كل 3 ثوانٍ (Throttle)، بغض النظر عن عدد التحديثات الواردة.
  let pendingBroadcast = null;
  let lastBroadcastTime = 0;
  const BROADCAST_MIN_INTERVAL_MS = 3000;

  function scheduleBroadcast(data) {
    const now = Date.now();
    const elapsed = now - lastBroadcastTime;

    if (elapsed >= BROADCAST_MIN_INTERVAL_MS) {
      lastBroadcastTime = now;
      io.emit('locations:update', data);
    } else if (!pendingBroadcast) {
      pendingBroadcast = setTimeout(() => {
        pendingBroadcast = null;
        lastBroadcastTime = Date.now();
        io.emit('locations:update', data);
      }, BROADCAST_MIN_INTERVAL_MS - elapsed);
    }
  }

  liveRef.on('value', (snapshot) => {
    const data = snapshot.val() || {};
    scheduleBroadcast(data);
  });

  const activeAlerts = new Set();

  setInterval(async () => {
    try {
      const snapshot = await liveRef.once('value');
      const data = snapshot.val() || {};
      const now = Date.now();
      const thresholdMs = (parseInt(process.env.INACTIVITY_ALERT_SECONDS) || 60) * 1000;

      const currentlyActive = new Set();
      const newAlerts = [];

      function check(driverId, type, isActive, extra = {}) {
        const key = `${driverId}:${type}`;
        if (isActive) {
          currentlyActive.add(key);
          if (!activeAlerts.has(key)) {
            newAlerts.push({ driverId, type, ...extra });
          }
        }
      }

      for (const [driverId, loc] of Object.entries(data)) {
        check(driverId, 'no_update', now - loc.timestamp > thresholdMs, { since: loc.timestamp });
        check(driverId, 'gps_off', loc.gpsEnabled === false);
        check(driverId, 'internet_off', loc.isInternetConnected === false);
        check(driverId, 'outside_zone', loc.insideWorkZone === false);
        check(
          driverId,
          'low_battery',
          loc.battery !== null && loc.battery <= (parseInt(process.env.LOW_BATTERY_PERCENT) || 15) && !loc.isCharging,
          { battery: loc.battery }
        );
      }

      activeAlerts.clear();
      currentlyActive.forEach((k) => activeAlerts.add(k));

      if (newAlerts.length > 0) {
        io.emit('alerts:new', newAlerts);
      }
    } catch (err) {
      // معالجة صريحة تمنع تراكم أخطاء "غير معالَجة" (Unhandled Rejections) عند تكرار هذا كل 15 ثانية لساعات
      console.error('خطأ في فحص التنبيهات الدوري:', err.message);
    }
  }, 15000);

  io.on('connection', (socket) => {
    console.log('لوحة تحكم متصلة:', socket.id);

    socket.on('request:locations', async () => {
      try {
        const snapshot = await liveRef.once('value');
        socket.emit('locations:update', snapshot.val() || {});
      } catch (_) {}
    });

    socket.on('disconnect', () => console.log('لوحة تحكم انفصلت:', socket.id));
  });
}

module.exports = { initLiveTracking };
