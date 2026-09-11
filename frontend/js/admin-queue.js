const ADMIN_OPTS = { tokenKey: 'adminToken' };

if (!localStorage.getItem('adminToken')) {
  window.location.href = 'login.html';
}

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('adminToken');
  window.location.href = 'login.html';
});

async function loadAlerts() {
  try {
    const alerts = await api.get('/admin/alerts', ADMIN_OPTS);
    const container = document.getElementById('alerts-container');
    container.innerHTML = alerts.map((alert) => `
      <div class="alert-banner" data-id="${alert._id}">
        <span>${escapeHtml(alert.message)}</span>
        <button data-dismiss="${alert._id}">Dismiss</button>
      </div>
    `).join('');

    container.querySelectorAll('[data-dismiss]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await api.post(`/admin/alerts/${btn.dataset.dismiss}/resolve`, {}, ADMIN_OPTS);
        loadAlerts();
      });
    });
  } catch {
    // alerts are non-critical — fail quietly rather than blocking the queue view
  }
}

async function loadQueue() {
  const loadingText = document.getElementById('loading-text');
  try {
    const queue = await api.get('/admin/queue', ADMIN_OPTS);
    loadingText.style.display = 'none';
    renderQueue(queue);
  } catch (err) {
    if (err.message.includes('Admin access') || err.message.includes('authenticated')) {
      localStorage.removeItem('adminToken');
      window.location.href = 'login.html';
      return;
    }
    loadingText.textContent = err.message;
  }
}

function renderQueue(queue) {
  const container = document.getElementById('queue-container');
  if (!queue.length) {
    container.innerHTML = '<p style="color:var(--muted);font-size:0.9rem;">Nothing in the queue right now.</p>';
    return;
  }

  container.innerHTML = queue.map((item) => `
    <div class="queue-item" data-id="${item._id}">
      <div>
        <p style="font-size:0.9rem;font-weight:500;margin:0;">${escapeHtml(item.applicantName)} → ${escapeHtml(item.jobTitle)}</p>
        <p style="font-size:0.8rem;color:var(--muted);margin:2px 0 0;">
          Status: ${item.jobStatus === 'closed' ? '<span class="queue-status-closed">Job closed</span>' : 'Open'}
        </p>
        <div class="queue-links">
          <a href="${item.cvUrl}" target="_blank" rel="noreferrer">CV</a>
          <a href="${item.coverLetterUrl}" target="_blank" rel="noreferrer">Cover letter</a>
          <a href="${item.applyLink}" target="_blank" rel="noreferrer">Apply link</a>
        </div>
      </div>
      ${item.jobStatus === 'closed'
        ? `<button class="btn btn-outline replace-btn" data-id="${item._id}">Find replacement job</button>`
        : `<button class="btn btn-primary mark-applied-btn" data-id="${item._id}">Mark applied</button>`
      }
    </div>
  `).join('');

  container.querySelectorAll('.mark-applied-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Marking…';
      try {
        await api.post(`/admin/queue/${btn.dataset.id}/mark-applied`, {}, ADMIN_OPTS);
        loadQueue();
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = 'Mark applied';
      }
    });
  });

  container.querySelectorAll('.replace-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Finding replacement…';
      try {
        await api.post(`/admin/queue/${btn.dataset.id}/replace-closed-job`, {}, ADMIN_OPTS);
        loadQueue();
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = 'Find replacement job';
      }
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

loadAlerts();
loadQueue();
