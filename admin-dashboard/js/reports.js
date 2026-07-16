const API_URL = NAHJ_API_URL;
const token = sessionStorage.getItem('nahj_admin_token');
if (!token) window.location.href = 'login.html';

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.href = 'login.html';
});

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

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

const replayMap = L.map('replayMap').setView([24.7136, 46.6753], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(replayMap);

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

document.getElementById('exportPdfBtn').addEventListener('click', () => {
  window.print();
});
