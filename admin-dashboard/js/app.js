const API_URL = NAHJ_API_URL;
const SOCKET_URL = NAHJ_SOCKET_URL;

const token = sessionStorage.getItem('nahj_admin_token');
if (!token) window.location.href = 'login.html';

document.getElementById('adminName').textContent = sessionStorage.getItem('nahj_admin_name') || '';
document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.href = 'login.html';
});

let driversInfo = {}; // driverId -> {name, phone, driverCode, ...}
let latestLocations = {};

async function loadDrivers() {
  const res = await fetch(`${API_URL}/drivers`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.success) {
    driversInfo = {};
    data.drivers.forEach((d) => (driversInfo[d.id] = d));
    renderDriverList();
  }
}

function renderDriverList(filter = '') {
  const list = document.getElementById('driverList');
  list.innerHTML = '';
  const f = filter.trim().toLowerCase();

  Object.entries(driversInfo)
    .filter(([id, info]) => !f || info.name?.toLowerCase().includes(f) || info.driverCode?.toLowerCase().includes(f))
    .forEach(([id, info]) => {
      const loc = latestLocations[id];
      const now = Date.now();
      let statusClass = 'status-offline';
      if (loc) {
        if (loc.gpsEnabled === false) statusClass = 'status-gpsoff';
        else if (now - loc.timestamp > 60000) statusClass = 'status-offline';
        else if (loc.insideWorkZone === false) statusClass = 'status-outside';
        else if (loc.status === 'stopped') statusClass = 'status-idle';
        else statusClass = 'status-online';
      }

      const card = document.createElement('div');
      card.className = `driver-card ${statusClass}`;
      card.innerHTML = `
        <div>
          <div class="name">${info.name || 'بدون اسم'}</div>
          <div class="meta">#${info.driverCode || ''} · ${info.phone || ''}</div>
        </div>`;
      card.addEventListener('click', () => openDriverDetails(id));
      list.appendChild(card);
    });
}

document.getElementById('searchDriver').addEventListener('input', (e) => renderDriverList(e.target.value));

window.openDriverDetails = function (driverId) {
  const info = driversInfo[driverId] || {};
  const loc = latestLocations[driverId] || {};
  const modal = document.getElementById('driverModal');
  const body = document.getElementById('modalBody');

  const shiftStart = info.shiftStart ? new Date(info.shiftStart).toLocaleTimeString('ar-SA') : '--';
  const shiftEnd = info.shiftEnd ? new Date(info.shiftEnd).toLocaleTimeString('ar-SA') : '--';
  const lastUpdate = loc.timestamp ? new Date(loc.timestamp).toLocaleTimeString('ar-SA') : '--';

  body.innerHTML = `
    <h3>${info.name || ''}</h3>
    <div class="detail-row"><span>الرقم التعريفي الدائم</span><span style="font-family:monospace;font-size:12px;">${driverId}</span></div>
    <div class="detail-row"><span>رقم المندوب</span><span>${info.driverCode || ''}</span></div>
    <div class="detail-row"><span>رقم الجوال</span><span>${info.phone || ''}</span></div>
    <div class="detail-row"><span>آخر تحديث</span><span>${lastUpdate}</span></div>
    <div class="detail-row"><span>السرعة</span><span>${(loc.speed || 0).toFixed(1)} كم/س</span></div>
    <div class="detail-row"><span>البطارية</span><span>${loc.battery ?? '--'}%${loc.isCharging ? ' (شحن)' : ''}</span></div>
    <div class="detail-row"><span>حالة الإنترنت</span><span>${loc.isInternetConnected === false ? 'منقطع' : 'متصل'}</span></div>
    <div class="detail-row"><span>حالة GPS</span><span>${loc.gpsEnabled === false ? 'مغلق' : 'مفعّل'}</span></div>
    <div class="detail-row"><span>داخل النطاق</span><span>${loc.insideWorkZone === false ? 'لا (خارج النطاق)' : 'نعم'}</span></div>
    <div class="detail-row"><span>بداية الدوام</span><span>${shiftStart}</span></div>
    <div class="detail-row"><span>نهاية الدوام</span><span>${shiftEnd}</span></div>
  `;
  modal.classList.remove('hidden');
};

document.getElementById('closeModal').addEventListener('click', () => {
  document.getElementById('driverModal').classList.add('hidden');
});

function updateStatsBar() {
  const now = Date.now();
  let online = 0, offline = 0, inside = 0, outside = 0, moving = 0, stopped = 0;

  Object.values(latestLocations).forEach((loc) => {
    if (now - loc.timestamp <= 60000) online++; else offline++;
    if (loc.insideWorkZone === false) outside++; else inside++;
    if (loc.status === 'moving') moving++; else stopped++;
  });

  document.getElementById('statOnline').textContent = online;
  document.getElementById('statOffline').textContent = offline;
  document.getElementById('statInside').textContent = inside;
  document.getElementById('statOutside').textContent = outside;
  document.getElementById('statMoving').textContent = moving;
  document.getElementById('statStopped').textContent = stopped;
}

function showToast(text) {
  const container = document.getElementById('alertsToast');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = text;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
}

// ------- صوت التنبيه: نولّده مباشرة عبر Web Audio API بدون أي ملف صوتي خارجي -------
function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.4);
  } catch (_) {
    // بعض المتصفحات تمنع الصوت قبل أول تفاعل من المستخدم مع الصفحة - غير حرج
  }
}

// ------- إشعارات المتصفح (تظهر حتى لو كانت اللوحة في تبويب آخر أو مصغّرة) -------
if ('Notification' in window && Notification.permission === 'default') {
  // نطلب الإذن فقط بعد أول نقرة من المشرف (متطلب أمان في المتصفحات الحديثة)
  document.body.addEventListener('click', () => Notification.requestPermission(), { once: true });
}

function showBrowserNotification(text) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('⚠️ تنبيه نهج للتوصيل', { body: text, icon: '' });
  }
}

const alertMessages = {
  no_update: (name) => `⚠️ ${name}: لم يُحدَّث الموقع منذ فترة`,
  gps_off: (name) => `⚫ ${name}: تم إغلاق GPS`,
  internet_off: (name) => `🔴 ${name}: انقطع الإنترنت`,
  outside_zone: (name) => `🔵 ${name}: خرج عن نطاق العمل`,
  low_battery: (name) => `🔋 ${name}: البطارية منخفضة`,
};

// الاتصال بالبث اللحظي
const socket = io(SOCKET_URL);

socket.on('locations:update', (locations) => {
  latestLocations = locations;
  updateMarkers(locations, driversInfo);
  updateStatsBar();
  renderDriverList(document.getElementById('searchDriver').value);
});

socket.on('alerts:new', (alerts) => {
  if (alerts.length > 0) playAlertSound();
  alerts.forEach((a) => {
    const name = driversInfo[a.driverId]?.name || a.driverId;
    const msgFn = alertMessages[a.type];
    if (msgFn) {
      const text = msgFn(name);
      showToast(text);
      showBrowserNotification(text);
    }
  });
});

loadDrivers();
setInterval(loadDrivers, 60000); // تحديث قائمة المناديب (الأسماء الجديدة إلخ) كل دقيقة
