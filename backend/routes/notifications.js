const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken, requireAdmin);

/**
 * مسار خفيف جدًا للشارات (Badges) في شريط التنقل العلوي بلوحة التحكم.
 * لا يُحمِّل أي نص أو صور - فقط أعداد (count) عبر استعلامات Firestore الموجهة، لتفادي
 * أي خطر على الذاكرة (نفس الدرس المستفاد من مشكلة انهيار الخادم السابقة).
 */
router.get('/summary', async (req, res) => {
  try {
    const [unreadMessagesSnap, pendingLeaveSnap, driversSnap] = await Promise.all([
      db.collection('drivers').get(),
      db.collection('leaveRequests').where('status', '==', 'pending').get(),
      db.collection('drivers').get(),
    ]);

    const unreadMessagesCount = unreadMessagesSnap.docs.reduce((sum, d) => sum + (d.data().unreadFromDriverCount || 0), 0);

    // ملاحظات التقارير بانتظار الرد (مندوب أرسل، لا يوجد رد بعد)
    const commentsSnap = await db.collection('reportComments').where('sender', '==', 'driver').get();
    const pendingComments = commentsSnap.docs.filter((d) => !d.data().response).length;

    // ملاحظات/بلاغات يومية لم يطّلع عليها المشرف بعد
    const notesSnap = await db.collection('dailyNotes').where('seenByAdmin', '==', false).get();

    // طلبات سلف قيد المراجعة
    const advanceSnap = await db.collection('advanceRequests').where('status', '==', 'pending').get();

    res.json({
      success: true,
      unreadMessages: unreadMessagesCount,
      pendingLeaveRequests: pendingLeaveSnap.size,
      pendingReportComments: pendingComments,
      unseenDailyNotes: notesSnap.size,
      pendingAdvanceRequests: advanceSnap.size,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

module.exports = router;
