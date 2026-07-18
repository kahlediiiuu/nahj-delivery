const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function computeTotal(ranges) {
  return ranges.reduce((sum, r) => {
    const start = timeToMinutes(r.start);
    let end = timeToMinutes(r.end);
    if (end < start) end += 24 * 60; // دعم فترة تمتد بعد منتصف الليل
    return sum + (end - start);
  }, 0);
}

// المندوب يضيف فترة عمل جديدة لليوم (مثال: 05:00 - 07:00) - لا علاقة لها إطلاقًا بتتبع الموقع
router.post('/', async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const { date, start, end } = req.body;
    if (!date || !start || !end) {
      return res.status(400).json({ success: false, message: 'التاريخ ووقت البداية والنهاية مطلوبة' });
    }
    if (timeToMinutes(start) === timeToMinutes(end)) {
      return res.status(400).json({ success: false, message: 'وقت البداية والنهاية لا يمكن أن يتطابقا' });
    }

    const docId = `${req.user.driverId}_${date}`;
    const docRef = db.collection('workHours').doc(docId);
    const doc = await docRef.get();
    const ranges = doc.exists ? (doc.data().ranges || []) : [];
    ranges.push({ start, end });
    ranges.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

    await docRef.set({
      driverId: req.user.driverId,
      date,
      ranges,
      totalMinutes: computeTotal(ranges),
      updatedAt: Date.now(),
    });

    res.json({ success: true, ranges, totalMinutes: computeTotal(ranges) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// حذف فترة معيّنة من فترات ذلك اليوم
router.delete('/:date/:index', async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const { date, index } = req.params;
    const docId = `${req.user.driverId}_${date}`;
    const docRef = db.collection('workHours').doc(docId);
    const doc = await docRef.get();
    if (!doc.exists) return res.json({ success: true, ranges: [], totalMinutes: 0 });

    const ranges = doc.data().ranges || [];
    ranges.splice(Number(index), 1);
    await docRef.set({ ranges, totalMinutes: computeTotal(ranges), updatedAt: Date.now() }, { merge: true });

    res.json({ success: true, ranges, totalMinutes: computeTotal(ranges) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// المندوب يشاهد فترات يوم معيّن
router.get('/my', async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const doc = await db.collection('workHours').doc(`${req.user.driverId}_${date}`).get();
    if (!doc.exists) return res.json({ success: true, date, ranges: [], totalMinutes: 0 });
    res.json({ success: true, date, ranges: doc.data().ranges || [], totalMinutes: doc.data().totalMinutes || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// المندوب يشاهد سجل آخر 14 يومًا كإحصائية
router.get('/my/history', async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const days = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      days.push(d);
    }
    const docs = await Promise.all(
      days.map((d) => db.collection('workHours').doc(`${req.user.driverId}_${d}`).get())
    );
    const history = docs
      .map((doc, i) => ({
        date: days[i],
        totalMinutes: doc.exists ? doc.data().totalMinutes || 0 : 0,
        rangesCount: doc.exists ? (doc.data().ranges || []).length : 0,
      }))
      .filter((h) => h.totalMinutes > 0);

    res.json({ success: true, history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

module.exports = router;
