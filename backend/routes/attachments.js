const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { verifyToken } = require('../middleware/auth');
const { sendPushToDriver } = require('../utils/push');

router.use(verifyToken);

const MAX_FILE_SIZE = 700 * 1024;

router.post('/', async (req, res) => {
  try {
    const { fileBase64, fileName, mimeType, caption, driverId: bodyDriverId, requiresResponse } = req.body;

    if (!fileBase64 || !fileName) {
      return res.status(400).json({ success: false, message: 'الملف مطلوب' });
    }

    const buffer = Buffer.from(fileBase64, 'base64');
    if (buffer.length > MAX_FILE_SIZE) {
      return res.status(413).json({ success: false, message: 'حجم الملف كبير جدًا (الحد الأقصى 700 كيلوبايت تقريبًا)' });
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

    const now = Date.now();
    const docRef = await db.collection('messages').add({
      driverId,
      sender,
      text: caption || (sender === 'admin' ? '📎 ملف مرفق من الإدارة' : '📎 ملف مرفق من المندوب'),
      attachmentData: fileBase64,
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

    res.json({ success: true, id: docRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'تعذّر رفع الملف، حاول مجددًا' });
  }
});

module.exports = router;
