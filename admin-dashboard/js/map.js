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

function makeIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [18, 18],
  });
}

function updateMarkers(locations, driversInfo) {
  const seen = new Set();

  for (const [driverId, loc] of Object.entries(locations)) {
    seen.add(driverId);
    const { color } = statusColor(loc);
    const info = driversInfo[driverId] || {};
    const popupText = `<b>${info.name || driverId}</b><br>السرعة: ${(loc.speed || 0).toFixed(1)} كم/س<br>البطارية: ${loc.battery ?? '--'}%`;

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

  // إزالة علامات المناديب الذين لم يعودوا في البيانات (مثال: انتهى دوامهم)
  for (const driverId of Object.keys(markers)) {
    if (!seen.has(driverId)) {
      map.removeLayer(markers[driverId]);
      delete markers[driverId];
    }
  }
}
