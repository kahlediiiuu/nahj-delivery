const { admin, db } = require('../config/firebase');

async function sendPushToDriver(driverId, title, body, data = {}, silent = false) {
  try {
    const doc = await db.collection('drivers').doc(driverId).get();
    const fcmToken = doc.data()?.fcmToken;
    if (!fcmToken) return;

    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: {
        priority: 'high',
        notification: {
          sound: silent ? undefined : 'default',
          channelId: silent ? 'nahj_messages_silent_channel' : 'nahj_messages_channel',
        },
      },
    });
  } catch (err) {
    console.error('تعذّر إرسال الإشعار الفوري:', err.message);
  }
}

module.exports = { sendPushToDriver };
