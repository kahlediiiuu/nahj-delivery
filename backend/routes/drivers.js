const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../config/firebase');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken, requireAdmin);

router.get('/', async (req, res) => {
  try {
    const { search, status } = req.query;
    let query = db.collection('drivers');
    if (status) query = query.where('status', '==', status);

    const snap = await query.get();
    let drivers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (search) {
      const s = search.toLowerCase();
      drivers = drivers.filter(
        (d) =>
          d.name?.toLowerCase().includes(s) ||
          d.phone?.includes(s) ||
          d.driverCode?.toLowerCase().includes(s)
      );
    }

    res.json({ success: true, drivers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, phone, driverCode, password } = req.body;
    if (!name || !phone || !driverCode || !password) {
      return res.status(400).json({ success: false, message: 'جميع الحقول مطلوبة' });
    }

    const existing = await db.collection('drivers').where('driverCode', '==', driverCode).limit(1).get();
    if (!existing.empty) {
      return res.status(409).json({ success: false, message: 'رقم المندوب مستخدم مسبقاً' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const docRef = await db.collection('drivers').add({
      name,
      phone,
      driverCode,
      passwordHash,
      status: 'active',
      online: false,
      createdAt: Date.now(),
    });

    res.json({ success: true, id: docRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, phone, matchCode } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (phone) updates.phone = phone;
    if (matchCode !== undefined) updates.matchCode = matchCode;
    await db.collection('drivers').doc(req.params.id).update(updates);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.patch('/:id/suspend', async (req, res) => {
  const { reason } = req.body;
  await db.collection('drivers').doc(req.params.id).update({
    status: 'suspended',
    suspendReason: reason || '',
    suspendedAt: Date.now(),
  });
  res.json({ success: true });
});

router.patch('/:id/activate', async (req, res) => {
  await db.collection('drivers').doc(req.params.id).update({
    status: 'active',
    suspendReason: '',
  });
  res.json({ success: true });
});

router.patch('/:id/toggle-login', async (req, res) => {
  const { disableLogin } = req.body;
  await db.collection('drivers').doc(req.params.id).update({ disableLogin: !!disableLogin });
  res.json({ success: true });
});

router.patch('/:id/toggle-reports', async (req, res) => {
  const { hideReports } = req.body;
  await db.collection('drivers').doc(req.params.id).update({ hideReports: !!hideReports });
  res.json({ success: true });
});

router.delete('/:id', async (req, res) => {
  await db.collection('drivers').doc(req.params.id).delete();
  res.json({ success: true });
});

module.exports = router;
