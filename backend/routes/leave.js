const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken);

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
      reasonType,
      date,
      note: note || '',
      status: 'pending',
      createdAt: Date.now(),
    });

    res.json({ success: true, id: docRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.get('/my', async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const snap = await db
      .collection('leaveRequests')
      .where('driverId', '==', req.user.driverId)
      .orderBy('createdAt', 'desc')
      .get();
    res.json({ success: true, requests: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.get('/', requireAdmin, async (req, res) => {
  try {
    let query = db.collection('leaveRequests');
    if (req.query.status) query = query.where('status', '==', req.query.status);
    const snap = await query.orderBy('createdAt', 'desc').get();
    res.json({ success: true, requests: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'حالة غير صحيحة' });
    }
    await db.collection('leaveRequests').doc(req.params.id).update({ status, decidedAt: Date.now() });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

module.exports = router;
