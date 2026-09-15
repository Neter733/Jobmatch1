renderAdminLayout('queue');

async function loadQueue() {
  const loadingText = document.getElementById('loading-text');
  try {
    const queue = await api.get('/staff/queue', ADMIN_OPTS);
    loadingText.style.display = 'none';
    renderQueue(queue);
  } catch (err) {
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
          <a href="user-profile.html?id=${item.applicantId}" target="_blank">Full profile</a>
          <a href="${item.coverLetterUrl}" target="_blank">Cover letter</a>
          <a href="${item.applyLink}" target="_blank">Apply link</a>
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
        await api.post(`/staff/queue/${btn.dataset.id}/mark-applied`, {}, ADMIN_OPTS);
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
        await api.post(`/staff/queue/${btn.dataset.id}/replace-closed-job`, {}, ADMIN_OPTS);
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

loadQueue();
