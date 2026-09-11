if (!localStorage.getItem('token')) {
  window.location.href = 'login.html';
}

const FEE_PER_APPLICATION = 200;
let matches = [];
let selectedIds = new Set();

async function loadMatches() {
  const loadingText = document.getElementById('loading-text');
  try {
    matches = await api.get('/jobs/matches');
    loadingText.style.display = 'none';
    renderJobs();
  } catch (err) {
    if (err.message.includes('authenticated') || err.message.includes('Invalid or expired')) {
      localStorage.removeItem('token');
      window.location.href = 'login.html';
      return;
    }
    loadingText.textContent = err.message;
  }
}

function renderJobs() {
  const grid = document.getElementById('job-grid');
  if (!matches.length) {
    grid.innerHTML = '<p style="color:var(--muted);font-size:0.9rem;">No matches yet — make sure your CV is saved on the onboarding page.</p>';
    return;
  }

  grid.innerHTML = matches.map((job) => `
    <div class="job-card" data-id="${job._id}">
      <div class="job-card-row">
        <span class="job-card-title">${escapeHtml(job.title)}</span>
        <span class="job-card-score">${job.matchScore}% match</span>
      </div>
      <p class="job-card-loc">${escapeHtml(job.location || '')}</p>
      <button class="btn btn-outline apply-one-btn" style="width:100%;padding:8px;font-size:0.8rem;" data-id="${job._id}">Apply for me</button>
    </div>
  `).join('');

  grid.querySelectorAll('.job-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.apply-one-btn')) return;
      toggleSelect(card.dataset.id, card);
    });
  });

  grid.querySelectorAll('.apply-one-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      submitApplication([btn.dataset.id]);
    });
  });
}

function toggleSelect(id, card) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
    card.classList.remove('selected');
  } else {
    selectedIds.add(id);
    card.classList.add('selected');
  }
  updateSelectedButton();
}

function updateSelectedButton() {
  const btn = document.getElementById('apply-selected-btn');
  const count = selectedIds.size;
  btn.textContent = `Apply to ${count} selected (₦${count * FEE_PER_APPLICATION})`;
  btn.disabled = count === 0;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.getElementById('apply-selected-btn').addEventListener('click', () => {
  submitApplication([...selectedIds]);
});

document.getElementById('apply-all-btn').addEventListener('click', () => {
  submitApplication(matches.map((m) => m._id));
});

async function submitApplication(jobIds) {
  const errorEl = document.getElementById('apply-error');
  errorEl.style.display = 'none';
  if (!jobIds.length) return;

  try {
    const data = await api.post('/applications/bulk', { jobIds });
    if (data.paymentUrl) {
      window.location.href = data.paymentUrl;
    }
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
}

loadMatches();
