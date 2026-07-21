const API_URL = NAHJ_API_URL;
const SOCKET_URL = NAHJ_SOCKET_URL;

const token = sessionStorage.getItem('nahj_admin_token');
if (!token) window.location.href = 'login.html';

document.getElementById('adminName').textContent = sessionStorage.getItem('nahj_admin_name') || '';
document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.href = 'login.html';
});

function cityNormalize(str) {
  if (!str) return '';
  return str.normalize('NFC').trim();
}

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

let activeStatFilter = null; // null = بلا فلتر | 'online' | 'offline' | 'inside' | 'outside' | 'moving' | 'stopped'

function computeStatus(loc) {
  const now = Date.now();
  if (!loc) return { statusClass: 'status-offline', tags: ['offline'] };
  const tags = [];
  let statusClass;
  if (loc.gpsEnabled === false) { statusClass = 'status-gpsoff'; tags.push('offline'); }
  else if (now - loc.timestamp > 60000) { statusClass = 'status-offline'; tags.push('offline'); }
  else if (loc.insideWorkZone === false) { statusClass = 'status-outside'; tags.push('online', 'outside'); }
  else if (loc.status === 'stopped') { statusClass = 'status-idle'; tags.push('online', 'inside', 'stopped'); }
  else { statusClass = 'status-online'; tags.push('online', 'inside', 'moving'); }
  if (loc.insideWorkZone !== false) tags.push('inside'); else if (!tags.includes('outside')) tags.push('outside');
  return { statusClass, tags };
}

function renderDriverList(filter = '') {
  const list = document.getElementById('driverList');
  list.innerHTML = '';
  const f = filter.trim().toLowerCase();

  Object.entries(driversInfo)
    .filter(([id, info]) => !f || info.name?.toLowerCase().includes(f) || info.driverCode?.toLowerCase().includes(f))
    .forEach(([id, info]) => {
      const loc = latestLocations[id];
      const { statusClass, tags } = computeStatus(loc);

      if (activeStatFilter && !tags.includes(activeStatFilter)) return;
      if (window.activeCityFilter && cityNormalize(info.city) !== cityNormalize(window.activeCityFilter)) return;

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

// ربط أزرار الإحصائيات بالفلترة الفعلية عند الضغط عليها
function setupStatFilters() {
  const map = {
    statOnline: 'online', statOffline: 'offline',
    statInside: 'inside', statOutside: 'outside',
    statMoving: 'moving', statStopped: 'stopped',
  };
  Object.entries(map).forEach(([elId, tag]) => {
    const box = document.getElementById(elId)?.closest('.stat-box');
    if (!box) return;
    box.style.cursor = 'pointer';
    box.addEventListener('click', () => {
      activeStatFilter = activeStatFilter === tag ? null : tag;
      document.querySelectorAll('.stat-box').forEach((b) => b.classList.remove('stat-active'));
      if (activeStatFilter) box.classList.add('stat-active');
      renderDriverList(document.getElementById('searchDriver').value);
    });
  });
}
setupStatFilters();

document.getElementById('searchDriver').addEventListener('input', (e) => renderDriverList(e.target.value));

const alertReasons = [
  { label: '📍 أنت بعيد عن منطقة العمل المحددة', text: 'تنبيه: يبدو أنك بعيد عن منطقة العمل المحددة، الرجاء التأكد من موقعك.' },
  { label: '⏱️ يجب الإسراع في توصيل الطلبات', text: 'تنبيه: لاحظنا تأخرًا في توصيل الطلبات، الرجاء الإسراع.' },
  { label: '⚠️ لاحظنا تأخرك عن الجدول', text: 'تنبيه: لاحظنا تأخرك عن الجدول المعتاد اليوم.' },
  { label: '🔋 الرجاء شحن جوالك', text: 'تنبيه: بطارية جوالك منخفضة جدًا، الرجاء شحنه في أقرب وقت.' },
  { label: '📶 الرجاء التحقق من اتصال الإنترنت', text: 'تنبيه: يبدو أن اتصالك بالإنترنت غير مستقر.' },
  { label: '✍️ رسالة أخرى مخصصة', text: '' },
];

async function sendAlertMessage(driverId, text, silent = false) {
  try {
    const res = await fetch(`${API_URL}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ driverId, text: `⚠️ ${text}`, silent }),
    });
    const data = await res.json();
    if (data.success) {
      alert('✅ تم إرسال التنبيه بنجاح، وسيصل للمندوب كإشعار فوري (بمجرد فتحه للتطبيق أو أثناء الدوام)');
    } else {
      alert('❌ فشل إرسال التنبيه: ' + (data.message || 'خطأ غير معروف'));
    }
  } catch (_) {
    alert('❌ تعذّر إرسال التنبيه، تحقق من الاتصال بالإنترنت');
  }
}

async function sendCustomAlert(driverId) {
  const select = document.getElementById('alertReasonSelect');
  const reason = alertReasons[select.value];
  if (reason.text) {
    await sendAlertMessage(driverId, reason.text);
    return;
  }
  // "رسالة أخرى مخصصة" -> افتح نافذة الإشعار العام مع تعبئة المندوب مسبقًا لكتابة نص حر بشكل احترافي
  openGlobalAlertModal(driverId);
}
window.sendCustomAlert = sendCustomAlert;

// ================= نافذة الإشعار العام: اختيار أي مندوب من أي مكان بالصفحة =================
function renderGlobalAlertReasons() {
  const select = document.getElementById('globalAlertReasonSelect');
  select.innerHTML = alertReasons.map((r, i) => `<option value="${i}">${r.label}</option>`).join('');
  select.value = alertReasons.length - 1; // افتراضيًا: رسالة مخصصة
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

  const silent = document.getElementById('globalAlertSilentCheckbox').checked;
  await sendAlertMessage(driverId, text, silent);
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
    ${loc.lat ? `
    <button onclick="window.sendLocationProof('${driverId}', ${loc.lat}, ${loc.lng})" style="width:100%;padding:10px;margin-top:8px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;">
      📍 إرسال موقعه الحالي المسجَّل له كإثبات
    </button>` : ''}
    <button onclick="window.startLiveTrack('${driverId}')" style="width:100%;padding:10px;margin-top:8px;background:#16a34a;color:#fff;border:none;border-radius:6px;cursor:pointer;">
      ▶ بدء تتبع مباشر (20 دقيقة كحد أقصى)
    </button>
    <button onclick="window.stopLiveTrack('${driverId}')" style="width:100%;padding:10px;margin-top:8px;background:#dc2626;color:#fff;border:none;border-radius:6px;cursor:pointer;">
      ⏹ إيقاف التتبع فورًا
    </button>
    <button onclick="window.requestLocationNow('${driverId}')" style="width:100%;padding:10px;margin-top:8px;background:#0891b2;color:#fff;border:none;border-radius:6px;cursor:pointer;">
      📍 اطلب موقعه الآن (مرة واحدة فقط)
    </button>
    <button onclick="window.toggleTodayRoute('${driverId}')" style="width:100%;padding:10px;margin-top:8px;background:${window.routeVisibleFor === driverId ? '#dc2626' : '#16a34a'};color:#fff;border:none;border-radius:6px;cursor:pointer;">
      ${window.routeVisibleFor === driverId ? '🛣️ إخفاء مسار اليوم' : '🛣️ عرض مسار اليوم على الخريطة'}
    </button>
    <button onclick="window.showSessionLog('${driverId}')" style="width:100%;padding:10px;margin-top:8px;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer;">
      📱 سجل فتح التطبيق (آخر 24 ساعة)
    </button>
    <div id="sessionLogBox" style="margin-top:10px;font-size:12px;"></div>
  `;
  modal.classList.remove('hidden');
};

window.startLiveTrack = async function (driverId) {
  try {
    const res = await fetch(`${API_URL}/location/track/start/${driverId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert('✅ بدأ التتبع المباشر، ستظهر التحديثات على الخريطة كل ~12 ثانية. سيتوقف تلقائيًا بعد 20 دقيقة إن لم تُوقفه.');
    } else {
      alert('❌ ' + (data.message || 'تعذّر البدء'));
    }
  } catch (_) {
    alert('❌ تعذّر الاتصال بالخادم');
  }
};

window.stopLiveTrack = async function (driverId) {
  try {
    const res = await fetch(`${API_URL}/location/track/stop/${driverId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert('✅ تم إرسال أمر الإيقاف');
    } else {
      alert('❌ ' + (data.message || 'تعذّر الإيقاف'));
    }
  } catch (_) {
    alert('❌ تعذّر الاتصال بالخادم');
  }
};

window.requestLocationNow = async function (driverId) {
  try {
    const res = await fetch(`${API_URL}/location/request/${driverId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert('✅ تم إرسال الطلب، سيصل الموقع الفعلي خلال ثوانٍ معدودة وسيظهر تلقائيًا على الخريطة');
    } else {
      alert('❌ ' + (data.message || 'تعذّر إرسال الطلب'));
    }
  } catch (_) {
    alert('❌ تعذّر الاتصال بالخادم');
  }
};

window.showSessionLog = async function (driverId) {
  const box = document.getElementById('sessionLogBox');
  box.innerHTML = 'جاري التحميل...';
  try {
    const res = await fetch(`${API_URL}/auth/driver/${driverId}/sessions`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!data.success || data.sessions.length === 0) {
      box.innerHTML = '<span style="color:#94a3b8;">⚠️ لم يفتح المندوب التطبيق خلال آخر 24 ساعة</span>';
      return;
    }
    box.innerHTML = '<b>مرات فتح التطبيق اليوم:</b><br>' + data.sessions
      .map((s) => new Date(s.loggedInAt).toLocaleString('ar-SA', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' }))
      .map((t) => `🕐 ${t}`)
      .join('<br>');
  } catch (_) {
    box.innerHTML = '<span style="color:#dc2626;">تعذّر تحميل السجل</span>';
  }
};

// ================= عرض/إخفاء مسار حركة اليوم مباشرة فوق الخريطة المباشرة =================
window.routeVisibleFor = null;
let todayRouteLine = null;

window.toggleTodayRoute = async function (driverId) {
  if (window.routeVisibleFor === driverId) {
    if (todayRouteLine) { map.removeLayer(todayRouteLine); todayRouteLine = null; }
    window.routeVisibleFor = null;
    window.openDriverDetails(driverId);
    return;
  }

  if (todayRouteLine) { map.removeLayer(todayRouteLine); todayRouteLine = null; }

  const today = new Date().toISOString().slice(0, 10);
  try {
    const res = await fetch(`${API_URL}/reports/route/${driverId}?date=${today}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!data.success || data.points.length === 0) {
      alert('لا يوجد سجل حركة مسجَّل لهذا المندوب اليوم بعد');
      return;
    }
    const latlngs = data.points.map((p) => [p.lat, p.lng]);
    todayRouteLine = L.polyline(latlngs, { color: '#7c3aed', weight: 4, opacity: 0.8 }).addTo(map);
    window.routeVisibleFor = driverId;
    window.openDriverDetails(driverId);
  } catch (_) {
    alert('تعذّر تحميل مسار الحركة');
  }
};

// يرسل للمندوب رابط خريطة حقيقيًا يوضح موقعه المسجَّل لدى النظام حاليًا (مفيد عند اعتراضه أنه "داخل النطاق" فعليًا)
window.sendLocationProof = async function (driverId, lat, lng) {
  const mapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
  const text = `📍 هذا هو موقعك المسجَّل لدينا الآن بالضبط:\n${mapsLink}\nإن كان مختلفًا عن موقعك الحقيقي، تأكد من تفعيل GPS بدقة عالية.`;
  await sendAlertMessage(driverId, text);
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
setInterval(loadDrivers, 180000); // كل 3 دقائق بدل دقيقة - توفير إضافي

// ================= الإشعار الجماعي =================
document.getElementById('openBroadcastBtn').addEventListener('click', () => {
  document.getElementById('broadcastModal').classList.remove('hidden');
});
document.getElementById('closeBroadcastModal').addEventListener('click', () => {
  document.getElementById('broadcastModal').classList.add('hidden');
});

document.getElementById('sendBroadcastBtn').addEventListener('click', async () => {
  const ar = document.getElementById('broadcastTextAr').value.trim();
  const en = document.getElementById('broadcastTextEn').value.trim();
  const bn = document.getElementById('broadcastTextBn').value.trim();
  if (!ar) return alert('النص العربي إلزامي على الأقل');

  try {
    const res = await fetch(`${API_URL}/messages/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ target: 'all', texts: { ar, en: en || undefined, bn: bn || undefined } }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert(`✅ تم إرسال الإشعار بنجاح إلى ${data.count} مندوب.`);
      document.getElementById('broadcastModal').classList.add('hidden');
      document.getElementById('broadcastTextAr').value = '';
      document.getElementById('broadcastTextEn').value = '';
      document.getElementById('broadcastTextBn').value = '';
    } else {
      alert('❌ فشل الإرسال الجماعي: ' + (data.message || `رمز الخطأ ${res.status}`));
    }
  } catch (_) {
    alert('❌ تعذّر الاتصال بالخادم');
  }
});

// ================= تصفية حسب المدينة =================
window.activeCityFilter = null;

const cityCoordinates = {
  'الرياض': [24.7136, 46.6753],
  'جدة': [21.4858, 39.1925],
  'الدمام': [26.4207, 50.0888],
  'مكة': [21.3891, 39.8579],
  'المدينة': [24.5247, 39.5692],
  'ينبع': [24.0895, 38.0618],
};

document.getElementById('cityFilterSelect').addEventListener('change', (e) => {
  window.activeCityFilter = e.target.value || null;

  if (window.activeCityFilter && cityCoordinates[window.activeCityFilter]) {
    // انتقال فوري لمركز المدينة المختارة مباشرة
    map.setView(cityCoordinates[window.activeCityFilter], 12);
  }

  if (window.lastLocationsData) updateMarkers(window.lastLocationsData, window.lastDriversInfo || {});
  renderDriverList(document.getElementById('searchDriver').value);

  if (window.activeCityFilter) {
    const matchCount = Object.values(driversInfo).filter(
      (info) => cityNormalize(info.city) === cityNormalize(window.activeCityFilter)
    ).length;
    let counter = document.getElementById('cityMatchCounter');
    if (!counter) {
      counter = document.createElement('span');
      counter.id = 'cityMatchCounter';
      counter.style.cssText = 'padding:6px 12px;background:#0f172a;color:#fff;border-radius:8px;font-size:13px;';
      document.getElementById('cityFilterSelect').insertAdjacentElement('afterend', counter);
    }
    counter.textContent = matchCount > 0 ? `✅ ${matchCount} مندوب في ${window.activeCityFilter}` : `⚠️ لا يوجد أي مندوب مسجَّل بمدينة "${window.activeCityFilter}" في إدارة المناديب`;
  } else {
    document.getElementById('cityMatchCounter')?.remove();
  }

  if (!window.activeCityFilter) {
    // عند اختيار "كل المدن": وسّع الخريطة لتشمل فقط المناديب الظاهرين فعليًا الآن (وليس كل المدن نظريًا)
    setTimeout(() => {
      const visibleMarkers = Object.values(markers);
      if (visibleMarkers.length === 1) {
        map.setView(visibleMarkers[0].getLatLng(), 13);
      } else if (visibleMarkers.length > 1) {
        const bounds = L.latLngBounds(visibleMarkers.map((m) => m.getLatLng()));
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }, 150);
  }
});
