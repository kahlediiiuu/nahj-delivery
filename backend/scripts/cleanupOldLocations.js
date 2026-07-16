// شغّل هذا السكربت دورياً (يومياً) عبر Cron Job مجاني، مثال:
// - على Render.com: أنشئ "Cron Job" مجاني يشغّل: node scripts/cleanupOldLocations.js يومياً
// - أو محلياً عبر crontab: 0 3 * * * cd /path/to/backend && node scripts/cleanupOldLocations.js
require('dotenv').config();
const { rtdb } = require('../config/firebase');

const RETENTION_DAYS = 30;

async function run() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  const snap = await rtdb.ref('locationHistory').once('value');
  const allDrivers = snap.val() || {};
  let deletedDates = 0;

  for (const driverId of Object.keys(allDrivers)) {
    const dates = Object.keys(allDrivers[driverId]);
    for (const dateStr of dates) {
      const date = new Date(dateStr);
      if (date < cutoff) {
        await rtdb.ref(`locationHistory/${driverId}/${dateStr}`).remove();
        deletedDates++;
      }
    }
  }

  console.log(`✅ تم حذف ${deletedDates} يوم من سجلات التحركات القديمة (أقدم من ${RETENTION_DAYS} يوماً).`);
}

run().then(() => process.exit(0)).catch((err) => {
  console.error('فشل التنظيف:', err);
  process.exit(1);
});
