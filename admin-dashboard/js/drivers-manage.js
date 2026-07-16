const API_URL = NAHJ_API_URL;
const token = sessionStorage.getItem('nahj_admin_token');
if (!token) window.location.href = 'login.html';

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.href = 'login.html';
});

async function loadDrivers() {
  const search = document.getElementById('searchInput').value;
  const status = document.getElementById('statusFilter').value;
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status) params.set('status', status);

  const res = await fetch(`${API_URL}/drivers?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!data.success) return alert(data.message || 'خطأ في جلب البيانات');

  const tbody = document.getElementById('driversTableBody');
  tbody.innerHTML = data.drivers
    .map(
      (d) => `
    <tr>
      <td style="font-family:monospace;font-size:12px;color:#64748b;">${d.id}</td>
      <td>${d.name || ''}</td>
      <td>${d.driverCode || ''}</td>
      <td>${d.phone || ''}</td>
      <td><span class="badge ${d.status === 'suspended' ? 'badge-suspended' : 'badge-active'}">${d.status === 'suspended' ? 'موقوف' : 'نشط'}</span></td>
      <td class="actions-cell">
        <button class="btn btn-warning" onclick="openEditModal('${d.id}', '${(d.name || '').replace(/'/g, "")}', '${d.phone || ''}', '${d.driverCode || ''}')">تعديل</button>
        ${
          d.status === 'suspended'
            ? `<button class="btn btn-success" onclick="activateDriver('${d.id}')">تفعيل</button>`
            : `<button class="btn btn-warning" onclick="suspendDriver('${d.id}')">إيقاف</button>`
        }
        <button class="btn btn-danger" onclick="deleteDriver('${d.id}', '${(d.name || '').replace(/'/g, "")}')">حذف</button>
      </td>
    </tr>`
    )
    .join('');
}

document.getElementById('searchBtn').addEventListener('click', loadDrivers);
document.getElementById('searchInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') loadDrivers(); });
document.getElementById('statusFilter').addEventListener('change', loadDrivers);

// ------- نافذة الإضافة/التعديل -------
const modal = document.getElementById('driverModal');

document.getElementById('addBtn').addEventListener('click', () => {
  document.getElementById('modalTitle').textContent = 'إضافة مندوب جديد';
  document.getElementById('editDriverId').value = '';
  document.getElementById('inputName').value = '';
  document.getElementById('inputPhone').value = '';
  document.getElementById('inputCode').value = '';
  document.getElementById('inputPassword').value = '';
  document.getElementById('inputCode').disabled = false;
  document.getElementById('passwordLabel').style.display = 'block';
  document.getElementById('inputPassword').style.display = 'block';
  document.getElementById('modalError').textContent = '';
  modal.classList.remove('hidden');
});

window.openEditModal = function (id, name, phone, code) {
  document.getElementById('modalTitle').textContent = 'تعديل بيانات المندوب';
  document.getElementById('editDriverId').value = id;
  document.getElementById('inputName').value = name;
  document.getElementById('inputPhone').value = phone;
  document.getElementById('inputCode').value = code;
  document.getElementById('inputCode').disabled = true; // لا يمكن تغيير رقم المندوب بعد إنشائه
  document.getElementById('passwordLabel').style.display = 'none';
  document.getElementById('inputPassword').style.display = 'none';
  document.getElementById('modalError').textContent = '';
  modal.classList.remove('hidden');
};

document.getElementById('cancelModalBtn').addEventListener('click', () => modal.classList.add('hidden'));

document.getElementById('saveDriverBtn').addEventListener('click', async () => {
  const id = document.getElementById('editDriverId').value;
  const name = document.getElementById('inputName').value.trim();
  const phone = document.getElementById('inputPhone').value.trim();
  const code = document.getElementById('inputCode').value.trim();
  const password = document.getElementById('inputPassword').value;
  const errorEl = document.getElementById('modalError');

  if (!name || !phone) return (errorEl.textContent = 'الاسم ورقم الجوال مطلوبان');

  try {
    let res;
    if (id) {
      // تعديل
      res = await fetch(`${API_URL}/drivers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, phone }),
      });
    } else {
      // إضافة
      if (!code || !password) return (errorEl.textContent = 'رقم المندوب وكلمة المرور مطلوبان');
      res = await fetch(`${API_URL}/drivers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, phone, driverCode: code, password }),
      });
    }

    const data = await res.json();
    if (data.success) {
      modal.classList.add('hidden');
      loadDrivers();
    } else {
      errorEl.textContent = data.message || 'حدث خطأ';
    }
  } catch (err) {
    errorEl.textContent = 'تعذّر الاتصال بالخادم';
  }
});

// ------- إيقاف / تفعيل / حذف -------
window.suspendDriver = async function (id) {
  if (!confirm('هل تريد إيقاف حساب هذا المندوب؟')) return;
  await fetch(`${API_URL}/drivers/${id}/suspend`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
  loadDrivers();
};

window.activateDriver = async function (id) {
  await fetch(`${API_URL}/drivers/${id}/activate`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
  loadDrivers();
};

window.deleteDriver = async function (id, name) {
  if (!confirm(`هل أنت متأكد من حذف "${name}" نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
  await fetch(`${API_URL}/drivers/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  loadDrivers();
};

loadDrivers();
