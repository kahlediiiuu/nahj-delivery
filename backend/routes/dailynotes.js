const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken);

const MAX_ATTACHMENT_SIZE = 700 * 1024;

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
      type,
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

router.get('/my', async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const snap = await db
      .collection('dailyNotes')
      .where('driverId', '==', req.user.driverId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    res.json({ success: true, notes: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.get('/', requireAdmin, async (req, res) => {
  try {
    let query = db.collection('dailyNotes').orderBy('createdAt', 'desc').limit(200);
    const snap = await query.get();
    let notes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (req.query.type) notes = notes.filter((n) => n.type === req.query.type);
    res.json({ success: true, notes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.patch('/:id/seen', requireAdmin, async (req, res) => {
  try {
    await db.collection('dailyNotes').doc(req.params.id).update({ seenByAdmin: true });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

module.exports = router;
