const express = require('express');
const router = express.Router();
const { db, bucket } = require('../config/firebase');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { sendPushToDriver } = require('../utils/push');
const crypto = require('crypto');

router.use(verifyToken);

const MAX_FILE_SIZE = 5 * 1024 * 1024;

router.post('/', async (req, res) => {
  try {
    const { fileBase64, fileName, mimeType, caption, driverId: bodyDriverId, requiresResponse } = req.body;

    if (!fileBase64 || !fileName) {
      return res.status(400).json({ success: false, message: 'الملف مطلوب' });
    }

    const buffer = Buffer.from(fileBase64, 'base64');
    if (buffer.length > MAX_FILE_SIZE) {
      return res.status(413).json({ success: false, message: 'حجم الملف كبير جدًا (الحد الأقصى 5 ميجابايت)' });
    }

    let driverId;
    let sender;
    if (req.user.role === 'admin') {
      driverId = bodyDriverId;
      sender = 'admin';
      if (!driverId) return res.status(400).json({ success: false, message: 'حدد المندوب' });
    } else {
      driverId = req.user.driverId;
      sender = 'driver';
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const storagePath = `attachments/${driverId}/${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safeName}`;
    const fileRef = bucket.file(storagePath);
    await fileRef.save(buffer, { metadata: { contentType: mimeType || 'application/octet-stream' } });
    await fileRef.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    const now = Date.now();
    const docRef = await db.collection('messages').add({
      driverId,
      sender,
      text: caption || (sender === 'admin' ? '📎 ملف مرفق من الإدارة' : '📎 ملف مرفق من المندوب'),
      attachmentUrl: publicUrl,
      attachmentType: mimeType || '',
      attachmentName: fileName,
      createdAt: now,
      readByAdmin: sender === 'admin',
      readByDriver: sender === 'driver',
      requiresResponse: sender === 'admin' ? !!requiresResponse : false,
      response: null,
    });

    if (sender === 'admin') {
      await sendPushToDriver(driverId, '📎 وصلك ملف جديد من الإدارة', caption || fileName, { messageId: docRef.id });
    }

    res.json({ success: true, id: docRef.id, url: publicUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'تعذّر رفع الملف، حاول مجددًا' });
  }
});

module.exports = router;
