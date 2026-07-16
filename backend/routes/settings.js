const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.get('/workzone', verifyToken, requireAdmin, async (req, res) => {
  try {
    const doc = await db.collection('settings').doc('workzone').get();
    if (doc.exists) {
      res.json({ success: true, ...doc.data() });
    } else {
      res.json({
        success: true,
        lat: parseFloat(process.env.WORK_ZONE_LAT) || 24.7136,
        lng: parseFloat(process.env.WORK_ZONE_LNG) || 46.6753,
        radiusMeters: parseInt(process.env.WORK_ZONE_RADIUS_METERS) || 15000,
        isDefault: true,
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.put('/workzone', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { lat, lng, radiusMeters } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number' || typeof radiusMeters !== 'number') {
      return res.status(400).json({ success: false, message: 'بيانات غير صالحة' });
    }
    await db.collection('settings').doc('workzone').set({
      lat, lng, radiusMeters, updatedAt: Date.now(),
    });
    res.json({ success: true, message: 'تم تحديث نطاق العمل بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.put('/contact', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { whatsappNumber, phoneNumber } = req.body;
    await db.collection('settings').doc('contact').set({
      whatsappNumber: whatsappNumber || '',
      phoneNumber: phoneNumber || '',
      updatedAt: Date.now(),
    }, { merge: true });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.get('/contact', verifyToken, async (req, res) => {
  try {
    const doc = await db.collection('settings').doc('contact').get();
    res.json({ success: true, whatsappNumber: doc.data()?.whatsappNumber || '', phoneNumber: doc.data()?.phoneNumber || '' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

module.exports = router;
