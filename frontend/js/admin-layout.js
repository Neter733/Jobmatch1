// Shared sidebar + auth guard + online-heartbeat for every staff/manager/
// admin page. Include this script and call renderAdminLayout('dashboard')
// (or whichever page key matches the current page) after the DOM is ready.

if (!localStorage.getItem('adminToken')) {
  window.location.href = 'login.html';
}

const ADMIN_OPTS = { tokenKey: 'adminToken' };

function renderAdminLayout(activePage) {
  const role = localStorage.getItem('adminRole');
  const name = localStorage.getItem('adminName') || 'Team';
  const isManagerOrAbove = role === 'manager' || role === 'admin';

  const links = [
    { key: 'dashboard', href: 'dashboard.html', label: 'Dashboard', visible: true },
    { key: 'queue', href: 'queue.html', label: 'Application queue', visible: true },
    { key: 'users', href: 'users.html', label: 'Users', visible: true },
    { key: 'team', href: 'team.html', label: 'Team', visible: isManagerOrAbove, badgeId: 'sidebar-escalation-badge' },
    { key: 'job-sources', href: 'job-sources.html', label: 'Job sources', visible: isManagerOrAbove },
    { key: 'messages', href: 'messages.html', label: 'Messages', visible: true }
  ];

  const sidebar = document.getElementById('admin-sidebar-root');
  if (sidebar) {
    sidebar.innerHTML = `
      <div class="navbar-logo" style="color:white;">JobMatch<span style="color:var(--success);">.</span></div>
      <p style="padding:0 20px;font-size:0.72rem;color:rgba(255,255,255,0.5);margin:4px 0 20px;">
        ${escapeHtmlLayout(name)} · ${role}
      </p>
      ${links.filter((l) => l.visible).map((l) => `
        <a href="${l.href}" class="admin-nav-link ${l.key === activePage ? 'active' : ''}">
          ${l.label}${l.badgeId ? `<span id="${l.badgeId}" style="display:none;background:var(--error);color:white;font-size:0.68rem;min-width:16px;height:16px;border-radius:8px;display:none;align-items:center;justify-content:center;padding:0 5px;float:right;"></span>` : ''}
        </a>
      `).join('')}
      <a href="#" class="admin-nav-link" id="admin-logout-link" style="margin-top:20px;color:rgba(255,255,255,0.4);">Log out</a>
    `;
    document.getElementById('admin-logout-link').addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminRole');
      localStorage.removeItem('adminName');
      localStorage.removeItem('adminId');
      window.location.href = 'login.html';
    });
  }

  // Heartbeat every 30s so managers can see who's genuinely online
  sendHeartbeat();
  setInterval(sendHeartbeat, 30000);

  // Escalation badge — manager/admin only, skip entirely on the team page
  // itself since escalations are already shown right there.
  if (isManagerOrAbove && activePage !== 'team') {
    loadEscalationBadge();
    setInterval(loadEscalationBadge, 20000);
  }
}

async function loadEscalationBadge() {
  try {
    const escalations = await api.get('/team/escalations', ADMIN_OPTS);
    const badge = document.getElementById('sidebar-escalation-badge');
    if (!badge) return;
    if (escalations.length > 0) {
      badge.style.display = 'inline-flex';
      badge.textContent = escalations.length > 9 ? '9+' : escalations.length;
    } else {
      badge.style.display = 'none';
    }
  } catch {
    // non-critical — the badge just won't show if this fails
  }
}

async function sendHeartbeat() {
  try {
    await api.post('/staff/heartbeat', {}, ADMIN_OPTS);
  } catch {
    // if this fails because the token expired, other API calls on the
    // page will surface that error more usefully — no need to duplicate here
  }
}

function escapeHtmlLayout(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
