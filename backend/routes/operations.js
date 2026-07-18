const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { sendPushToDriver } = require('../utils/push');

router.use(verifyToken);

router.post('/upload', requireAdmin, async (req, res) => {
  try {
    const { date, records, confirmReplace } = req.body;
    if (!date || !Array.isArray(records)) {
      return res.status(400).json({ success: false, message: 'بيانات غير صالحة' });
    }

    if (!confirmReplace) {
      const existingSnap = await db.collection('dailyOperations').where('date', '==', date).limit(1).get();
      if (!existingSnap.empty) {
        return res.status(409).json({
          success: false,
          duplicate: true,
          message: `تم رفع تقرير تشغيل لهذا اليوم (${date}) مسبقًا، هل ترغب في استبداله؟`,
        });
      }
    }

    const batchWrites = records.map((r) => {
      if (!r.driverId) return null;
      return db.collection('dailyOperations').doc(`${r.driverId}_${date}`).set({
        driverId: r.driverId,
        date,
        city: r.city || '',
        contractName: r.contractName || '',
        vehicleName: r.vehicleName || '',
        batchNumber: r.batchNumber || '',
        tgaStatus: r.tgaStatus || '',
        errorCodes: r.errorCodes || '',
        shiftsCount: r.shiftsCount || 0,
        workingDays: r.workingDays || 0,
        plannedWorkingHours: r.plannedWorkingHours || 0,
        actualWorkingHours: r.actualWorkingHours || 0,
        avgWorkingHoursPerDay: r.avgWorkingHoursPerDay || 0,
        attendanceRate: r.attendanceRate || 0,
        breakHours: r.breakHours || 0,
        lostHours: r.lostHours || 0,
        acceptanceRate: r.acceptanceRate || 0,
        contactRate: r.contactRate || 0,
        noShows: r.noShows || 0,
        noShowRate: r.noShowRate || 0,
        notifiedDeliveries: r.notifiedDeliveries || 0,
        completedDeliveries: r.completedDeliveries || 0,
        acceptedDeliveries: r.acceptedDeliveries || 0,
        stackedDeliveries: r.stackedDeliveries || 0,
        declinedDeliveries: r.declinedDeliveries || 0,
        cancelledDeliveries: r.cancelledDeliveries || 0,
        deductionDeliveries: r.deductionDeliveries || 0,
        notAcceptedDeliveries: r.notAcceptedDeliveries || 0,
        manualUndispatched: r.manualUndispatched || 0,
        notes: r.notes || '',
        uploadedAt: Date.now(),
      });
    }).filter(Boolean);

    await Promise.all(batchWrites);

    if (!confirmReplace) {
      const notifyWrites = records.map((r) => {
        if (!r.driverId) return null;
        const text = `📈 تقرير تشغيلك ليوم ${date} جاهز الآن! ساعات العمل: ${r.actualWorkingHours || 0} ساعة، نسبة الحضور: ${r.attendanceRate || 0}%`;
        return sendPushToDriver(r.driverId, '📈 تقرير التشغيل جاهز', text, { type: 'operations', date });
      }).filter(Boolean);
      await Promise.all(notifyWrites);
    }

    res.json({ success: true, count: batchWrites.length });
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
    const driverDoc = await db.collection('drivers').doc(req.user.driverId).get();
    if (driverDoc.data()?.hideReports === true) {
      return res.json({ success: true, found: false, hidden: true });
    }

    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const doc = await db.collection('dailyOperations').doc(`${req.user.driverId}_${date}`).get();
    if (!doc.exists) return res.json({ success: true, date, found: false });

    const d = doc.data();
    res.json({
      success: true,
      date,
      found: true,
      city: d.city,
      shiftsCount: d.shiftsCount,
      workingDays: d.workingDays,
      plannedWorkingHours: d.plannedWorkingHours,
      actualWorkingHours: d.actualWorkingHours,
      avgWorkingHoursPerDay: d.avgWorkingHoursPerDay,
      attendanceRate: d.attendanceRate,
      breakHours: d.breakHours,
      acceptanceRate: d.acceptanceRate,
      noShows: d.noShows,
      noShowRate: d.noShowRate,
      notifiedDeliveries: d.notifiedDeliveries,
      completedDeliveries: d.completedDeliveries,
      acceptedDeliveries: d.acceptedDeliveries,
      stackedDeliveries: d.stackedDeliveries,
      declinedDeliveries: d.declinedDeliveries,
      cancelledDeliveries: d.cancelledDeliveries,
      deductionDeliveries: d.deductionDeliveries,
      notes: d.notes,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.get('/day', requireAdmin, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const snap = await db.collection('dailyOperations').where('date', '==', date).get();
    res.json({ success: true, date, records: snap.docs.map((d) => d.data()) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

router.patch('/:driverId/:date', requireAdmin, async (req, res) => {
  try {
    const { driverId, date } = req.params;
    await db.collection('dailyOperations').doc(`${driverId}_${date}`).set(req.body, { merge: true });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

module.exports = router;
