const API_URL = NAHJ_API_URL;
const SOCKET_URL = NAHJ_SOCKET_URL;

const token = sessionStorage.getItem('nahj_admin_token');
if (!token) window.location.href = 'login.html';

document.getElementById('adminName').textContent = sessionStorage.getItem('nahj_admin_name') || '';
document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.href = 'login.html';
});

let driversInfo = {};
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

const alertReasons = [
  { label: '📍 أنت بعيد عن منطقة العمل المحددة', text: 'تنبيه: يبدو أنك بعيد عن منطقة العمل المحددة، الرجاء التأكد من موقعك.' },
  { label: '⏱️ يجب الإسراع في توصيل الطلبات', text: 'تنبيه: لاحظنا تأخرًا في توصيل الطلبات، الرجاء الإسراع.' },
  { label: '⚠️ لاحظنا تأخرك عن الجدول', text: 'تنبيه: لاحظنا تأخرك عن الجدول المعتاد اليوم.' },
  { label: '🔋 الرجاء شحن جوالك', text: 'تنبيه: بطارية جوالك منخفضة جدًا، الرجاء شحنه في أقرب وقت.' },
  { label: '📶 الرجاء التحقق من اتصال الإنترنت', text: 'تنبيه: يبدو أن اتصالك بالإنترنت غير مستقر.' },
  { label: '✍️ رسالة أخرى مخصصة', text: '' },
];

async function sendAlertMessage(driverId, text) {
  try {
    await fetch(`${API_URL}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ driverId, text: `⚠️ ${text}` }),
    });
    alert('تم إرسال التنبيه بنجاح، وسيصل للمندوب كإشعار فوري بصوت (بمجرد فتحه للتطبيق أو أثناء الدوام)');
  } catch (_) {
    alert('تعذّر إرسال التنبيه، تحقق من الاتصال');
  }
}

async function sendCustomAlert(driverId) {
  const select = document.getElementById('alertReasonSelect');
  const reason = alertReasons[select.value];
  if (reason.text) {
    await sendAlertMessage(driverId, reason.text);
    return;
  }
  openGlobalAlertModal(driverId);
}
window.sendCustomAlert = sendCustomAlert;

function renderGlobalAlertReasons() {
  const select = document.getElementById('globalAlertReasonSelect');
  select.innerHTML = alertReasons.map((r, i) => `<option value="${i}">${r.label}</option>`).join('');
  select.value = alertReasons.length - 1;
  document.getElementById('globalAlertCustomTextWrap').style.display = alertReasons[select.value].text ? 'none' : 'block';
}

function renderGlobalAlertDriversList(filter = '') {
  const select = document.getElementById('globalAlertDriverSelect');
  const f = filter.trim().toLowerCase();
  const list = Object.entries(driversInfo).filter(
    ([id, info]) =>
      !f ||
      info.name?.toLowerCase().includes(f) ||
      info.driverCode?.toLowerCase().includes(f) ||
      info.phone?.includes(f)
  );
  select.innerHTML = list
    .map(([id, info]) => `<option value="${id}">${info.name || 'بدون اسم'} — #${info.driverCode || ''} — ${info.phone || ''}</option>`)
    .join('');
}

function openGlobalAlertModal(preselectDriverId) {
  document.getElementById('globalAlertSearch').value = '';
  renderGlobalAlertDriversList();
  renderGlobalAlertReasons();
  if (preselectDriverId) {
    document.getElementById('globalAlertDriverSelect').value = preselectDriverId;
  }
  document.getElementById('globalAlertModal').classList.remove('hidden');
}

document.getElementById('openGlobalAlertBtn').addEventListener('click', () => openGlobalAlertModal());
document.getElementById('closeGlobalAlertModal').addEventListener('click', () => {
  document.getElementById('globalAlertModal').classList.add('hidden');
});

document.getElementById('globalAlertSearch').addEventListener('input', (e) => renderGlobalAlertDriversList(e.target.value));

document.getElementById('globalAlertReasonSelect').addEventListener('change', (e) => {
  const reason = alertReasons[e.target.value];
  document.getElementById('globalAlertCustomTextWrap').style.display = reason.text ? 'none' : 'block';
});

document.getElementById('globalAlertSendBtn').addEventListener('click', async () => {
  const driverId = document.getElementById('globalAlertDriverSelect').value;
  if (!driverId) return alert('اختر مندوبًا أولًا من القائمة');

  const reasonIndex = document.getElementById('globalAlertReasonSelect').value;
  const reason = alertReasons[reasonIndex];
  let text = reason.text;
  if (!text) {
    text = document.getElementById('globalAlertCustomText').value.trim();
    if (!text) return alert('اكتب نص الرسالة المخصصة أولًا');
  }

  await sendAlertMessage(driverId, text);
  document.getElementById('globalAlertModal').classList.add('hidden');
});

window.openDriverDetails = function (driverId) {
  const info = driversInfo[driverId] || {};
  const loc = latestLocations[driverId] || {};
  const modal = document.getElementById('driverModal');
  const body = document.getElementById('modalBody');

  const dateTimeOptions = { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  const shiftStart = info.shiftStart ? new Date(info.shiftStart).toLocaleString('ar-SA', dateTimeOptions) : '--';
  const shiftEnd = info.shiftEnd ? new Date(info.shiftEnd).toLocaleString('ar-SA', dateTimeOptions) : '--';
  const lastUpdate = loc.timestamp ? new Date(loc.timestamp).toLocaleString('ar-SA', dateTimeOptions) : '--';

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
    <div class="detail-row"><span>بداية الدوام (تاريخ ووقت)</span><span>${shiftStart}</span></div>
    <div class="detail-row"><span>نهاية الدوام (تاريخ ووقت)</span><span>${shiftEnd}</span></div>
    <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;">
    <div style="font-weight:bold;margin-bottom:8px;">📢 إرسال تنبيه فوري لهذا المندوب</div>
    <select id="alertReasonSelect" style="width:100%;padding:8px;margin-bottom:8px;border-radius:6px;border:1px solid #cbd5e1;">
      ${alertReasons.map((r, i) => `<option value="${i}">${r.label}</option>`).join('')}
    </select>
    <button onclick="window.sendCustomAlert('${driverId}')" style="width:100%;padding:10px;background:#0f172a;color:#fff;border:none;border-radius:6px;cursor:pointer;">
      إرسال التنبيه الآن
    </button>
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

function showToast(text, driverId) {
  const container = document.getElementById('alertsToast');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = text + ' (اضغط لاتخاذ إجراء)';
  toast.style.cursor = 'pointer';
  if (driverId) {
    toast.addEventListener('click', () => {
      window.openDriverDetails(driverId);
      toast.remove();
    });
  }
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 8000);
}

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
  } catch (_) {}
}

if ('Notification' in window && Notification.permission === 'default') {
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

const socket = io(SOCKET_URL);
window.nahjSocket = socket;

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
      showToast(text, a.driverId);
      showBrowserNotification(text);
    }
  });
});

loadDrivers();
setInterval(loadDrivers, 60000);
