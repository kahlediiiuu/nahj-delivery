const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken, requireAdmin);

// جلب إعدادات نطاق العمل الحالية
router.get('/workzone', async (req, res) => {
  try {
    const doc = await db.collection('settings').doc('workzone').get();
    if (doc.exists) {
      res.json({ success: true, ...doc.data() });
    } else {
      // القيم الافتراضية من متغيرات البيئة إن لم يُحدَّد شيء بعد من لوحة التحكم
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

// تحديث إعدادات نطاق العمل من لوحة التحكم
router.put('/workzone', async (req, res) => {
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

module.exports = router;
