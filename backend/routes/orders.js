const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// إضافة نتيجة توصيل جديدة (يستخدمها المندوب فقط)
router.post('/', async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const driverId = req.user.driverId;
    const { status, failureReason, verificationMethod, note } = req.body;

    if (!['completed', 'failed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'حالة غير صالحة' });
    }
    if (status === 'failed' && !failureReason) {
      return res.status(400).json({ success: false, message: 'حدد سبب الفشل' });
    }

    const now = Date.now();
    const date = new Date(now).toISOString().slice(0, 10);

    const docRef = await db.collection('orders').add({
      driverId,
      date,
      status,
      failureReason: status === 'failed' ? failureReason : null,
      verificationMethod: status === 'completed' ? (verificationMethod || null) : null,
      note: note || null,
      createdAt: now,
    });

    res.json({ success: true, id: docRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// جلب كل توصيلات المندوب في يوم محدد + ملخص الأداء
router.get('/day', async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const driverId = req.user.driverId;
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const snap = await db
      .collection('orders')
      .where('driverId', '==', driverId)
      .where('date', '==', date)
      .get();

    const orders = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => b.createdAt - a.createdAt);

    const completed = orders.filter((o) => o.status === 'completed').length;
    const failed = orders.filter((o) => o.status === 'failed').length;

    res.json({
      success: true,
      date,
      orders,
      summary: { total: orders.length, completed, failed },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// حذف تسجيل توصيل (فقط صاحبه)
router.delete('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const doc = await db.collection('orders').doc(req.params.id).get();
    if (!doc.exists || doc.data().driverId !== req.user.driverId) {
      return res.status(404).json({ success: false, message: 'العنصر غير موجود' });
    }
    await db.collection('orders').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

module.exports = router;
