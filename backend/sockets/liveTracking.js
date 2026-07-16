const { rtdb, db } = require('../config/firebase');

function initLiveTracking(io) {
  const liveRef = rtdb.ref('liveLocations');

  liveRef.on('value', (snapshot) => {
    const data = snapshot.val() || {};
    io.emit('locations:update', data);
  });

  const activeAlerts = new Set();

  setInterval(async () => {
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
