const token = sessionStorage.getItem('nahj_admin_token');
if (!token) window.location.href = 'login.html';

// ------- التبويبات -------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'workzone') setTimeout(() => map.invalidateSize(), 100);
  });
});

function showMsg(elId, text, isError) {
  const el = document.getElementById(elId);
  el.textContent = text;
  el.className = 'msg ' + (isError ? 'error' : 'success');
}

// ------- تغيير كلمة المرور -------
document.getElementById('submitPasswordBtn').addEventListener('click', async () => {
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (!currentPassword || !newPassword) return showMsg('passwordMsg', 'املأ كل الحقول', true);
  if (newPassword !== confirmPassword) return showMsg('passwordMsg', 'كلمة المرور الجديدة غير متطابقة مع التأكيد', true);

  try {
    const res = await fetch(`${NAHJ_API_URL}/auth/admin/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    if (data.success) {
      showMsg('passwordMsg', 'تم تغيير كلمة المرور بنجاح! استخدمها في الدخول القادم.', false);
      document.getElementById('currentPassword').value = '';
      document.getElementById('newPassword').value = '';
      document.getElementById('confirmPassword').value = '';
    } else {
      showMsg('passwordMsg', data.message || 'حدث خطأ', true);
    }
  } catch (err) {
    showMsg('passwordMsg', 'تعذّر الاتصال بالخادم', true);
  }
});

// ------- تغيير اسم المستخدم -------
document.getElementById('submitUsernameBtn').addEventListener('click', async () => {
  const currentPassword = document.getElementById('usernameCurrentPassword').value;
  const newUsername = document.getElementById('newUsername').value.trim();

  if (!currentPassword || !newUsername) return showMsg('usernameMsg', 'املأ كل الحقول', true);

  try {
    const res = await fetch(`${NAHJ_API_URL}/auth/admin/change-username`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newUsername }),
    });
    const data = await res.json();
    if (data.success) {
      showMsg('usernameMsg', `تم تغيير اسم المستخدم إلى "${newUsername}" بنجاح! استخدمه في الدخول القادم.`, false);
    } else {
      showMsg('usernameMsg', data.message || 'حدث خطأ', true);
    }
  } catch (err) {
    showMsg('usernameMsg', 'تعذّر الاتصال بالخادم', true);
  }
});

// ------- إضافة مشرف جديد -------
document.getElementById('submitNewAdminBtn').addEventListener('click', async () => {
  const name = document.getElementById('newAdminName').value.trim();
  const username = document.getElementById('newAdminUsername').value.trim();
  const password = document.getElementById('newAdminPassword').value;

  if (!name || !username || !password) return showMsg('newAdminMsg', 'املأ كل الحقول', true);

  try {
    const res = await fetch(`${NAHJ_API_URL}/auth/admin/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, username, password }),
    });
    const data = await res.json();
    if (data.success) {
      showMsg('newAdminMsg', `تم إنشاء حساب "${name}" بنجاح.`, false);
      document.getElementById('newAdminName').value = '';
      document.getElementById('newAdminUsername').value = '';
      document.getElementById('newAdminPassword').value = '';
    } else {
      showMsg('newAdminMsg', data.message || 'حدث خطأ', true);
    }
  } catch (err) {
    showMsg('newAdminMsg', 'تعذّر الاتصال بالخادم', true);
  }
});

// ------- نطاق العمل + GPS -------
const map = L.map('workzoneMap').setView([24.7136, 46.6753], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);

let zoneMarker = null;
let zoneCircle = null;

function updateZoneDisplay(lat, lng, radiusMeters) {
  if (zoneMarker) map.removeLayer(zoneMarker);
  if (zoneCircle) map.removeLayer(zoneCircle);
  zoneMarker = L.marker([lat, lng], { draggable: true }).addTo(map);
  zoneCircle = L.circle([lat, lng], { radius: radiusMeters, color: '#2563eb', fillOpacity: 0.1 }).addTo(map);
  map.setView([lat, lng], 11);

  zoneMarker.on('drag', (e) => {
    const pos = e.target.getLatLng();
    zoneCircle.setLatLng(pos);
  });
}

let currentZone = { lat: 24.7136, lng: 46.6753, radiusMeters: 15000 };

async function loadWorkzone() {
  try {
    const res = await fetch(`${NAHJ_API_URL}/settings/workzone`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.success) {
      currentZone = { lat: data.lat, lng: data.lng, radiusMeters: data.radiusMeters };
      document.getElementById('radiusInput').value = data.radiusMeters;
      updateZoneDisplay(data.lat, data.lng, data.radiusMeters);
    }
  } catch (err) {
    updateZoneDisplay(currentZone.lat, currentZone.lng, currentZone.radiusMeters);
  }
}
loadWorkzone();

// زر "استخدم موقعي الحالي" - يعمل على الكمبيوتر (بدقة تقريبية عبر IP/شبكة) والجوال (بدقة GPS حقيقية)
document.getElementById('useMyLocationBtn').addEventListener('click', () => {
  const msg = document.getElementById('workzoneMsg');
  if (!navigator.geolocation) {
    showMsg('workzoneMsg', 'المتصفح لا يدعم تحديد الموقع', true);
    return;
  }
  showMsg('workzoneMsg', 'جاري تحديد موقعك...', false);

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      const radius = parseInt(document.getElementById('radiusInput').value) || 15000;
      updateZoneDisplay(latitude, longitude, radius);
      showMsg('workzoneMsg', 'تم تحديد موقعك الحالي، يمكنك سحب العلامة لضبطها ثم اضغط "حفظ".', false);
    },
    (error) => {
      showMsg('workzoneMsg', 'تعذّر الوصول لموقعك. تأكد من السماح للمتصفح بالوصول للموقع من إعدادات المتصفح.', true);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

document.getElementById('saveWorkzoneBtn').addEventListener('click', async () => {
  if (!zoneMarker) return;
  const pos = zoneMarker.getLatLng();
  const radiusMeters = parseInt(document.getElementById('radiusInput').value) || 15000;

  try {
    const res = await fetch(`${NAHJ_API_URL}/settings/workzone`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lat: pos.lat, lng: pos.lng, radiusMeters }),
    });
    const data = await res.json();
    if (data.success) {
      showMsg('workzoneMsg', 'تم حفظ نطاق العمل بنجاح.', false);
    } else {
      showMsg('workzoneMsg', data.message || 'حدث خطأ', true);
    }
  } catch (err) {
    showMsg('workzoneMsg', 'تعذّر الاتصال بالخادم', true);
  }
});

// ------- التواصل مع المناديب -------
async function loadContactInfo() {
  try {
    const res = await fetch(`${NAHJ_API_URL}/settings/contact`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.success) {
      document.getElementById('whatsappInput').value = data.whatsappNumber || '';
      document.getElementById('phoneInput').value = data.phoneNumber || '';
    }
  } catch (_) {}
}
loadContactInfo();

document.getElementById('saveContactBtn').addEventListener('click', async () => {
  const whatsappNumber = document.getElementById('whatsappInput').value.trim();
  const phoneNumber = document.getElementById('phoneInput').value.trim();
  try {
    const res = await fetch(`${NAHJ_API_URL}/settings/contact`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ whatsappNumber, phoneNumber }),
    });
    const data = await res.json();
    showMsg('contactMsg', data.success ? 'تم حفظ بيانات التواصل بنجاح.' : (data.message || 'حدث خطأ'), !data.success);
  } catch (err) {
    showMsg('contactMsg', 'تعذّر الاتصال بالخادم', true);
  }
});
