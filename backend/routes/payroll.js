const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { sendPushToDriver } = require('../utils/push');

router.use(verifyToken);

// ================= إعدادات الأسعار (قابلة للتعديل من لوحة التحكم دون لمس الكود) =================
const DEFAULT_RATES = {
  orderPrice: 8,           // سعر الطلب الواحد (ريال)
  extraKmPrice: 1.15,      // سعر كل كيلومتر إضافي بعد الحد المجاني
  freeKmThreshold: 20,     // عدد الكيلومترات المجانية ضمن الطلب
  ratingBonus: { A: 2.75, B: 2.25, C: 1.95, D: 1.25, E: 0, F: 0 }, // مكافأة التقييم لكل طلب حسب الفئة
};

router.get('/rates', requireAdmin, async (req, res) => {
  try {
    const doc = await db.collection('settings').doc('payrollRates').get();
    res.json({ success: true, rates: doc.exists ? doc.data() : DEFAULT_RATES });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.put('/rates', requireAdmin, async (req, res) => {
  try {
    await db.collection('settings').doc('payrollRates').set(req.body, { merge: true });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

async function getRates() {
  const doc = await db.collection('settings').doc('payrollRates').get();
  return doc.exists ? { ...DEFAULT_RATES, ...doc.data() } : DEFAULT_RATES;
}

// يحسب الإجمالي قبل وبعد الخصومات تلقائيًا بناءً على المدخلات والأسعار الحالية
function computeTotals(entry, rates) {
  const deliveryValue = (entry.totalOrders || 0) * rates.orderPrice;
  const extraKm = Math.max(0, (entry.totalDistanceKm || 0) - rates.freeKmThreshold * (entry.totalOrders || 0));
  const distanceValue = extraKm * rates.extraKmPrice;
  const ratingBonusPerOrder = rates.ratingBonus[entry.grade] || 0;
  const ratingBonusTotal = ratingBonusPerOrder * (entry.totalOrders || 0);

  const totalBeforeDeductions = deliveryValue + distanceValue + ratingBonusTotal;
  const deductionsTotal = (entry.deductions || []).reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const totalAfterDeductions = Math.max(0, totalBeforeDeductions - deductionsTotal);

  return { deliveryValue, distanceValue, ratingBonusPerOrder, ratingBonusTotal, totalBeforeDeductions, deductionsTotal, totalAfterDeductions };
}

// ================= إدخال/تعديل مستحقات مندوب لشهر معيّن (من لوحة التحكم يدويًا) =================
router.post('/:driverId/:month', requireAdmin, async (req, res) => {
  try {
    const { driverId, month } = req.params; // month بصيغة YYYY-MM
    const { totalOrders, totalDeliveryValue, totalDistanceKm, grade, deductions, notes } = req.body;

    const rates = await getRates();
    const entryInput = { totalOrders, totalDistanceKm, grade, deductions: deductions || [] };
    const computed = computeTotals(entryInput, rates);

    const finalEntry = {
      driverId,
      month,
      totalOrders: totalOrders || 0,
      totalDeliveryValue: totalDeliveryValue !== undefined ? totalDeliveryValue : computed.deliveryValue,
      totalDistanceKm: totalDistanceKm || 0,
      distanceValue: computed.distanceValue,
      grade: grade || null,
      ratingBonusPerOrder: computed.ratingBonusPerOrder,
      ratingBonusTotal: computed.ratingBonusTotal,
      deductions: deductions || [],
      totalBeforeDeductions: (totalDeliveryValue !== undefined ? totalDeliveryValue : computed.deliveryValue) + computed.distanceValue + computed.ratingBonusTotal,
      deductionsTotal: computed.deductionsTotal,
      totalAfterDeductions: 0,
      notes: notes || '',
      updatedAt: Date.now(),
    };
    finalEntry.totalAfterDeductions = Math.max(0, finalEntry.totalBeforeDeductions - finalEntry.deductionsTotal);

    await db.collection('payroll').doc(`${driverId}_${month}`).set(finalEntry);

    await sendPushToDriver(driverId, '💰 تحديث في مستحقاتك', `تم تحديث بيانات مستحقاتك لشهر ${month}، يمكنك مراجعتها الآن`, {});

    res.json({ success: true, entry: finalEntry });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// المشرف: عرض مستحقات مندوب معيّن لشهر معيّن
router.get('/:driverId/:month', requireAdmin, async (req, res) => {
  try {
    const doc = await db.collection('payroll').doc(`${req.params.driverId}_${req.params.month}`).get();
    if (!doc.exists) return res.json({ success: true, found: false });
    res.json({ success: true, found: true, entry: doc.data() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// المندوب: عرض مستحقاته الخاصة لشهر معيّن
router.get('/my', async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const doc = await db.collection('payroll').doc(`${req.user.driverId}_${month}`).get();
    if (!doc.exists) return res.json({ success: true, found: false, month });
    res.json({ success: true, found: true, month, ...doc.data() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// ================= طلبات السلف (المندوب يطلب، المشرف يوافق/يرفض) =================
router.post('/advance', async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const { amount, reason } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'أدخل مبلغًا صحيحًا' });
    }
    const docRef = await db.collection('advanceRequests').add({
      driverId: req.user.driverId,
      amount: Number(amount),
      reason: reason || '',
      status: 'pending',
      createdAt: Date.now(),
    });
    res.json({ success: true, id: docRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.get('/advance/my', async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'مسموح للمناديب فقط' });
    }
    const snap = await db.collection('advanceRequests').where('driverId', '==', req.user.driverId).get();
    const requests = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.createdAt - a.createdAt);
    res.json({ success: true, requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.get('/advance', requireAdmin, async (req, res) => {
  try {
    const snap = await db.collection('advanceRequests').get();
    let requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (req.query.status) requests = requests.filter((r) => r.status === req.query.status);
    requests.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ success: true, requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.patch('/advance/:id', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'حالة غير صحيحة' });
    }
    const doc = await db.collection('advanceRequests').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });

    await db.collection('advanceRequests').doc(req.params.id).update({ status, decidedAt: Date.now() });

    const statusText = status === 'approved' ? '✅ تم قبول طلب السلفة الخاص بك' : '❌ تم رفض طلب السلفة الخاص بك';
    await sendPushToDriver(doc.data().driverId, statusText, `المبلغ: ${doc.data().amount} ريال`, {});

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

module.exports = router;
