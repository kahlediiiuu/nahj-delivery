// ⚠️ رابط الخادم الحقيقي (تم تجهيزه مسبقاً، لا حاجة لتعديله)
const NAHJ_API_URL = 'https://nahj-backend.onrender.com/api';
const NAHJ_SOCKET_URL = 'https://nahj-backend.onrender.com';

// ================= شارات الإشعارات الموحّدة (تعمل في كل صفحات لوحة التحكم تلقائيًا) =================
async function updateNavBadges() {
  const badgeToken = sessionStorage.getItem('nahj_admin_token');
  if (!badgeToken) return;

  try {
    const res = await fetch(`${NAHJ_API_URL}/notifications/summary`, { headers: { Authorization: `Bearer ${badgeToken}` } });
    const data = await res.json();
    if (!data.success) return;

    const setBadge = (id, count) => {
      const el = document.getElementById(id);
      if (!el) return; // الصفحة الحالية قد لا تحتوي هذا الرابط
      if (count > 0) {
        el.textContent = count > 99 ? '99+' : count;
        el.classList.add('show');
      } else {
        el.classList.remove('show');
      }
    };

    setBadge('badge-messages', data.unreadMessages);
    setBadge('badge-comments', data.pendingReportComments);
    setBadge('badge-advance', data.pendingAdvanceRequests);
    setBadge('badge-leave', data.pendingLeaveRequests);
  } catch (_) {}
}

if (sessionStorage.getItem('nahj_admin_token')) {
  updateNavBadges();
  setInterval(updateNavBadges, 30000); // كل 30 ثانية - خفيف جدًا على الخادم (مجرد أعداد، بدون محتوى)
}
