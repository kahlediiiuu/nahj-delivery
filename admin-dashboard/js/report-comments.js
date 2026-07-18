const token = sessionStorage.getItem('nahj_admin_token');
if (!token) window.location.href = 'login.html';

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.href = 'login.html';
});

let driversList = [];
let driversMap = {};

async function loadDrivers() {
  const res = await fetch(`${NAHJ_API_URL}/drivers`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.success) {
    driversList = data.drivers;
    driversMap = {};
    driversList.forEach((d) => (driversMap[d.id] = d));
    const select = document.getElementById('noteDriverSelect');
    select.innerHTML = driversList.map((d) => `<option value="${d.id}">${d.name} (#${d.driverCode})</option>`).join('');
  }
}
loadDrivers();

document.getElementById('noteDate').valueAsDate = new Date(Date.now() - 86400000);

document.getElementById('sendNoteBtn').addEventListener('click', async () => {
  const driverId = document.getElementById('noteDriverSelect').value;
  const reportType = document.getElementById('noteReportType').value;
  const date = document.getElementById('noteDate').value;
  const text = document.getElementById('noteText').value.trim();
  const requiresResponse = document.getElementById('noteRequiresResponse').checked;
  const msg = document.getElementById('sendNoteMsg');

  if (!driverId || !date || !text) {
    msg.textContent = 'اختر المندوب والتاريخ واكتب نص الملاحظة';
    msg.style.color = '#dc2626';
    return;
  }

  try {
    const res = await fetch(`${NAHJ_API_URL}/performance/${driverId}/${date}/admin-note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, reportType, requiresResponse }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      msg.textContent = '✅ تم إرسال الملاحظة بنجاح، ووصل إشعار فوري للمندوب.';
      msg.style.color = '#16a34a';
      document.getElementById('noteText').value = '';
      loadComments();
    } else {
      msg.textContent = '❌ فشل الإرسال: ' + (data.message || 'خطأ غير معروف');
      msg.style.color = '#dc2626';
    }
  } catch (_) {
    msg.textContent = '❌ تعذّر الاتصال بالخادم';
    msg.style.color = '#dc2626';
  }
});

async function loadComments() {
  const container = document.getElementById('commentsList');
  try {
    const res = await fetch(`${NAHJ_API_URL}/performance/comments/all`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!data.success) {
      container.innerHTML = '<p style="color:#dc2626;">تعذّر تحميل الملاحظات</p>';
      return;
    }

    let comments = data.comments;
    const typeFilter = document.getElementById('filterReportType').value;
    const pendingFilter = document.getElementById('filterPending').value;
    if (typeFilter) comments = comments.filter((c) => (c.reportType || 'performance') === typeFilter);
    if (pendingFilter === 'pending') comments = comments.filter((c) => c.sender === 'driver' && !c.response);

    if (comments.length === 0) {
      container.innerHTML = '<p style="color:#94a3b8;">لا توجد ملاحظات مطابقة</p>';
      return;
    }

    container.innerHTML = comments
      .map((c) => {
        const d = driversMap[c.driverId] || {};
        const time = new Date(c.createdAt).toLocaleString('ar-SA', {
          year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
        const reportBadge = (c.reportType || 'performance') === 'operations'
          ? '<span class="comment-badge badge-operations">📈 تشغيل</span>'
          : '<span class="comment-badge badge-performance">📊 أداء</span>';
        const senderBadge = c.sender === 'admin'
          ? '<span class="comment-badge badge-admin">مشرف</span>'
          : '<span class="comment-badge badge-driver">مندوب</span>';

        const responseBlock = c.response
          ? `<div class="response-box">💬 الرد: ${c.response}</div>`
          : (c.sender === 'driver'
              ? `<div class="reply-row">
                   <input type="text" id="reply-${c.id}" placeholder="اكتب ردك هنا...">
                   <button class="btn" onclick="window.replyToComment('${c.id}')">إرسال الرد</button>
                 </div>`
              : '<span class="pending-tag">⏳ بانتظار رد المندوب</span>');

        return `
          <div class="comment-item">
            <div class="comment-meta">
              <b>${d.name || c.driverId}</b> (#${d.driverCode || ''}) — ${time}
              ${reportBadge} ${senderBadge}
              — تاريخ التقرير: ${c.date}
            </div>
            <div class="comment-text">${c.text}</div>
            ${responseBlock}
          </div>`;
      })
      .join('');
  } catch (_) {
    container.innerHTML = '<p style="color:#dc2626;">تعذّر الاتصال بالخادم</p>';
  }
}

window.replyToComment = async function (commentId) {
  const input = document.getElementById(`reply-${commentId}`);
  const text = input.value.trim();
  if (!text) return alert('اكتب نص الرد أولًا');

  try {
    const res = await fetch(`${NAHJ_API_URL}/performance/comments/${commentId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      loadComments();
    } else {
      alert('❌ فشل إرسال الرد: ' + (data.message || 'خطأ غير معروف'));
    }
  } catch (_) {
    alert('❌ تعذّر الاتصال بالخادم');
  }
};

document.getElementById('refreshCommentsBtn').addEventListener('click', loadComments);
document.getElementById('filterReportType').addEventListener('change', loadComments);
document.getElementById('filterPending').addEventListener('change', loadComments);

setTimeout(loadComments, 500); // تأخير بسيط لضمان اكتمال تحميل قائمة المناديب أولاً
