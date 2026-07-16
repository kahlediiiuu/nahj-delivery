const { admin, db } = require('../config/firebase');

async function sendPushToDriver(driverId, title, body, data = {}) {
  try {
    const doc = await db.collection('drivers').doc(driverId).get();
    const fcmToken = doc.data()?.fcmToken;
    if (!fcmToken) return;

    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: { priority: 'high', notification: { sound: 'default', channelId: 'nahj_messages_channel' } },
    });
  } catch (err) {
    console.error('تعذّر إرسال الإشعار الفوري:', err.message);
  }
}

module.exports = { sendPushToDriver };
