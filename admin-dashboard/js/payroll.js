const token = sessionStorage.getItem('nahj_admin_token');
if (!token) window.location.href = 'login.html';

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.href = 'login.html';
});

let driversList = [];
let deductions = [];

async function loadDrivers() {
  const res = await fetch(`${NAHJ_API_URL}/drivers`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.success) {
    driversList = data.drivers;
    document.getElementById('payrollDriverSelect').innerHTML = driversList
      .map((d) => `<option value="${d.id}">${d.name} (#${d.driverCode})</option>`)
      .join('');
  }
}
loadDrivers();

const now = new Date();
document.getElementById('payrollMonth').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

// ================= إعدادات الأسعار =================
async function loadRates() {
  try {
    const res = await fetch(`${NAHJ_API_URL}/payroll/rates`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.success) {
      const r = data.rates;
      document.getElementById('rateOrderPrice').value = r.orderPrice;
      document.getElementById('rateExtraKm').value = r.extraKmPrice;
      document.getElementById('rateFreeKm').value = r.freeKmThreshold;
      document.getElementById('bonusA').value = r.ratingBonus.A;
      document.getElementById('bonusB').value = r.ratingBonus.B;
      document.getElementById('bonusC').value = r.ratingBonus.C;
      document.getElementById('bonusD').value = r.ratingBonus.D;
      document.getElementById('bonusE').value = r.ratingBonus.E;
      document.getElementById('bonusF').value = r.ratingBonus.F;
    }
  } catch (_) {}
}
loadRates();

document.getElementById('saveRatesBtn').addEventListener('click', async () => {
  const msg = document.getElementById('ratesMsg');
  const rates = {
    orderPrice: Number(document.getElementById('rateOrderPrice').value) || 0,
    extraKmPrice: Number(document.getElementById('rateExtraKm').value) || 0,
    freeKmThreshold: Number(document.getElementById('rateFreeKm').value) || 0,
    ratingBonus: {
      A: Number(document.getElementById('bonusA').value) || 0,
      B: Number(document.getElementById('bonusB').value) || 0,
      C: Number(document.getElementById('bonusC').value) || 0,
      D: Number(document.getElementById('bonusD').value) || 0,
      E: Number(document.getElementById('bonusE').value) || 0,
      F: Number(document.getElementById('bonusF').value) || 0,
    },
  };
  try {
    const res = await fetch(`${NAHJ_API_URL}/payroll/rates`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(rates),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      msg.textContent = '✅ تم حفظ الإعدادات بنجاح';
      msg.style.color = '#16a34a';
    } else {
      msg.textContent = '❌ فشل الحفظ: ' + (data.message || 'خطأ');
      msg.style.color = '#dc2626';
    }
  } catch (_) {
    msg.textContent = '❌ تعذّر الاتصال بالخادم';
    msg.style.color = '#dc2626';
  }
});

// ================= الخصومات المفتوحة =================
function renderDeductions() {
  const container = document.getElementById('deductionsList');
  container.innerHTML = deductions
    .map(
      (d, i) => `
    <div class="deduction-row">
      <input type="text" placeholder="نوع الخصم (مثال: سلفة نقدية)" value="${d.label}" onchange="window.updateDeduction(${i}, 'label', this.value)">
      <input type="number" placeholder="المبلغ" value="${d.amount}" style="max-width:120px;" onchange="window.updateDeduction(${i}, 'amount', this.value)">
      <button onclick="window.removeDeduction(${i})" style="padding:8px 12px;background:#dc2626;color:#fff;border:none;border-radius:6px;cursor:pointer;">✕</button>
    </div>`
    )
    .join('');
  updateSummary();
}

window.updateDeduction = function (index, field, value) {
  deductions[index][field] = field === 'amount' ? Number(value) || 0 : value;
  updateSummary();
};

window.removeDeduction = function (index) {
  deductions.splice(index, 1);
  renderDeductions();
};

document.getElementById('addDeductionBtn').addEventListener('click', () => {
  deductions.push({ label: '', amount: 0 });
  renderDeductions();
});

// ================= الحساب التلقائي المباشر أثناء الكتابة =================
function getCurrentRates() {
  return {
    orderPrice: Number(document.getElementById('rateOrderPrice').value) || 0,
    extraKmPrice: Number(document.getElementById('rateExtraKm').value) || 0,
    freeKmThreshold: Number(document.getElementById('rateFreeKm').value) || 0,
    ratingBonus: {
      A: Number(document.getElementById('bonusA').value) || 0,
      B: Number(document.getElementById('bonusB').value) || 0,
      C: Number(document.getElementById('bonusC').value) || 0,
      D: Number(document.getElementById('bonusD').value) || 0,
      E: Number(document.getElementById('bonusE').value) || 0,
      F: Number(document.getElementById('bonusF').value) || 0,
    },
  };
}

function updateSummary() {
  const rates = getCurrentRates();
  const totalOrders = Number(document.getElementById('entryOrders').value) || 0;
  const totalDistanceKm = Number(document.getElementById('entryDistance').value) || 0;
  const grade = document.getElementById('entryGrade').value;
  const override = document.getElementById('entryDeliveryValueOverride').value;

  const deliveryValue = override ? Number(override) : totalOrders * rates.orderPrice;
  const extraKm = Math.max(0, totalDistanceKm - rates.freeKmThreshold * totalOrders);
  const distanceValue = extraKm * rates.extraKmPrice;
  const bonusPerOrder = rates.ratingBonus[grade] || 0;
  const bonusTotal = bonusPerOrder * totalOrders;

  const totalBefore = deliveryValue + distanceValue + bonusTotal;
  const deductionsTotal = deductions.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const totalAfter = Math.max(0, totalBefore - deductionsTotal);

  document.getElementById('summaryBox').style.display = 'block';
  document.getElementById('sumDelivery').textContent = deliveryValue.toFixed(2) + ' ريال';
  document.getElementById('sumDistance').textContent = distanceValue.toFixed(2) + ' ريال';
  document.getElementById('sumBonus').textContent = bonusTotal.toFixed(2) + ' ريال';
  document.getElementById('sumBefore').textContent = totalBefore.toFixed(2) + ' ريال';
  document.getElementById('sumDeductions').textContent = '-' + deductionsTotal.toFixed(2) + ' ريال';
  document.getElementById('sumAfter').textContent = totalAfter.toFixed(2) + ' ريال';
}

['entryOrders', 'entryDistance', 'entryGrade', 'entryDeliveryValueOverride'].forEach((id) => {
  document.getElementById(id).addEventListener('input', updateSummary);
  document.getElementById(id).addEventListener('change', updateSummary);
});

// ================= تحميل بيانات شهر سابق =================
document.getElementById('loadEntryBtn').addEventListener('click', async () => {
  const driverId = document.getElementById('payrollDriverSelect').value;
  const month = document.getElementById('payrollMonth').value;
  if (!driverId || !month) return alert('اختر المندوب والشهر أولًا');

  try {
    const res = await fetch(`${NAHJ_API_URL}/payroll/${driverId}/${month}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.success && data.found) {
      const e = data.entry;
      document.getElementById('entryOrders').value = e.totalOrders || '';
      document.getElementById('entryDistance').value = e.totalDistanceKm || '';
      document.getElementById('entryGrade').value = e.grade || '';
      document.getElementById('entryDeliveryValueOverride').value = '';
      document.getElementById('entryNotes').value = e.notes || '';
      deductions = e.deductions || [];
      renderDeductions();
      alert('✅ تم تحميل بيانات هذا الشهر، يمكنك التعديل والحفظ');
    } else {
      deductions = [];
      renderDeductions();
      document.getElementById('entryOrders').value = '';
      document.getElementById('entryDistance').value = '';
      document.getElementById('entryGrade').value = '';
      document.getElementById('entryNotes').value = '';
      alert('لا توجد بيانات سابقة لهذا الشهر، يمكنك إدخالها من جديد');
    }
  } catch (_) {
    alert('❌ تعذّر الاتصال بالخادم');
  }
});

// ================= الحفظ النهائي =================
document.getElementById('saveEntryBtn').addEventListener('click', async () => {
  const driverId = document.getElementById('payrollDriverSelect').value;
  const month = document.getElementById('payrollMonth').value;
  const msg = document.getElementById('entryMsg');

  if (!driverId || !month) {
    msg.textContent = 'اختر المندوب والشهر أولًا';
    msg.style.color = '#dc2626';
    return;
  }

  const override = document.getElementById('entryDeliveryValueOverride').value;
  const payload = {
    totalOrders: Number(document.getElementById('entryOrders').value) || 0,
    totalDistanceKm: Number(document.getElementById('entryDistance').value) || 0,
    grade: document.getElementById('entryGrade').value || null,
    totalDeliveryValue: override ? Number(override) : undefined,
    deductions: deductions.filter((d) => d.label && d.amount),
    notes: document.getElementById('entryNotes').value.trim(),
  };

  try {
    const res = await fetch(`${NAHJ_API_URL}/payroll/${driverId}/${month}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      msg.textContent = '✅ تم حفظ المستحقات بنجاح ووصل إشعار فوري للمندوب.';
      msg.style.color = '#16a34a';
    } else {
      msg.textContent = '❌ فشل الحفظ: ' + (data.message || 'خطأ غير معروف');
      msg.style.color = '#dc2626';
    }
  } catch (_) {
    msg.textContent = '❌ تعذّر الاتصال بالخادم';
    msg.style.color = '#dc2626';
  }
});

// ================= طلبات السلف =================
async function loadAdvances() {
  const container = document.getElementById('advancesList');
  try {
    const res = await fetch(`${NAHJ_API_URL}/payroll/advance`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!data.success || data.requests.length === 0) {
      container.innerHTML = '<p style="color:#94a3b8;">لا توجد طلبات سلف</p>';
      return;
    }
    const driversMap = {};
    driversList.forEach((d) => (driversMap[d.id] = d));

    container.innerHTML = data.requests
      .map((r) => {
        const d = driversMap[r.driverId] || {};
        const time = new Date(r.createdAt).toLocaleString('ar-SA', { year: 'numeric', month: 'numeric', day: 'numeric' });
        const statusLabel = { pending: '⏳ قيد المراجعة', approved: '✅ مقبولة', rejected: '❌ مرفوضة' }[r.status];
        const actions = r.status === 'pending'
          ? `<button onclick="window.decideAdvance('${r.id}','approved')" style="background:#16a34a;color:#fff;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;">قبول</button>
             <button onclick="window.decideAdvance('${r.id}','rejected')" style="background:#dc2626;color:#fff;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;margin-right:4px;">رفض</button>`
          : '';
        return `
          <div style="background:#f8fafc;border-radius:8px;padding:12px;margin-bottom:8px;">
            <b>${d.name || r.driverId}</b> (#${d.driverCode || ''}) — ${time}<br>
            المبلغ: ${r.amount} ريال — السبب: ${r.reason || '--'}<br>
            الحالة: ${statusLabel} ${actions}
          </div>`;
      })
      .join('');
  } catch (_) {
    container.innerHTML = '<p style="color:#dc2626;">تعذّر تحميل الطلبات</p>';
  }
}

window.decideAdvance = async function (id, status) {
  try {
    const res = await fetch(`${NAHJ_API_URL}/payroll/advance/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      loadAdvances();
    } else {
      alert('❌ فشل: ' + (data.message || 'خطأ غير معروف'));
    }
  } catch (_) {
    alert('❌ تعذّر الاتصال بالخادم');
  }
};

document.getElementById('loadAdvancesBtn').addEventListener('click', loadAdvances);
setTimeout(loadAdvances, 500);
