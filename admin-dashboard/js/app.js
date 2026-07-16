// إدارة خريطة OpenStreetMap عبر Leaflet وعلامات المناديب
const map = L.map('map').setView([24.7136, 46.6753], 11); // قيمة مبدئية مؤقتة، سيتم تحديثها فورًا من نطاق العمل الفعلي أدناه

// عند تحميل الصفحة، اجلب نطاق العمل الحقيقي المحفوظ ووسّط الخريطة عليه تلقائيًا
(async function centerOnRealWorkZone() {
  try {
    const token = sessionStorage.getItem('nahj_admin_token');
    const res = await fetch(`${window.NAHJ_API_URL}/settings/workzone`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success && data.lat && data.lng) {
      map.setView([data.lat, data.lng], 12);
    }
  } catch (_) {}
})();

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map);

const markers = {}; // driverId -> L.marker

function statusColor(loc) {
  const now = Date.now();
  if (loc.gpsEnabled === false) return { color: '#111827', label: 'GPS مغلق' };
  if (now - loc.timestamp > 60000) return { color: '#dc2626', label: 'غير متصل' };
  if (loc.insideWorkZone === false) return { color: '#2563eb', label: 'خارج النطاق' };
  if (loc.status === 'stopped') return { color: '#eab308', label: 'لا توجد حركة' };
  return { color: '#16a34a', label: 'متصل' };
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return 'الآن';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `منذ ${hours} ساعة${remMinutes > 0 ? ` و${remMinutes} دقيقة` : ''}`;
}

function makeIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [18, 18],
  });
}

function updateMarkers(locations, driversInfo) {
  const now = Date.now();
  window.lastLocationsData = locations;
  window.lastDriversInfo = driversInfo;

  for (const [driverId, loc] of Object.entries(locations)) {
    const { color, label } = statusColor(loc);
    const info = driversInfo[driverId] || {};
    const sinceUpdate = now - (loc.timestamp || now);
    const isOffline = sinceUpdate > 60000;

    const popupText = `
      <b>${info.name || driverId}</b><br>
      <span style="color:${color}">${label}</span><br>
      السرعة: ${(loc.speed || 0).toFixed(1)} كم/س<br>
      البطارية: ${loc.battery ?? '--'}%<br>
      ${isOffline ? `<span style="color:#dc2626">آخر تحديث: ${formatDuration(sinceUpdate)}</span>` : 'آخر تحديث: الآن'}<br>
      <a href="#" onclick="window.openDriverDetails && window.openDriverDetails('${driverId}'); return false;" style="color:#2563eb;">عرض التفاصيل الكاملة</a> |
      <a href="reports.html?driverId=${driverId}&tab=replay" style="color:#16a34a;">متابعة مسار الحركة</a>
    `;

    if (markers[driverId]) {
      markers[driverId].setLatLng([loc.lat, loc.lng]);
      markers[driverId].setIcon(makeIcon(color));
      markers[driverId].setPopupContent(popupText);
    } else {
      markers[driverId] = L.marker([loc.lat, loc.lng], { icon: makeIcon(color) })
        .addTo(map)
        .bindPopup(popupText)
        .on('click', () => window.openDriverDetails && window.openDriverDetails(driverId));
    }
  }

  for (const driverId of Object.keys(markers)) {
    if (!(driverId in locations)) {
      map.removeLayer(markers[driverId]);
      delete markers[driverId];
    }
  }
}

setInterval(() => {
  if (window.lastLocationsData) {
    updateMarkers(window.lastLocationsData, window.lastDriversInfo || {});
  }
}, 15000);

const locateControl = L.control({ position: 'topleft' });
locateControl.onAdd = function () {
  const btn = L.DomUtil.create('button', 'locate-me-btn');
  btn.innerHTML = '📍';
  btn.title = 'تحديد موقعي الحالي';
  btn.style.cssText = 'width:40px;height:40px;background:#fff;border:2px solid rgba(0,0,0,.2);border-radius:6px;font-size:20px;cursor:pointer;margin-bottom:6px;';
  L.DomEvent.disableClickPropagation(btn);
  btn.onclick = () => {
    if (!navigator.geolocation) {
      alert('المتصفح لا يدعم تحديد الموقع');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 15),
      () => alert('تعذّر تحديد موقعك، تأكد من السماح بالوصول للموقع في المتصفح')
    );
  };
  return btn;
};
locateControl.addTo(map);

const refreshControl = L.control({ position: 'topleft' });
refreshControl.onAdd = function () {
  const btn = L.DomUtil.create('button', 'refresh-now-btn');
  btn.innerHTML = '🔄';
  btn.title = 'تحديث الآن';
  btn.style.cssText = 'width:40px;height:40px;background:#fff;border:2px solid rgba(0,0,0,.2);border-radius:6px;font-size:20px;cursor:pointer;';
  L.DomEvent.disableClickPropagation(btn);
  btn.onclick = () => {
    if (window.nahjSocket) {
      window.nahjSocket.emit('request:locations');
    }
    btn.style.transform = 'rotate(360deg)';
    btn.style.transition = 'transform .5s';
    setTimeout(() => { btn.style.transform = ''; btn.style.transition = ''; }, 500);
  };
  return btn;
};
refreshControl.addTo(map);
