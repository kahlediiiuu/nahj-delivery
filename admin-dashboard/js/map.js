// إدارة خريطة OpenStreetMap عبر Leaflet وعلامات المناديب
// تنظيف نص المدينة من أي مسافات زائدة أو اختلاف تنسيق Unicode غير مرئي قبل المقارنة
function cityNormalize(str) {
  if (!str) return '';
  return str.normalize('NFC').trim();
}

const map = L.map('map').setView([24.7136, 46.6753], 11);

(async function centerOnRealWorkZone() {
  try {
    const token = sessionStorage.getItem('nahj_admin_token');
    const res = await fetch(`${NAHJ_API_URL}/settings/workzone`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success && data.lat && data.lng) {
      map.setView([data.lat, data.lng], 12);
    }
  } catch (_) {}
})();

// ===== طبقتا الخريطة: عادية وقمر صناعي =====
const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
});
const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: '&copy; Esri',
  maxZoom: 19,
});
streetLayer.addTo(map);
let isSatellite = false;

const markers = {}; // driverId -> L.marker
window.followedDriverId = null; // المندوب الذي تُتابعه الخريطة تلقائيًا حاليًا (أو null)

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

function makeIcon(color, isFollowed) {
  const ring = isFollowed ? 'box-shadow:0 0 0 5px rgba(37,99,235,.4);' : 'box-shadow:0 0 4px rgba(0,0,0,.4);';
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};width:26px;height:26px;border-radius:50%;border:3px solid #fff;${ring};display:flex;align-items:center;justify-content:center;font-size:14px;">🏍️</div>`,
    iconSize: [26, 26],
  });
}

async function sendReminderTo(driverId) {
  try {
    const token = sessionStorage.getItem('nahj_admin_token');
    const res = await fetch(`${NAHJ_API_URL}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ driverId, text: '⚠️ تنبيه من الإدارة: الرجاء التأكد من فتح التطبيق وبدء الدوام وتفعيل الموقع.' }),
    });
    const data = await res.json();
    if (data.success) {
      alert('✅ تم إرسال التذكير بنجاح، سيصل للمندوب فور فتحه للتطبيق');
    } else {
      alert('❌ فشل إرسال التذكير: ' + (data.message || 'خطأ غير معروف'));
    }
  } catch (_) {
    alert('❌ تعذّر إرسال التذكير، تحقق من الاتصال');
  }
}

function toggleFollow(driverId) {
  window.followedDriverId = window.followedDriverId === driverId ? null : driverId;
  if (window.followedDriverId && markers[driverId]) {
    map.setView(markers[driverId].getLatLng(), 16);
  }
  if (window.lastLocationsData) updateMarkers(window.lastLocationsData, window.lastDriversInfo || {});
}
window.sendReminderTo = sendReminderTo;
window.toggleFollow = toggleFollow;

function updateMarkers(locations, driversInfo) {
  const now = Date.now();
  window.lastLocationsData = locations;
  window.lastDriversInfo = driversInfo;
  const isFirstLoad = Object.keys(markers).length === 0;

  // نبني قائمة موحّدة: كل مندوب له موقع حي أو آخر موقع معروف محفوظ، حتى يظهر دائمًا على الخريطة
  const allDriverIds = new Set([...Object.keys(locations), ...Object.keys(driversInfo)]);

  for (const driverId of allDriverIds) {
    const info = driversInfo[driverId] || {};
    if (window.activeCityFilter && cityNormalize(info.city) !== cityNormalize(window.activeCityFilter)) continue;

    let loc = locations[driverId];
    let isStale = false;
    if (!loc) {
      if (info.lastKnownLocation && info.lastKnownLocation.lat) {
        loc = {
          lat: info.lastKnownLocation.lat,
          lng: info.lastKnownLocation.lng,
          timestamp: info.lastSeen || 0,
          gpsEnabled: true,
          insideWorkZone: true,
          status: 'stopped',
        };
        isStale = true;
      } else {
        continue;
      }
    }

    const { color, label } = isStale ? { color: '#9ca3af', label: 'غير متصل (آخر موقع معروف)' } : statusColor(loc);
    const sinceUpdate = now - (loc.timestamp || now);
    const isOffline = isStale || sinceUpdate > 60000;
    const isFollowed = window.followedDriverId === driverId;

    const popupText = `
      <b>${info.name || driverId}</b><br>
      <span style="color:${color}">${label}</span><br>
      ${!isStale ? `السرعة: ${(loc.speed || 0).toFixed(1)} كم/س<br>البطارية: ${loc.battery ?? '--'}%<br>` : ''}
      ${isOffline ? `<span style="color:#dc2626">آخر تحديث: ${formatDuration(sinceUpdate)}</span>` : 'آخر تحديث: الآن'}<br>
      <button onclick="window.toggleFollow('${driverId}')" style="margin-top:6px;padding:4px 8px;border-radius:6px;border:1px solid #2563eb;background:${isFollowed ? '#2563eb' : '#fff'};color:${isFollowed ? '#fff' : '#2563eb'};cursor:pointer;">
        ${isFollowed ? '⏹ إيقاف المتابعة المباشرة' : '▶ متابعة مباشرة'}
      </button>
      ${isOffline ? `<button onclick="window.sendReminderTo('${driverId}')" style="margin-top:6px;margin-right:4px;padding:4px 8px;border-radius:6px;border:1px solid #dc2626;background:#fff;color:#dc2626;cursor:pointer;">📩 إرسال تذكير</button>` : ''}
      <br><a href="reports.html?driverId=${driverId}&tab=replay" style="color:#16a34a;">متابعة مسار الحركة (سجل سابق)</a>
      <br><a href="messages.html?driverId=${driverId}" style="color:#7c3aed;">💬 فتح المحادثة وسجل النشاط</a>
    `;

    if (markers[driverId]) {
      markers[driverId].setLatLng([loc.lat, loc.lng]);
      markers[driverId].setIcon(makeIcon(color, isFollowed));
      markers[driverId].setPopupContent(popupText);
    } else {
      markers[driverId] = L.marker([loc.lat, loc.lng], { icon: makeIcon(color, isFollowed), opacity: isStale ? 0.55 : 1 })
        .addTo(map)
        .bindPopup(popupText)
        .bindTooltip(info.name || driverId, { permanent: true, direction: 'top', offset: [0, -18], className: 'driver-name-label' });
    }

    if (isFollowed) {
      map.panTo([loc.lat, loc.lng]);
    }
  }

  for (const driverId of Object.keys(markers)) {
    const info = driversInfo[driverId] || {};
    const stillValid = allDriverIds.has(driverId) && (!window.activeCityFilter || cityNormalize(info.city) === cityNormalize(window.activeCityFilter));
    if (!stillValid) {
      map.removeLayer(markers[driverId]);
      delete markers[driverId];
    }
  }

  if (isFirstLoad && Object.keys(markers).length > 1) {
    const bounds = L.latLngBounds(Object.values(markers).map((m) => m.getLatLng()));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
  }

  toggleNameLabelsVisibility();
}

// أسماء المناديب تظهر فقط عند تكبير كافٍ (لتفادي ازدحام بصري عند التصغير)
function toggleNameLabelsVisibility() {
  const shouldShow = map.getZoom() >= 13;
  document.querySelectorAll('.driver-name-label').forEach((el) => {
    el.style.display = shouldShow ? 'block' : 'none';
  });
}
map.on('zoomend', toggleNameLabelsVisibility);

setInterval(() => {
  if (window.lastLocationsData) {
    updateMarkers(window.lastLocationsData, window.lastDriversInfo || {});
  }
}, 15000);

// ===== زر تبديل نوع الخريطة (عادية / قمر صناعي) =====
const layerControl = L.control({ position: 'topleft' });
layerControl.onAdd = function () {
  const btn = L.DomUtil.create('button', 'layer-toggle-btn');
  btn.innerHTML = '🛰️';
  btn.title = 'تبديل نوع الخريطة (عادية / قمر صناعي)';
  btn.style.cssText = 'width:40px;height:40px;background:#fff;border:2px solid rgba(0,0,0,.2);border-radius:6px;font-size:20px;cursor:pointer;margin-bottom:6px;';
  L.DomEvent.disableClickPropagation(btn);
  btn.onclick = () => {
    isSatellite = !isSatellite;
    if (isSatellite) {
      map.removeLayer(streetLayer);
      satelliteLayer.addTo(map);
      btn.innerHTML = '🗺️';
    } else {
      map.removeLayer(satelliteLayer);
      streetLayer.addTo(map);
      btn.innerHTML = '🛰️';
    }
  };
  return btn;
};
layerControl.addTo(map);

// ===== زر "تحديد موقعي الحالي" =====
const locateControl = L.control({ position: 'topleft' });
locateControl.onAdd = function () {
  const btn = L.DomUtil.create('button', 'locate-me-btn');
  btn.innerHTML = '📍';
  btn.title = 'تحديد موقعي الحالي';
  btn.style.cssText = 'width:40px;height:40px;background:#fff;border:2px solid rgba(0,0,0,.2);border-radius:6px;font-size:20px;cursor:pointer;margin-bottom:6px;';
  L.DomEvent.disableClickPropagation(btn);
  btn.onclick = () => {
    if (!navigator.geolocation) return alert('المتصفح لا يدعم تحديد الموقع');
    navigator.geolocation.getCurrentPosition(
      (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 15),
      () => alert('تعذّر تحديد موقعك، تأكد من السماح بالوصول للموقع في المتصفح')
    );
  };
  return btn;
};
locateControl.addTo(map);

// ===== زر "تحديث الآن" =====
const refreshControl = L.control({ position: 'topleft' });
refreshControl.onAdd = function () {
  const btn = L.DomUtil.create('button', 'refresh-now-btn');
  btn.innerHTML = '🔄';
  btn.title = 'تحديث الآن';
  btn.style.cssText = 'width:40px;height:40px;background:#fff;border:2px solid rgba(0,0,0,.2);border-radius:6px;font-size:20px;cursor:pointer;';
  L.DomEvent.disableClickPropagation(btn);
  btn.onclick = () => {
    if (window.nahjSocket && window.nahjSocket.connected) {
      window.nahjSocket.emit('request:locations');
    } else {
      // الاتصال اللحظي منقطع فعليًا - نعتمد بديلاً احتياطيًا: إعادة تحميل بيانات المناديب الأساسية
      // (لن تُحدِّث المواقع اللحظية، لكنها تؤكد للمشرف أن الاتصال العام بالخادم لا يزال يعمل)
      if (typeof loadDrivers === 'function') loadDrivers();
      alert('⚠️ الاتصال المباشر بالخادم منقطع حاليًا، يُعاد الاتصال تلقائيًا خلال ثوانٍ. حدّث الصفحة إن استمرت المشكلة.');
    }
    btn.style.transform = 'rotate(360deg)';
    btn.style.transition = 'transform .5s';
    setTimeout(() => { btn.style.transform = ''; btn.style.transition = ''; }, 500);
  };
  return btn;
};
refreshControl.addTo(map);

const fitAllControl = L.control({ position: 'topleft' });
fitAllControl.onAdd = function () {
  const btn = L.DomUtil.create('button', 'fit-all-btn');
  btn.innerHTML = '🔭';
  btn.title = 'عرض كل المناديب دفعة واحدة';
  btn.style.cssText = 'width:40px;height:40px;background:#fff;border:2px solid rgba(0,0,0,.2);border-radius:6px;font-size:20px;cursor:pointer;margin-top:6px;';
  L.DomEvent.disableClickPropagation(btn);
  btn.onclick = () => {
    const visibleMarkers = Object.values(markers);
    if (visibleMarkers.length === 0) return;
    if (visibleMarkers.length === 1) {
      map.setView(visibleMarkers[0].getLatLng(), 14);
    } else {
      const bounds = L.latLngBounds(visibleMarkers.map((m) => m.getLatLng()));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  };
  return btn;
};
fitAllControl.addTo(map);
