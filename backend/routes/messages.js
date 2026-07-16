const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.use(verifyToken);

// إرسال رسالة (يستخدمه المشرف بتحديد driverId، أو المندوب لنفسه تلقائياً)
router.post('/', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'الرسالة فارغة' });
    }

    let driverId;
    let sender;

    if (req.user.role === 'admin') {
      driverId = req.body.driverId;
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
      text: text.trim(),
      createdAt: now,
      readByAdmin: sender === 'admin',
      readByDriver: sender === 'driver',
    });

    res.json({ success: true, id: docRef.id, createdAt: now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// المشرف: جلب محادثة كاملة مع مندوب محدد
router.get('/driver/:driverId', requireAdmin, async (req, res) => {
  try {
    const snap = await db
      .collection('messages')
      .where('driverId', '==', req.params.driverId)
      .get();

    const messages = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.createdAt - b.createdAt);

    // تعليم رسائل المندوب كمقروءة من المشرف
    const unread = snap.docs.filter((d) => d.data().sender === 'driver' && !d.data().readByAdmin);
    await Promise.all(unread.map((d) => d.ref.update({ readByAdmin: true })));

    res.json({ success: true, messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// المشرف: قائمة كل المحادثات مع عدد الرسائل غير المقروءة لكل مندوب
router.get('/conversations', requireAdmin, async (req, res) => {
  try {
    const driversSnap = await db.collection('drivers').get();
    const messagesSnap = await db.collection('messages').get();
    const allMessages = messagesSnap.docs.map((d) => d.data());

    const result = driversSnap.docs.map((d) => {
      const driverMessages = allMessages.filter((m) => m.driverId === d.id);
      const unread = driverMessages.filter((m) => m.sender === 'driver' && !m.readByAdmin).length;
      const last = driverMessages.sort((a, b) => b.createdAt - a.createdAt)[0];
      return {
        driverId: d.id,
        name: d.data().name,
        driverCode: d.data().driverCode,
        unreadCount: unread,
        lastMessage: last ? last.text : null,
        lastMessageAt: last ? last.createdAt : null,
      };
    });

    result.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
    res.json({ success: true, conversations: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// المندوب: جلب محادثته الخاصة مع المشرف
router.get('/my', async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const snap = await db
      .collection('messages')
      .where('driverId', '==', req.user.driverId)
      .get();

    const messages = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.createdAt - b.createdAt);

    const unread = snap.docs.filter((d) => d.data().sender === 'admin' && !d.data().readByDriver);
    await Promise.all(unread.map((d) => d.ref.update({ readByDriver: true })));

    res.json({ success: true, messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// المندوب: هل توجد رسائل جديدة؟ (فحص سريع وخفيف للاستطلاع الدوري)
router.get('/my/unread-count', async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const snap = await db
      .collection('messages')
      .where('driverId', '==', req.user.driverId)
      .where('sender', '==', 'admin')
      .where('readByDriver', '==', false)
      .get();
    res.json({ success: true, unreadCount: snap.size });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

module.exports = router;
