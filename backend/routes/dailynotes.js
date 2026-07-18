const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken);

const MAX_ATTACHMENT_SIZE = 700 * 1024; // نفس القيد المستخدم في نظام الرسائل (بدون تخزين سحابي مدفوع)

// المندوب يرسل ملاحظة سريعة (مطعم مغلق / عميل لا يرد / حادث / عطل / مشكلة تطبيق) مع صورة اختيارية
router.post('/', async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const { type, note, attachmentData, attachmentType } = req.body;
    if (!type) {
      return res.status(400).json({ success: false, message: 'حدد نوع الملاحظة' });
    }
    if (attachmentData) {
      const buffer = Buffer.from(attachmentData, 'base64');
      if (buffer.length > MAX_ATTACHMENT_SIZE) {
        return res.status(413).json({ success: false, message: 'حجم الصورة كبير جدًا (الحد الأقصى تقريبًا 700 كيلوبايت)' });
      }
    }

    const docRef = await db.collection('dailyNotes').add({
      driverId: req.user.driverId,
      type, // 'restaurant_closed' | 'customer_no_response' | 'accident' | 'malfunction' | 'app_issue' | 'other'
      note: note || '',
      attachmentData: attachmentData || null,
      attachmentType: attachmentType || null,
      createdAt: Date.now(),
      seenByAdmin: false,
    });

    res.json({ success: true, id: docRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// المندوب يشاهد ملاحظاته السابقة فقط
router.get('/my', async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const snap = await db
      .collection('dailyNotes')
      .where('driverId', '==', req.user.driverId)
      .get();
    const notes = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);
    res.json({ success: true, notes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// المشرف: عرض كل الملاحظات (يمكن تصفيتها حسب النوع أو الحالة)
router.get('/', requireAdmin, async (req, res) => {
  try {
    let query = db.collection('dailyNotes').orderBy('createdAt', 'desc').limit(200);
    const snap = await query.get();
    let notes = snap.docs.map((d) => {
      const data = d.data();
      // ⚠️ لا نُرسل الصورة الكاملة (base64) ضمن القائمة الإجمالية أبدًا - قد تكون كل صورة حتى 700 كيلوبايت،
      // و200 ملاحظة × 700KB = خطر حقيقي على ذاكرة الخادم المجانية. نكتفي بعلامة "توجد صورة" فقط هنا.
      const { attachmentData, ...rest } = data;
      return { id: d.id, ...rest, hasAttachment: !!attachmentData };
    });
    if (req.query.type) notes = notes.filter((n) => n.type === req.query.type);
    res.json({ success: true, notes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// المشرف: جلب ملاحظة واحدة كاملة مع صورتها (فقط عند الحاجة الفعلية لعرضها)
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const doc = await db.collection('dailyNotes').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ success: false, message: 'الملاحظة غير موجودة' });
    res.json({ success: true, note: { id: doc.id, ...doc.data() } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// المشرف: تعليم الملاحظة كمُطَّلَع عليها
router.patch('/:id/seen', requireAdmin, async (req, res) => {
  try {
    await db.collection('dailyNotes').doc(req.params.id).update({ seenByAdmin: true });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// المشرف: الرد على ملاحظة المندوب (مثال: "أرسل لي صورة إثبات") - يصل كإشعار فوري للمندوب
router.post('/:id/reply', requireAdmin, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'اكتب نص الرد أولًا' });
    }
    const doc = await db.collection('dailyNotes').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ success: false, message: 'الملاحظة غير موجودة' });

    await db.collection('dailyNotes').doc(req.params.id).update({
      response: text.trim(),
      respondedAt: Date.now(),
      seenByAdmin: true,
    });

    const { sendPushToDriver } = require('../utils/push');
    await sendPushToDriver(doc.data().driverId, '📝 ردّت الإدارة على ملاحظتك', text.trim(), {});

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// المشرف: تعديل رد سابق
router.patch('/:id/response', requireAdmin, async (req, res) => {
  try {
    const { response } = req.body;
    await db.collection('dailyNotes').doc(req.params.id).update({ response: response || '' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// المشرف: حذف الملاحظة نهائيًا
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.collection('dailyNotes').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// المندوب: يرد على رد الإدارة على ملاحظته (محادثة كاملة رد↔استقبال)
router.post('/:id/driver-reply', async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'اكتب ردك أولًا' });
    }
    const doc = await db.collection('dailyNotes').doc(req.params.id).get();
    if (!doc.exists || doc.data().driverId !== req.user.driverId) {
      return res.status(403).json({ success: false, message: 'غير مسموح' });
    }
    await db.collection('dailyNotes').doc(req.params.id).update({
      driverReply: text.trim(),
      driverRepliedAt: Date.now(),
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

module.exports = router;
