const token = sessionStorage.getItem('nahj_admin_token');
if (!token) window.location.href = 'login.html';

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.href = 'login.html';
});

let pickedImageBase64 = null;

document.getElementById('imageInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 700 * 1024) {
    alert('حجم الصورة كبير جدًا، الحد الأقصى تقريبًا 700 كيلوبايت');
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => { pickedImageBase64 = reader.result.split(',')[1]; };
  reader.readAsDataURL(file);
});

document.getElementById('publishBtn').addEventListener('click', async () => {
  const title = document.getElementById('titleInput').value.trim();
  const body = document.getElementById('bodyInput').value.trim();
  const msg = document.getElementById('publishMsg');

  if (!title || !body) {
    msg.textContent = 'العنوان والمحتوى مطلوبان';
    msg.style.color = '#dc2626';
    return;
  }

  try {
    const res = await fetch(`${NAHJ_API_URL}/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title, body,
        attachmentData: pickedImageBase64,
        attachmentType: pickedImageBase64 ? 'image/jpeg' : null,
      }),
    });
    const data = await res.json();
    if (data.success) {
      msg.textContent = 'تم النشر بنجاح، وصل إشعار فوري لكل المناديب.';
      msg.style.color = '#16a34a';
      document.getElementById('titleInput').value = '';
      document.getElementById('bodyInput').value = '';
      document.getElementById('imageInput').value = '';
      pickedImageBase64 = null;
      loadAnnouncements();
    } else {
      msg.textContent = data.message || 'حدث خطأ';
      msg.style.color = '#dc2626';
    }
  } catch (_) {
    msg.textContent = 'تعذّر الاتصال بالخادم';
    msg.style.color = '#dc2626';
  }
});

async function loadAnnouncements() {
  const container = document.getElementById('announcementsList');
  try {
    const res = await fetch(`${NAHJ_API_URL}/announcements`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!data.success || data.announcements.length === 0) {
      container.innerHTML = '<p style="color:#94a3b8;">لا توجد إعلانات منشورة بعد</p>';
      return;
    }

    container.innerHTML = data.announcements
      .map((a) => {
        const time = new Date(a.createdAt).toLocaleString('ar-SA', {
          year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
        const img = a.attachmentData
          ? `<img class="announcement-img" src="data:${a.attachmentType};base64,${a.attachmentData}">`
          : '';
        return `
          <div class="announcement-item">
            <div class="announcement-title">${a.title}</div>
            <div class="announcement-meta">${time}</div>
            <div class="announcement-body">${a.body}</div>
            ${img}
            <div>
              <span class="notes-toggle" onclick="toggleNotes('${a.id}')">💬 عرض ملاحظات المناديب</span>
              <button onclick="deleteAnnouncement('${a.id}')" style="margin-right:10px;font-size:12px;background:none;border:none;color:#dc2626;cursor:pointer;">🗑️ حذف</button>
            </div>
            <div id="notes-${a.id}" style="display:none;margin-top:8px;"></div>
          </div>`;
      })
      .join('');
  } catch (_) {
    container.innerHTML = '<p style="color:#dc2626;">تعذّر تحميل الإعلانات</p>';
  }
}

window.deleteAnnouncement = async function (id) {
  if (!confirm('حذف هذا الإعلان نهائيًا؟')) return;
  try {
    const res = await fetch(`${NAHJ_API_URL}/announcements/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (res.ok && data.success) {
      loadAnnouncements();
    } else {
      alert('❌ فشل الحذف: ' + (data.message || 'خطأ غير معروف'));
    }
  } catch (_) {
    alert('❌ تعذّر الاتصال بالخادم');
  }
};

window.toggleNotes = async function (announcementId) {
  const el = document.getElementById(`notes-${announcementId}`);
  if (el.style.display === 'block') {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  el.innerHTML = 'جاري التحميل...';

  try {
    const res = await fetch(`${NAHJ_API_URL}/announcements/${announcementId}/notes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!data.success || data.notes.length === 0) {
      el.innerHTML = '<p style="color:#94a3b8;font-size:12px;">لا توجد ملاحظات بعد</p>';
      return;
    }
    el.innerHTML = data.notes
      .map((n) => {
        const time = new Date(n.createdAt).toLocaleString('ar-SA', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' });
        const img = n.attachmentData ? `<img src="data:${n.attachmentType};base64,${n.attachmentData}" style="max-width:150px;border-radius:6px;margin-top:6px;display:block;">` : '';
        return `<div class="note-item"><b>${time}</b>: ${n.note}${img}</div>`;
      })
      .join('');
  } catch (_) {
    el.innerHTML = '<p style="color:#dc2626;font-size:12px;">تعذّر التحميل</p>';
  }
};

loadAnnouncements();
