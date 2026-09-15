// User-facing notification bell, shared by any page that includes it.

async function loadNotifications() {
  try {
    const notifications = await api.get('/notifications');
    renderNotifications(notifications);
  } catch {
    // notifications are non-critical — fail quietly rather than blocking the page
  }
}

function renderNotifications(notifications) {
  const unreadCount = notifications.filter((n) => !n.read).length;
  const badge = document.getElementById('notif-badge');
  if (badge) {
    badge.style.display = unreadCount > 0 ? 'flex' : 'none';
    badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
  }

  const dropdown = document.getElementById('notif-dropdown');
  if (!dropdown) return;

  dropdown.innerHTML = notifications.length
    ? notifications.map((n) => `
        <div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n._id}">
          <h4>${escapeHtmlNotif(n.title)}</h4>
          <p>${escapeHtmlNotif(n.message)}</p>
        </div>
      `).join('')
    : '<div class="notif-item"><p>No notifications yet.</p></div>';

  dropdown.querySelectorAll('.notif-item[data-id]').forEach((el) => {
    el.addEventListener('click', async () => {
      el.classList.remove('unread');
      await api.post(`/notifications/${el.dataset.id}/read`, {});
      loadNotifications();
    });
  });
}

function escapeHtmlNotif(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

const bell = document.getElementById('notif-bell');
if (bell) {
  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('notif-dropdown').classList.toggle('open');
  });
  document.addEventListener('click', () => {
    document.getElementById('notif-dropdown')?.classList.remove('open');
  });

  loadNotifications();
  setInterval(loadNotifications, 30000);
}
