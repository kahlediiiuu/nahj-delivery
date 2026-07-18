const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const gradeInfo = {
  A: { emoji: '👑', label: 'نخبة متميزة (A)', color: 'gold' },
  B: { emoji: '🥈', label: 'أداء جيد جدًا (B)', color: 'silver' },
  C: { emoji: '🥉', label: 'أداء متوسط (C)', color: 'yellow' },
  D: { emoji: '🔸', label: 'أداء دون المتوسط (D)', color: 'yellow' },
  E: { emoji: '🔻', label: 'ضعيف - يحتاج متابعة (E)', color: 'red' },
  F: { emoji: '⚠️', label: 'قائمة الخطر (F)', color: 'red' },
};

router.post('/upload', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { date, records, confirmReplace } = req.body;
    if (!date || !Array.isArray(records)) {
      return res.status(400).json({ success: false, message: 'بيانات غير صالحة' });
    }

    if (!confirmReplace) {
      const existingSnap = await db.collection('dailyPerformance').where('date', '==', date).limit(1).get();
      if (!existingSnap.empty) {
        return res.status(409).json({
          success: false,
          duplicate: true,
          message: `تم رفع تقرير لهذا اليوم (${date}) مسبقًا، هل ترغب في استبداله؟`,
        });
      }
    }

    const batchWrites = records.map((r) => {
      if (!r.driverId) return null;
      const grade = gradeInfo[r.grade] ? r.grade : null;
      return db.collection('dailyPerformance').doc(`${r.driverId}_${date}`).set({
        driverId: r.driverId,
        date,
        city: r.city || '',
        grossOrders: r.grossOrders || 0,
        completedOrders: r.completedOrders || 0,
        completedOrdersInTime: r.completedOrdersInTime || 0,
        failedOrders: r.failedOrders || 0,
        onTimeDeliveryScore: r.onTimeDeliveryScore || 0,
        verificationSuccessRate: r.verificationSuccessRate || 0,
        finalQualityScore: r.finalQualityScore || 0,
        ordersAccepted: r.completedOrders || 0,
        ordersRejected: r.failedOrders || 0,
        verificationCount: r.totalVerificationRequests || 0,
        categoryLabel: grade ? gradeInfo[grade].label : (r.categoryLabel || ''),
        categoryColor: grade ? gradeInfo[grade].color : (r.categoryColor || 'gray'),
        grade: grade || null,
        notes: r.notes || '',
        uploadedAt: Date.now(),
      });
    }).filter(Boolean);

    await Promise.all(batchWrites);

    if (!confirmReplace) {
      const notifyWrites = records.map((r) => {
        if (!r.driverId) return null;
        const grade = gradeInfo[r.grade];
        const gradeText = grade ? `${grade.emoji} تصنيفك: ${grade.label}` : '';
        const text = `📊 تقريرك ليوم ${date} جاهز الآن!\n${gradeText}\n✅ منجزة: ${r.completedOrders || 0}/${r.grossOrders || 0} | ⏱️ في الوقت: ${r.onTimeDeliveryScore || 0}%`;
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
    }

    const allDriversSnap = await db.collection('drivers').where('status', '==', 'active').get();
    const presentIds = new Set(records.filter((r) => r.driverId).map((r) => r.driverId));
    const absentWrites = allDriversSnap.docs
      .filter((d) => !presentIds.has(d.id))
      .map((d) =>
        db.collection('absences').doc(`${d.id}_${date}`).set({
          driverId: d.id,
          date,
          note: '',
          createdAt: Date.now(),
        })
      );
    await Promise.all(absentWrites);

    res.json({ success: true, count: batchWrites.length, absentCount: absentWrites.length });
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

const gradeThresholds = [
  { grade: 'A', min: 0.90 },
  { grade: 'B', min: 0.75 },
  { grade: 'C', min: 0.60 },
  { grade: 'D', min: 0.45 },
  { grade: 'E', min: 0.30 },
  { grade: 'F', min: 0 },
];

function analyzeReasons(d) {
  const reasons = [];
  const tips = [];

  if ((d.onTimeDeliveryScore || 0) < 85) {
    reasons.push('انخفاض نسبة الالتزام بوقت التوصيل');
    tips.push('حافظ على الوصول في الوقت المحدد لأكثر من 90% من طلباتك');
  }
  if ((d.verificationSuccessRate || 0) < 90) {
    reasons.push('انخفاض نسبة نجاح التحقق من التسليم');
    tips.push('تأكد من إتمام خطوة التحقق (توقيع/صورة/رمز) في كل عملية تسليم');
  }
  if ((d.failedOrders || 0) > 0 && d.grossOrders && (d.failedOrders / d.grossOrders) > 0.05) {
    reasons.push('ارتفاع عدد الطلبات الفاشلة نسبيًا');
    tips.push('قلل الطلبات الفاشلة عبر التواصل المبكر مع العميل عند وجود مشكلة بالعنوان');
  }
  if ((d.finalQualityScore || 0) < 0.6) {
    reasons.push('انخفاض عام في درجة جودة التوصيل');
  }
  if (reasons.length === 0) {
    reasons.push('أداء متوازن في كل المؤشرات الرئيسية');
  }
  if (tips.length === 0) {
    tips.push('استمر بنفس المستوى، وحافظ على انتظامك اليومي لتصل للفئة الذهبية');
  }

  return { reasons, tips };
}

function computeProgress(finalQualityScore) {
  const score = finalQualityScore || 0;
  const currentIndex = gradeThresholds.findIndex((g) => score >= g.min);
  if (currentIndex <= 0) return null;
  const nextGrade = gradeThresholds[currentIndex - 1];
  const currentGrade = gradeThresholds[currentIndex];
  const pointsNeeded = Math.max(0, nextGrade.min - score);
  const rangeSize = nextGrade.min - currentGrade.min;
  const progressWithinRange = rangeSize > 0 ? (score - currentGrade.min) / rangeSize : 0;
  return {
    nextGrade: nextGrade.grade,
    pointsNeeded: +(pointsNeeded * 100).toFixed(1),
    progressPercent: Math.max(0, Math.min(100, +(progressWithinRange * 100).toFixed(0))),
  };
}

router.get('/my', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const driverDoc = await db.collection('drivers').doc(req.user.driverId).get();
    if (driverDoc.data()?.hideReports === true) {
      return res.json({ success: true, found: false, hidden: true });
    }
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const doc = await db.collection('dailyPerformance').doc(`${req.user.driverId}_${date}`).get();

    if (!doc.exists) {
      return res.json({ success: true, date, found: false });
    }

    const d = doc.data();
    const { reasons, tips } = analyzeReasons(d);
    const progress = computeProgress(d.finalQualityScore);

    let comparison = null;
    try {
      const prevDate = new Date(new Date(date).getTime() - 86400000).toISOString().slice(0, 10);
      const prevDoc = await db.collection('dailyPerformance').doc(`${req.user.driverId}_${prevDate}`).get();
      if (prevDoc.exists) {
        const prevScore = prevDoc.data().finalQualityScore || 0;
        const currScore = d.finalQualityScore || 0;
        const diff = +((currScore - prevScore) * 100).toFixed(1);
        comparison = { diffPercent: diff, improved: diff >= 0 };
      }
    } catch (_) {}

    res.json({
      success: true,
      date,
      found: true,
      ...d,
      reasons,
      tips,
      progress,
      comparison,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.get('/absences', verifyToken, requireAdmin, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const snap = await db.collection('absences').where('date', '==', date).get();
    res.json({ success: true, date, absences: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.patch('/absences/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { note } = req.body;
    await db.collection('absences').doc(req.params.id).update({ note: note || '' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.patch('/:driverId/:date', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { driverId, date } = req.params;
    const allowedFields = ['ordersAccepted', 'ordersRejected', 'verificationCount', 'categoryLabel', 'categoryColor', 'grade', 'notes'];
    const updates = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    await db.collection('dailyPerformance').doc(`${driverId}_${date}`).set(updates, { merge: true });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.post('/:driverId/:date/comments', verifyToken, async (req, res) => {
  try {
    const { driverId, date } = req.params;
    if (req.user.role === 'driver' && req.user.driverId !== driverId) {
      return res.status(403).json({ success: false, message: 'غير مسموح' });
    }
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'اكتب تعليقك أولًا' });
    }
    const docRef = await db.collection('reportComments').add({
      driverId,
      date,
      sender: req.user.role,
      text: text.trim(),
      createdAt: Date.now(),
      requiresResponse: false,
      response: null,
    });
    res.json({ success: true, id: docRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.post('/comments/:commentId/reply', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { text, requiresResponse } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'اكتب الرد أولًا' });
    }
    const commentDoc = await db.collection('reportComments').doc(req.params.commentId).get();
    if (!commentDoc.exists) return res.status(404).json({ success: false, message: 'التعليق غير موجود' });

    await db.collection('reportComments').doc(req.params.commentId).update({
      response: text.trim(),
      respondedAt: Date.now(),
      requiresResponse: !!requiresResponse,
    });

    const { sendPushToDriver } = require('../utils/push');
    await sendPushToDriver(
      commentDoc.data().driverId,
      requiresResponse ? '⚠️ رد يتطلب ردك على تقريرك' : '📊 ردّت الإدارة على ملاحظتك',
      text.trim(),
      {}
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.patch('/comments/:commentId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { response } = req.body;
    await db.collection('reportComments').doc(req.params.commentId).update({ response: response || '' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.delete('/comments/:commentId', verifyToken, requireAdmin, async (req, res) => {
  try {
    await db.collection('reportComments').doc(req.params.commentId).delete();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.get('/:driverId/:date/comments', verifyToken, async (req, res) => {
  try {
    const { driverId, date } = req.params;
    if (req.user.role === 'driver' && req.user.driverId !== driverId) {
      return res.status(403).json({ success: false, message: 'غير مسموح' });
    }
    const snap = await db
      .collection('reportComments')
      .where('driverId', '==', driverId)
      .where('date', '==', date)
      .get();
    const comments = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.createdAt - b.createdAt);
    res.json({ success: true, comments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

module.exports = router;
