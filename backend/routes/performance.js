const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const gradeInfo = {
  A: { emoji: '👑', label: 'نخبة متميزة (A)', color: 'green' },
  B: { emoji: '🥈', label: 'أداء جيد جدًا (B)', color: 'green' },
  C: { emoji: '🥉', label: 'أداء متوسط (C)', color: 'yellow' },
  D: { emoji: '⚠️', label: 'يحتاج تحسينًا - قائمة المتابعة (D)', color: 'red' },
};

router.post('/upload', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { date, records } = req.body;
    if (!date || !Array.isArray(records)) {
      return res.status(400).json({ success: false, message: 'بيانات غير صالحة' });
    }

    const batchWrites = records.map((r) => {
      if (!r.driverId) return null;
      const grade = gradeInfo[r.grade] ? r.grade : null;
      return db.collection('dailyPerformance').doc(`${r.driverId}_${date}`).set({
        driverId: r.driverId,
        date,
        ordersAccepted: r.ordersAccepted || 0,
        ordersRejected: r.ordersRejected || 0,
        verificationCount: r.verificationCount || 0,
        categoryLabel: grade ? gradeInfo[grade].label : (r.categoryLabel || ''),
        categoryColor: grade ? gradeInfo[grade].color : (r.categoryColor || 'gray'),
        grade: grade || null,
        notes: r.notes || '',
        uploadedAt: Date.now(),
      });
    }).filter(Boolean);

    await Promise.all(batchWrites);

    const notifyWrites = records.map((r) => {
      if (!r.driverId) return null;
      const grade = gradeInfo[r.grade];
      const gradeText = grade ? `${grade.emoji} تصنيفك: ${grade.label}` : '';
      const text = `📊 تقريرك ليوم ${date} جاهز الآن!\n${gradeText}\n✅ مقبولة: ${r.ordersAccepted || 0} | ❌ مرفوضة: ${r.ordersRejected || 0}`;
      return db.collection('messages').add({
        driverId: r.driverId,
        sender: 'admin',
        text,
        createdAt: Date.now(),
        readByAdmin: true,
        readByDriver: false,
      });
    }).filter(Boolean);

    await Promise.all(notifyWrites);

    res.json({ success: true, count: batchWrites.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.get('/day', verifyToken, requireAdmin, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const snap = await db.collection('dailyPerformance').where('date', '==', date).get();
    const records = snap.docs.map((d) => d.data());
    res.json({ success: true, date, records });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.get('/my', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const doc = await db.collection('dailyPerformance').doc(`${req.user.driverId}_${date}`).get();

    if (!doc.exists) {
      return res.json({ success: true, date, found: false });
    }
    res.json({ success: true, date, found: true, ...doc.data() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

module.exports = router;
