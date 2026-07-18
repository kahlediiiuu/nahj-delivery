const { admin, db } = require('../config/firebase');

/**
 * يرسل إشعار Push حقيقي لجهاز مندوب معيّن (يظهر في شريط الإشعارات حتى لو كان
 * التطبيق مغلقًا تمامًا)، بشرط أن يكون قد سجّل رمز جهازه مسبقًا بعد تسجيل الدخول.
 *
 * tag: إن أُعطي، فأي إشعار جديد بنفس الـ tag "يستبدل" الإشعار السابق في شريط الإشعارات
 * بدل تكديس إشعار جديد فوقه - هذا هو أساس ميزة "دمج الإشعارات" (مثال: nahj_messages).
 * التنبيهات الحرجة/الإلزامية يجب ألا تستخدم tag (أو تستخدم tag فريدًا) لتبقى ظاهرة منفصلة دائمًا.
 */
async function sendPushToDriver(driverId, title, body, data = {}, silent = false, tag = null) {
  try {
    const doc = await db.collection('drivers').doc(driverId).get();
    const fcmToken = doc.data()?.fcmToken;
    if (!fcmToken) return; // المندوب لم يسجّل رمز جهازه بعد (مثلاً لم يحدّث التطبيق بعد)

    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: {
        priority: 'high',
        notification: {
          sound: silent ? undefined : 'default',
          channelId: silent ? 'nahj_messages_silent_channel' : 'nahj_messages_channel',
          tag: tag || undefined,
        },
      },
    });
  } catch (err) {
    // فشل الإرسال (مثل انتهاء صلاحية الرمز) لا يجب أن يوقف بقية العملية أبداً
    console.error('تعذّر إرسال الإشعار الفوري:', err.message);
  }
}

module.exports = { sendPushToDriver };
