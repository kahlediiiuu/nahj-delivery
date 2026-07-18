const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken);

// المندوب يقدّم طلب إجازة (سبب + تاريخ مطلوب + ملاحظة اختيارية)
router.post('/', async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const { reasonType, date, note } = req.body;
    if (!reasonType || !date) {
      return res.status(400).json({ success: false, message: 'حدد سبب الإجازة وتاريخها' });
    }

    const docRef = await db.collection('leaveRequests').add({
      driverId: req.user.driverId,
      reasonType, // 'sick' | 'emergency' | 'personal' | 'other'
      date,
      note: note || '',
      status: 'pending', // pending | approved | rejected
      createdAt: Date.now(),
    });

    res.json({ success: true, id: docRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// المندوب يشاهد طلباته السابقة فقط
router.get('/my', async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    // ملاحظة: نتجنب .orderBy() هنا عمدًا لأن Firestore يتطلب "فهرسًا مركّبًا" (Composite Index)
    // عند دمج where + orderBy على حقلين مختلفين، وإن لم يُنشَأ هذا الفهرس مسبقًا فالاستعلام يفشل بالكامل بصمت.
    // الحل: نجلب البيانات ونرتّبها داخل الخادم مباشرة (آمن دائمًا، بدون أي إعداد إضافي مطلوب).
    const snap = await db
      .collection('leaveRequests')
      .where('driverId', '==', req.user.driverId)
      .get();
    const requests = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => b.createdAt - a.createdAt);
    res.json({ success: true, requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.get('/', requireAdmin, async (req, res) => {
  try {
    const snap = await db.collection('leaveRequests').get();
    let requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (req.query.status) requests = requests.filter((r) => r.status === req.query.status);
    requests.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ success: true, requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// المشرف: قبول أو رفض طلب إجازة
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { status, adminNote } = req.body; // 'approved' | 'rejected'
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'حالة غير صحيحة' });
    }
    const doc = await db.collection('leaveRequests').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });

    await db.collection('leaveRequests').doc(req.params.id).update({
      status,
      decidedAt: Date.now(),
      adminNote: adminNote || '',
    });

    // إشعار فوري للمندوب بالقرار (مع الملاحظة إن وُجدت - مثل طلب توثيق سبب الغياب)
    const { sendPushToDriver } = require('../utils/push');
    const statusText = status === 'approved' ? '✅ تم قبول طلب إجازتك' : '❌ تم رفض طلب إجازتك';
    const text = adminNote ? `${statusText}\nملاحظة الإدارة: ${adminNote}` : statusText;
    await db.collection('messages').add({
      driverId: doc.data().driverId,
      sender: 'admin',
      text,
      createdAt: Date.now(),
      readByAdmin: true,
      readByDriver: false,
    });
    await sendPushToDriver(doc.data().driverId, statusText, adminNote || 'راجع تطبيقك للتفاصيل', {});

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

module.exports = router;
