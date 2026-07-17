const token = sessionStorage.getItem('nahj_admin_token');
if (!token) window.location.href = 'login.html';

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.href = 'login.html';
});

let currentDriverId = null;
let conversations = [];

const motivationalPresets = [
  { label: '🙏 رسالة شكر', text: 'شكراً لجهودك المتميزة اليوم، نقدّر التزامك! 🌟' },
  { label: '🎉 تهنئة', text: 'تهانينا! أداؤك هذا الأسبوع كان ممتازاً، استمر! 🎉' },
  { label: '💪 تحفيز', text: 'أنت جزء مهم من فريق نهج للتوصيل، استمر بنفس الحماس! 💪' },
  { label: '🎁 عرض/مكافأة', text: 'لديك مكافأة جديدة بانتظارك! تواصل مع الإدارة للتفاصيل 🎁' },
  { label: '📢 إعلان عام', text: '' },
];

async function loadConversations() {
  const res = await fetch(`${NAHJ_API_URL}/messages/conversations`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!data.success) return;
  conversations = data.conversations;
  renderConvList();
}

function renderConvList(filter = '') {
  const f = filter.trim().toLowerCase();
  const list = document.getElementById('convList');
  list.innerHTML = conversations
    .filter((c) => !f || c.name?.toLowerCase().includes(f) || c.driverCode?.toLowerCase().includes(f))
    .map(
      (c) => `
    <div class="conv-item ${c.driverId === currentDriverId ? 'active' : ''}" onclick="openConversation('${c.driverId}')">
      <div class="conv-name">
        <span>${c.name || 'مندوب'} <small style="color:#94a3b8;">#${c.driverCode || ''}</small></span>
        ${c.unreadCount > 0 ? `<span class="badge-unread">${c.unreadCount}</span>` : ''}
      </div>
      <div class="conv-last">${c.lastMessage || 'لا توجد رسائل بعد'}</div>
    </div>`
    )
    .join('');
}

let currentMessages = [];

window.openConversation = async function (driverId) {
  currentDriverId = driverId;
  renderConvList(document.getElementById('convSearch')?.value || '');
  document.getElementById('chatInputRow').style.display = 'flex';
  document.getElementById('chatToolsRow').style.display = 'flex';
  document.getElementById('chatSearchInput').value = '';
  await loadMessages();
};

async function loadMessages() {
  if (!currentDriverId) return;
  const res = await fetch(`${NAHJ_API_URL}/messages/driver/${currentDriverId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.success) return;
  currentMessages = data.messages;
  renderMessages(currentMessages);
}

function renderMessages(messages) {
  const container = document.getElementById('chatMessages');
  container.innerHTML = messages
    .map((m) => {
      const time = new Date(m.createdAt).toLocaleString('ar-SA', {
        year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      const isAdmin = m.sender === 'admin';
      const responseBlock = m.response
        ? `<div style="margin-top:6px;padding:6px 8px;background:rgba(0,0,0,.06);border-radius:8px;font-size:12px;">رد المندوب: ${m.response}</div>`
        : (m.requiresResponse ? `<div style="margin-top:6px;font-size:11px;color:#eab308;">⏳ بانتظار رد المندوب</div>` : '');

      return `
        <div class="msg-bubble ${isAdmin ? 'msg-admin' : 'msg-driver'}">
          ${m.text}
          ${responseBlock}
          <div class="msg-time">${time}</div>
          ${isAdmin ? `
            <div style="margin-top:6px;display:flex;gap:6px;">
              <button onclick="resendMessage('${m.id}')" style="font-size:11px;padding:3px 8px;border:1px solid #fff;background:transparent;color:#fff;border-radius:6px;cursor:pointer;">🔁 إعادة إرسال</button>
              <button onclick="deleteMessage('${m.id}')" style="font-size:11px;padding:3px 8px;border:1px solid #fff;background:transparent;color:#fff;border-radius:6px;cursor:pointer;">🗑️ حذف</button>
            </div>` : ''}
        </div>`;
    })
    .join('');
  container.scrollTop = container.scrollHeight;
}

document.getElementById('chatSearchInput')?.addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) return renderMessages(currentMessages);
  renderMessages(currentMessages.filter((m) => m.text.toLowerCase().includes(q)));
});

window.deleteWholeConversation = async function () {
  if (!currentDriverId) return;
  if (!confirm('هل أنت متأكد من حذف كامل المحادثة مع هذا المندوب نهائيًا؟ لا يمكن التراجع.')) return;
  await fetch(`${NAHJ_API_URL}/messages/driver/${currentDriverId}/all`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  currentMessages = [];
  renderMessages([]);
  loadConversations();
  alert('تم حذف المحادثة بالكامل.');
};

window.deleteMessage = async function (messageId) {
  if (!confirm('حذف هذه الرسالة نهائياً من السجل؟')) return;
  await fetch(`${NAHJ_API_URL}/messages/${messageId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  await loadMessages();
};

window.resendMessage = async function (messageId) {
  await fetch(`${NAHJ_API_URL}/messages/${messageId}/resend`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  alert('تمت إعادة إرسال الإشعار بنجاح');
};

document.getElementById('sendBtn').addEventListener('click', () => sendMessage());
document.getElementById('messageInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

async function sendMessage(presetText) {
  const input = document.getElementById('messageInput');
  const text = presetText || input.value.trim();
  if (!text || !currentDriverId) return;

  input.value = '';
  await fetch(`${NAHJ_API_URL}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ driverId: currentDriverId, text }),
  });
  await loadMessages();
  await loadConversations();
}

document.getElementById('convSearch')?.addEventListener('input', (e) => renderConvList(e.target.value));

document.getElementById('motivationalSelect')?.addEventListener('change', (e) => {
  const preset = motivationalPresets[e.target.value];
  if (preset && preset.text) {
    document.getElementById('messageInput').value = preset.text;
  }
});

setInterval(() => {
  loadConversations();
  if (currentDriverId) loadMessages();
}, 5000);

loadConversations();
