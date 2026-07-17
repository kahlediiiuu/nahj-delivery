const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { sendPushToDriver } = require('../utils/push');

router.use(verifyToken);

const MAX_ATTACHMENT_SIZE = 700 * 1024;

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { title, body, attachmentData, attachmentType } = req.body;
    if (!title || !body) {
      return res.status(400).json({ success: false, message: 'العنوان والمحتوى مطلوبان' });
    }
    if (attachmentData) {
      const buffer = Buffer.from(attachmentData, 'base64');
      if (buffer.length > MAX_ATTACHMENT_SIZE) {
        return res.status(413).json({ success: false, message: 'حجم الصورة كبير جدًا (الحد الأقصى تقريبًا 700 كيلوبايت)' });
      }
    }

    const docRef = await db.collection('announcements').add({
      title,
      body,
      attachmentData: attachmentData || null,
      attachmentType: attachmentType || null,
      createdAt: Date.now(),
    });

    const driversSnap = await db.collection('drivers').where('status', '==', 'active').get();
    await Promise.all(
      driversSnap.docs.map((d) => sendPushToDriver(d.id, `📢 ${title}`, body, { announcementId: docRef.id }))
    );

    res.json({ success: true, id: docRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.get('/', async (req, res) => {
  try {
    const snap = await db.collection('announcements').orderBy('createdAt', 'desc').limit(100).get();
    res.json({ success: true, announcements: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.collection('announcements').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.post('/:id/notes', async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const { note, attachmentData, attachmentType } = req.body;
    if (!note || !note.trim()) {
      return res.status(400).json({ success: false, message: 'اكتب ملاحظتك أولًا' });
    }
    if (attachmentData) {
      const buffer = Buffer.from(attachmentData, 'base64');
      if (buffer.length > MAX_ATTACHMENT_SIZE) {
        return res.status(413).json({ success: false, message: 'حجم الصورة كبير جدًا' });
      }
    }

    const docRef = await db.collection('announcementNotes').add({
      announcementId: req.params.id,
      driverId: req.user.driverId,
      note: note.trim(),
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

router.get('/:id/notes', requireAdmin, async (req, res) => {
  try {
    const snap = await db
      .collection('announcementNotes')
      .where('announcementId', '==', req.params.id)
      .orderBy('createdAt', 'desc')
      .get();
    res.json({ success: true, notes: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.get('/notes/all', requireAdmin, async (req, res) => {
  try {
    const snap = await db.collection('announcementNotes').orderBy('createdAt', 'desc').limit(100).get();
    res.json({ success: true, notes: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

module.exports = router;
