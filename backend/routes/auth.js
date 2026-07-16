const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db } = require('../config/firebase');
const { verifyToken } = require('../middleware/auth');

router.post('/driver/fcm-token', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ success: false, message: 'الرمز مطلوب' });
    await db.collection('drivers').doc(req.user.driverId).set({ fcmToken }, { merge: true });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'أدخل اسم المستخدم وكلمة المرور' });
    }

    const snap = await db.collection('admins').where('username', '==', username).limit(1).get();
    if (snap.empty) {
      return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
    }

    const adminDoc = snap.docs[0];
    const admin = adminDoc.data();
    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
    }

    const token = jwt.sign({ id: adminDoc.id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, name: admin.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.post('/driver/login', async (req, res) => {
  try {
    const { driverCode, password } = req.body;
    if (!driverCode || !password) {
      return res.status(400).json({ success: false, message: 'أدخل رقم المندوب وكلمة المرور' });
    }

    const snap = await db.collection('drivers').where('driverCode', '==', driverCode).limit(1).get();
    if (snap.empty) {
      return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
    }

    const driverDoc = snap.docs[0];
    const driver = driverDoc.data();

    if (driver.status === 'suspended') {
      return res.status(403).json({ success: false, message: driver.suspendReason ? `تم إيقاف هذا الحساب: ${driver.suspendReason}` : 'تم إيقاف هذا الحساب، تواصل مع الإدارة' });
    }
    if (driver.disableLogin === true) {
      return res.status(403).json({ success: false, message: 'تم تعطيل تسجيل الدخول لهذا الحساب مؤقتاً، تواصل مع الإدارة' });
    }

    const valid = await bcrypt.compare(password, driver.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
    }

    const token = jwt.sign(
      { id: driverDoc.id, driverId: driverDoc.id, role: 'driver' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      driver: { id: driverDoc.id, name: driver.name, driverCode: driver.driverCode, phone: driver.phone },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.post('/admin/change-password', async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'غير مصرح' });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(403).json({ success: false, message: 'الجلسة منتهية، سجّل الدخول مجدداً' });
    }
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'هذه الميزة للمشرف فقط' });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'أدخل كلمة المرور الحالية والجديدة' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل' });
    }

    const adminDoc = await db.collection('admins').doc(decoded.id).get();
    if (!adminDoc.exists) {
      return res.status(404).json({ success: false, message: 'الحساب غير موجود' });
    }

    const admin = adminDoc.data();
    const valid = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'كلمة المرور الحالية غير صحيحة' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.collection('admins').doc(decoded.id).update({ passwordHash: newHash });

    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.post('/admin/change-username', async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'غير مصرح' });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(403).json({ success: false, message: 'الجلسة منتهية، سجّل الدخول مجدداً' });
    }
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'هذه الميزة للمشرف فقط' });
    }

    const { currentPassword, newUsername } = req.body;
    if (!currentPassword || !newUsername) {
      return res.status(400).json({ success: false, message: 'أدخل كلمة المرور الحالية واسم المستخدم الجديد' });
    }

    const adminDoc = await db.collection('admins').doc(decoded.id).get();
    if (!adminDoc.exists) {
      return res.status(404).json({ success: false, message: 'الحساب غير موجود' });
    }
    const admin = adminDoc.data();
    const valid = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'كلمة المرور الحالية غير صحيحة' });
    }

    const existing = await db.collection('admins').where('username', '==', newUsername).limit(1).get();
    if (!existing.empty && existing.docs[0].id !== decoded.id) {
      return res.status(409).json({ success: false, message: 'اسم المستخدم هذا مستخدم مسبقاً' });
    }

    await db.collection('admins').doc(decoded.id).update({ username: newUsername });
    res.json({ success: true, message: 'تم تغيير اسم المستخدم بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.post('/admin/create', async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'غير مصرح' });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(403).json({ success: false, message: 'الجلسة منتهية، سجّل الدخول مجدداً' });
    }
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'هذه الميزة للمشرف فقط' });
    }

    const { name, username, password } = req.body;
    if (!name || !username || !password) {
      return res.status(400).json({ success: false, message: 'جميع الحقول مطلوبة' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }

    const existing = await db.collection('admins').where('username', '==', username).limit(1).get();
    if (!existing.empty) {
      return res.status(409).json({ success: false, message: 'اسم المستخدم هذا مستخدم مسبقاً' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await db.collection('admins').add({ username, passwordHash, name, createdAt: Date.now() });

    res.json({ success: true, message: 'تم إنشاء حساب المشرف الجديد بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

module.exports = router;
