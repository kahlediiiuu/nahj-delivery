// إدارة خريطة OpenStreetMap عبر Leaflet وعلامات المناديب
const map = L.map('map').setView([24.7136, 46.6753], 11); // الرياض كنقطة بداية افتراضية - غيّرها حسب مدينتك

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
  const seen = new Set();
  const now = Date.now();
  window.lastLocationsData = locations;
  window.lastDriversInfo = driversInfo;

  for (const [driverId, loc] of Object.entries(locations)) {
    seen.add(driverId);
    const { color, label } = statusColor(loc);
    const info = driversInfo[driverId] || {};
    const sinceUpdate = now - (loc.timestamp || now);
    const isOffline = sinceUpdate > 60000;

    const popupText = `
      <b>${info.name || driverId}</b><br>
      <span style="color:${color}">${label}</span><br>
      السرعة: ${(loc.speed || 0).toFixed(1)} كم/س<br>
      البطارية: ${loc.battery ?? '--'}%<br>
      ${isOffline ? `<span style="color:#dc2626">آخر تحديث: ${formatDuration(sinceUpdate)}</span>` : 'آخر تحديث: الآن'}
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
}, 20000);

const locateControl = L.control({ position: 'topleft' });
locateControl.onAdd = function () {
  const btn = L.DomUtil.create('button', 'locate-me-btn');
  btn.innerHTML = '📍';
  btn.title = 'تحديد موقعي الحالي';
  btn.style.cssText = 'width:40px;height:40px;background:#fff;border:2px solid rgba(0,0,0,.2);border-radius:6px;font-size:20px;cursor:pointer;';
  L.DomEvent.disableClickPropagation(btn);
  btn.onclick = () => {
    if (!navigator.geolocation) {
      alert('المتصفح لا يدعم تحديد الموقع');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 15);
      },
      () => alert('تعذّر تحديد موقعك، تأكد من السماح بالوصول للموقع في المتصفح')
    );
  };
  return btn;
};
locateControl.addTo(map);
