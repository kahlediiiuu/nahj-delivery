const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { sendPushToDriver } = require('../utils/push');

router.use(verifyToken);

router.post('/', async (req, res) => {
  try {
    const { text, requiresResponse } = req.body;
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
      requiresResponse: sender === 'admin' ? !!requiresResponse : false,
      response: null,
    });

    if (sender === 'admin') {
      await sendPushToDriver(
        driverId,
        requiresResponse ? '⚠️ تنبيه يتطلب ردك الفوري' : '📩 رسالة جديدة من الإدارة',
        text.trim(),
        { messageId: docRef.id, requiresResponse: !!requiresResponse },
        !requiresResponse && req.body.silent === true
      );
    }

    res.json({ success: true, id: docRef.id, createdAt: now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.post('/:id/respond', async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const { response } = req.body;
    if (!response || !response.trim()) {
      return res.status(400).json({ success: false, message: 'الرد فارغ' });
    }
    await db.collection('messages').doc(req.params.id).update({
      response: response.trim(),
      respondedAt: Date.now(),
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.get('/driver/:driverId', requireAdmin, async (req, res) => {
  try {
    const snap = await db
      .collection('messages')
      .where('driverId', '==', req.params.driverId)
      .get();

    const messages = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.createdAt - b.createdAt);

    const unread = snap.docs.filter((d) => d.data().sender === 'driver' && !d.data().readByAdmin);
    await Promise.all(unread.map((d) => d.ref.update({ readByAdmin: true })));

    res.json({ success: true, messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

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

router.get('/my', async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const snap = await db
      .collection('messages')
      .where('driverId', '==', req.user.driverId)
      .get();

    const messages = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((m) => m.createdAt >= dayAgo)
      .sort((a, b) => a.createdAt - b.createdAt);

    const unread = snap.docs.filter((d) => d.data().sender === 'admin' && !d.data().readByDriver);
    await Promise.all(unread.map((d) => d.ref.update({ readByDriver: true })));

    res.json({ success: true, messages, expiryNote: 'تُحذف الرسائل تلقائياً من هنا بعد مرور 24 ساعة' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

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

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.collection('messages').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.post('/:id/resend', requireAdmin, async (req, res) => {
  try {
    const doc = await db.collection('messages').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ success: false, message: 'الرسالة غير موجودة' });
    const m = doc.data();
    await sendPushToDriver(m.driverId, '📩 رسالة (إعادة إرسال)', m.text, { messageId: doc.id });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.post('/broadcast', requireAdmin, async (req, res) => {
  try {
    const { target, texts, driverIds } = req.body;
    if (!texts || !texts.ar) {
      return res.status(400).json({ success: false, message: 'يجب كتابة النص العربي على الأقل' });
    }

    let query = db.collection('drivers').where('status', '==', 'active');
    const snap = await query.get();
    let targets = snap.docs;

    if (target === 'byIds' && Array.isArray(driverIds)) {
      targets = targets.filter((d) => driverIds.includes(d.id));
    }

    const writes = targets.map(async (doc) => {
      const driverLang = doc.data().language || 'ar';
      const text = texts[driverLang] || texts.ar;
      await db.collection('messages').add({
        driverId: doc.id,
        sender: 'admin',
        text,
        createdAt: Date.now(),
        readByAdmin: true,
        readByDriver: false,
      });
      await sendPushToDriver(doc.id, '📢 رسالة من الإدارة', text, {});
    });

    await Promise.all(writes);
    res.json({ success: true, count: targets.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});
router.delete('/driver/:driverId/all', requireAdmin, async (req, res) => {
  try {
    const snap = await db.collection('messages').where('driverId', '==', req.params.driverId).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
    res.json({ success: true, deletedCount: snap.size });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});
module.exports = router;
