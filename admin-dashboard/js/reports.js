const API_URL = NAHJ_API_URL;
const token = sessionStorage.getItem('nahj_admin_token');
if (!token) window.location.href = 'login.html';

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.href = 'login.html';
});

// ------- التبويبات -------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ------- تحميل قائمة المناديب -------
let driversList = [];
async function loadDriversList() {
  const res = await fetch(`${API_URL}/drivers`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.success) {
    driversList = data.drivers;
    const select = document.getElementById('replayDriverSelect');
    select.innerHTML = driversList.map((d) => `<option value="${d.id}">${d.name} (#${d.driverCode})</option>`).join('');
  }
}
loadDriversList().then(() => {
  // إن جاء المستخدم من رابط "متابعة مسار الحركة" في الخريطة، افتح تبويب المسار مباشرة واختر المندوب تلقائيًا
  const params = new URLSearchParams(window.location.search);
  const requestedDriverId = params.get('driverId');
  const requestedTab = params.get('tab');

  if (requestedTab === 'replay') {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    const routeTabBtn = document.querySelector('.tab-btn[data-tab="replay"]');
    if (routeTabBtn) routeTabBtn.classList.add('active');
    const routeTabPanel = document.getElementById('tab-replay');
    if (routeTabPanel) routeTabPanel.classList.add('active');
  }

  if (requestedDriverId) {
    const select = document.getElementById('replayDriverSelect');
    select.value = requestedDriverId;
    document.getElementById('loadRouteBtn')?.click();
  }
});

// ================= إعادة تشغيل المسار (Replay) =================
const replayMap = L.map('replayMap').setView([24.7136, 46.6753], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(replayMap);

// توسيط الخريطة تلقائيًا على نطاق العمل الحقيقي المحفوظ (بدل الرياض الثابتة)
(async function centerReplayMapOnWorkZone() {
  try {
    const res = await fetch(`${API_URL}/settings/workzone`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.success && data.lat && data.lng) {
      replayMap.setView([data.lat, data.lng], 12);
    }
  } catch (_) {}
})();

let routePoints = [];
let routeLine = null;
let routeMarker = null;
let playInterval = null;

document.getElementById('replayDate').valueAsDate = new Date();

document.getElementById('loadRouteBtn').addEventListener('click', async () => {
  const driverId = document.getElementById('replayDriverSelect').value;
  const date = document.getElementById('replayDate').value;
  if (!driverId || !date) return alert('اختر المندوب والتاريخ');

  const res = await fetch(`${API_URL}/reports/route/${driverId}?date=${date}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();

  if (!data.success || data.points.length === 0) {
    document.getElementById('replayInfo').textContent = 'لا يوجد سجل حركة لهذا اليوم';
    return;
  }

  routePoints = data.points;
  document.getElementById('replayInfo').textContent = `عدد النقاط: ${routePoints.length}`;

  if (routeLine) replayMap.removeLayer(routeLine);
  if (routeMarker) replayMap.removeLayer(routeMarker);

  const latlngs = routePoints.map((p) => [p.lat, p.lng]);
  routeLine = L.polyline(latlngs, { color: '#2563eb', weight: 4 }).addTo(replayMap);
  replayMap.fitBounds(routeLine.getBounds());

  routeMarker = L.marker(latlngs[0], {
    icon: L.divIcon({ html: '<div style="background:#dc2626;width:16px;height:16px;border-radius:50%;border:3px solid #fff"></div>', className: '' }),
  }).addTo(replayMap);

  const slider = document.getElementById('replaySlider');
  slider.max = routePoints.length - 1;
  slider.value = 0;

  document.getElementById('playBtn').disabled = false;
  document.getElementById('pauseBtn').disabled = false;
});

function moveToIndex(i) {
  if (!routePoints[i]) return;
  const p = routePoints[i];
  routeMarker.setLatLng([p.lat, p.lng]);
  const time = new Date(p.timestamp).toLocaleTimeString('ar-SA');
  document.getElementById('replayInfo').textContent = `النقطة ${i + 1}/${routePoints.length} - الوقت: ${time} - السرعة: ${(p.speed || 0).toFixed(1)} كم/س`;
  document.getElementById('replaySlider').value = i;
}

document.getElementById('replaySlider').addEventListener('input', (e) => moveToIndex(parseInt(e.target.value)));

document.getElementById('playBtn').addEventListener('click', () => {
  clearInterval(playInterval);
  const speed = parseInt(document.getElementById('speedSelect').value);
  let i = parseInt(document.getElementById('replaySlider').value);
  playInterval = setInterval(() => {
    if (i >= routePoints.length - 1) { clearInterval(playInterval); return; }
    i++;
    moveToIndex(i);
  }, speed);
});

document.getElementById('pauseBtn').addEventListener('click', () => clearInterval(playInterval));

// ================= لوحة الأداء والمقارنة =================
const today = new Date().toISOString().slice(0, 10);
const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
document.getElementById('fromDate').value = weekAgo;
document.getElementById('toDate').value = today;

let currentLeaderboard = [];

async function loadLeaderboard() {
  const from = document.getElementById('fromDate').value;
  const to = document.getElementById('toDate').value;
  const res = await fetch(`${API_URL}/reports/leaderboard?from=${from}&to=${to}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.success) return;

  currentLeaderboard = data.leaderboard;
  const tbody = document.getElementById('leaderboardBody');
  tbody.innerHTML = currentLeaderboard
    .map((d, i) => `
      <tr class="${i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : ''}">
        <td>${i + 1}</td>
        <td>${d.name || ''}</td>
        <td>${d.driverCode || ''}</td>
        <td>${d.totalDistanceKm}</td>
        <td>${d.avgDistanceKmPerDay}</td>
        <td>${d.daysActive}</td>
        <td>${d.lastShiftHours ?? '--'}</td>
      </tr>`)
    .join('');
}

document.getElementById('loadLeaderboardBtn').addEventListener('click', loadLeaderboard);
loadLeaderboard();

// ------- التصدير -------
document.getElementById('exportExcelBtn').addEventListener('click', () => {
  const rows = currentLeaderboard.map((d, i) => ({
    'الترتيب': i + 1,
    'الاسم': d.name,
    'رقم المندوب': d.driverCode,
    'إجمالي المسافة (كم)': d.totalDistanceKm,
    'متوسط يومي (كم)': d.avgDistanceKmPerDay,
    'أيام النشاط': d.daysActive,
    'آخر دوام (ساعات)': d.lastShiftHours ?? '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'تقرير الأداء');
  XLSX.writeFile(wb, `تقرير_الأداء_${document.getElementById('fromDate').value}_${document.getElementById('toDate').value}.xlsx`);
});

// تصدير PDF: نستخدم نافذة طباعة المتصفح (Ctrl+P → حفظ كـ PDF) - أبسط وأكثر موثوقية من مكتبات PDF الخارجية
document.getElementById('exportPdfBtn').addEventListener('click', () => {
  window.print();
});

// ================= طلبات الإجازة =================
let driversMap = {};
function buildDriversMap() {
  driversMap = {};
  driversList.forEach((d) => (driversMap[d.id] = d));
}

async function loadLeaveRequests() {
  const status = document.getElementById('leaveStatusFilter').value;
  const params = status ? `?status=${status}` : '';
  const res = await fetch(`${API_URL}/leave${params}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!data.success) return;

  buildDriversMap();
  const tbody = document.getElementById('leaveTableBody');
  const reasonLabels = { sick: '🤒 مرض', emergency: '🚨 ظرف طارئ/حادث', personal: '👤 ظرف شخصي', other: '📝 أخرى' };
  const statusLabels = {
    pending: '<span style="color:#eab308;font-weight:bold;">⏳ قيد المراجعة</span>',
    approved: '<span style="color:#16a34a;font-weight:bold;">✅ مقبولة</span>',
    rejected: '<span style="color:#dc2626;font-weight:bold;">❌ مرفوضة</span>',
  };

  tbody.innerHTML = data.requests
    .map((r) => {
      const d = driversMap[r.driverId] || {};
      const submitted = new Date(r.createdAt).toLocaleString('ar-SA', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const actions = r.status === 'pending'
        ? `<button onclick="decideLeave('${r.id}', 'approved')" style="background:#16a34a;color:#fff;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;">قبول</button>
           <button onclick="decideLeave('${r.id}', 'rejected')" style="background:#dc2626;color:#fff;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;margin-right:4px;">رفض</button>`
        : '—';
      return `<tr>
        <td>${d.name || r.driverId} <small style="color:#94a3b8;">#${d.driverCode || ''}</small></td>
        <td>${reasonLabels[r.reasonType] || r.reasonType}</td>
        <td>${r.date}</td>
        <td>${r.note || '--'}</td>
        <td>${submitted}</td>
        <td>${statusLabels[r.status] || r.status}</td>
        <td>${actions}</td>
      </tr>`;
    })
    .join('');
}

window.decideLeave = async function (id, status) {
  try {
    const res = await fetch(`${API_URL}/leave/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      loadLeaveRequests();
    } else {
      alert('❌ فشل تحديث حالة الإجازة: ' + (data.message || `رمز الخطأ ${res.status}`));
    }
  } catch (_) {
    alert('❌ تعذّر الاتصال بالخادم، لم يتم اعتماد القرار');
  }
};

document.getElementById('loadLeaveBtn').addEventListener('click', loadLeaveRequests);
document.getElementById('leaveStatusFilter').addEventListener('change', loadLeaveRequests);

// ================= سجل الغياب =================
document.getElementById('absenceDate').valueAsDate = new Date();

async function loadAbsences() {
  const date = document.getElementById('absenceDate').value;
  const res = await fetch(`${API_URL}/performance/absences?date=${date}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!data.success) return;

  buildDriversMap();
  const tbody = document.getElementById('absencesTableBody');
  tbody.innerHTML = data.absences
    .map((a) => {
      const d = driversMap[a.driverId] || {};
      return `<tr>
        <td>${d.name || a.driverId}</td>
        <td>${d.driverCode || ''}</td>
        <td>${d.phone || ''}</td>
        <td>
          <input type="text" value="${a.note || ''}" placeholder="اكتب سبب الغياب..." style="width:70%;padding:4px;border:1px solid #cbd5e1;border-radius:6px;" onchange="saveAbsenceNote('${a.id}', this.value)">
        </td>
      </tr>`;
    })
    .join('') || '<tr><td colspan="4" style="text-align:center;color:#16a34a;">لا يوجد غياب في هذا اليوم 🎉</td></tr>';
}

window.saveAbsenceNote = async function (id, note) {
  try {
    const res = await fetch(`${API_URL}/performance/absences/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ note }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      alert('❌ فشل حفظ الملاحظة: ' + (data.message || `رمز الخطأ ${res.status}`));
    }
  } catch (_) {
    alert('❌ تعذّر الاتصال بالخادم، لم تُحفظ الملاحظة');
  }
};

document.getElementById('loadAbsencesBtn').addEventListener('click', loadAbsences);
document.getElementById('prevAbsenceDayBtn').addEventListener('click', () => {
  const input = document.getElementById('absenceDate');
  const d = new Date(input.value);
  d.setDate(d.getDate() - 1);
  input.valueAsDate = d;
  loadAbsences();
});
document.getElementById('nextAbsenceDayBtn').addEventListener('click', () => {
  const input = document.getElementById('absenceDate');
  const d = new Date(input.value);
  d.setDate(d.getDate() + 1);
  input.valueAsDate = d;
  loadAbsences();
});

// تحميل أولي عند فتح أي من التبويبين لأول مرة
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.tab === 'leave') loadLeaveRequests();
    if (btn.dataset.tab === 'absences') loadAbsences();
  });
});

// ================= ملاحظات المناديب اليومية =================
const noteTypeLabels = {
  restaurant_closed: '🔒 المطعم مغلق',
  customer_no_response: '📵 العميل لا يرد',
  accident: '🚨 حادث',
  malfunction: '🔧 عطل',
  app_issue: '📱 مشكلة بالتطبيق',
  other: '📝 أخرى',
};

async function loadDailyNotes() {
  const type = document.getElementById('noteTypeFilter').value;
  const params = type ? `?type=${type}` : '';
  const res = await fetch(`${API_URL}/dailynotes${params}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!data.success) return;

  buildDriversMap();
  const container = document.getElementById('dailyNotesList');
  if (data.notes.length === 0) {
    container.innerHTML = '<p style="color:#94a3b8;">لا توجد ملاحظات</p>';
    return;
  }

  container.innerHTML = data.notes
    .map((n) => {
      const d = driversMap[n.driverId] || {};
      const time = new Date(n.createdAt).toLocaleString('ar-SA', {
        year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      const img = n.attachmentData
        ? `<img src="data:${n.attachmentType};base64,${n.attachmentData}" style="max-width:200px;border-radius:8px;margin-top:8px;display:block;">`
        : '';
      return `
        <div style="background:#fff;border-radius:10px;padding:14px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;">
            <b>${noteTypeLabels[n.type] || n.type}</b>
            <span style="font-size:12px;color:#94a3b8;">${time}</span>
          </div>
          <div style="font-size:13px;color:#64748b;margin:4px 0;">${d.name || n.driverId} — #${d.driverCode || ''}</div>
          ${n.note ? `<div style="font-size:14px;">${n.note}</div>` : ''}
          ${img}
        </div>`;
    })
    .join('');
}

document.getElementById('loadDailyNotesBtn').addEventListener('click', loadDailyNotes);
document.getElementById('noteTypeFilter').addEventListener('change', loadDailyNotes);

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.tab === 'dailynotes') loadDailyNotes();
  });
});
