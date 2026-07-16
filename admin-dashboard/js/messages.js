const token = sessionStorage.getItem('nahj_admin_token');
if (!token) window.location.href = 'login.html';

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.href = 'login.html';
});

let currentDriverId = null;
let conversations = [];

async function loadConversations() {
  const res = await fetch(`${NAHJ_API_URL}/messages/conversations`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!data.success) return;
  conversations = data.conversations;
  renderConvList();
}

function renderConvList() {
  const list = document.getElementById('convList');
  list.innerHTML = conversations
    .map(
      (c) => `
    <div class="conv-item ${c.driverId === currentDriverId ? 'active' : ''}" onclick="openConversation('${c.driverId}')">
      <div class="conv-name">
        <span>${c.name || 'مندوب'}</span>
        ${c.unreadCount > 0 ? `<span class="badge-unread">${c.unreadCount}</span>` : ''}
      </div>
      <div class="conv-last">${c.lastMessage || 'لا توجد رسائل بعد'}</div>
    </div>`
    )
    .join('');
}

window.openConversation = async function (driverId) {
  currentDriverId = driverId;
  renderConvList();
  document.getElementById('chatInputRow').style.display = 'flex';
  await loadMessages();
};

async function loadMessages() {
  if (!currentDriverId) return;
  const res = await fetch(`${NAHJ_API_URL}/messages/driver/${currentDriverId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.success) return;

  const container = document.getElementById('chatMessages');
  container.innerHTML = data.messages
    .map((m) => {
      const time = new Date(m.createdAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
      return `<div class="msg-bubble ${m.sender === 'admin' ? 'msg-admin' : 'msg-driver'}">${m.text}<div class="msg-time">${time}</div></div>`;
    })
    .join('');
  container.scrollTop = container.scrollHeight;
}

document.getElementById('sendBtn').addEventListener('click', sendMessage);
document.getElementById('messageInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

async function sendMessage() {
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
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

// تحديث دوري كل 5 ثوانٍ (رسائل جديدة + قائمة المحادثات)
setInterval(() => {
  loadConversations();
  if (currentDriverId) loadMessages();
}, 5000);

loadConversations();
