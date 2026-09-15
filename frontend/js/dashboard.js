if (!localStorage.getItem('token')) {
  window.location.href = 'login.html';
}

const CURRENCY_SYMBOLS = { NGN: '₦', USD: '$' };
let matches = [];
let selectedIds = new Set();
let currentPrice = { currency: 'NGN', amount: 0 }; // fetched from the backend — admin-editable, not hardcoded

async function loadPricing() {
  try {
    currentPrice = await api.get('/applications/pricing');
  } catch {
    // fall back silently — the apply buttons will just show ₦0 until this loads,
    // rather than blocking the whole page over a pricing display issue
  }
}

async function loadMyStats() {
  try {
    const stats = await api.get('/applications/my-stats');
    const spentText = stats.totalSpent.length
      ? stats.totalSpent.map((s) => `${CURRENCY_SYMBOLS[s._id] || ''}${(s.total / 100).toLocaleString()}`).join(', ')
      : `${CURRENCY_SYMBOLS[currentPrice.currency] || ''}0`;

    document.getElementById('my-stats-grid').innerHTML = `
      <div class="metric-card">
        <div class="metric-value">${spentText}</div>
        <p class="metric-label">Total spent on JobMatch</p>
      </div>
      <div class="metric-card">
        <div class="metric-value">${stats.jobsAppliedCount}</div>
        <p class="metric-label">Jobs applied to</p>
      </div>
    `;
  } catch {
    // non-critical — the page still works fine without these stats showing
  }
}

async function loadMatches() {
  const loadingText = document.getElementById('loading-text');
  try {
    await loadPricing();
    matches = await api.get('/jobs/matches');
    loadingText.style.display = 'none';
    renderJobs();
    loadMyStats();
  } catch (err) {
    if (err.message.includes('authenticated') || err.message.includes('Invalid or expired')) {
      localStorage.removeItem('token');
      window.location.href = 'login.html';
      return;
    }
    loadingText.textContent = err.message;
  }
}

function formatPrice(count) {
  const symbol = CURRENCY_SYMBOLS[currentPrice.currency] || '';
  const total = (count * currentPrice.amount) / 100; // amount is stored in minor units
  return `${symbol}${total.toLocaleString()}`;
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

  updateSelectedButton();
  updateApplyAllButton();
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
  btn.textContent = `Apply to ${count} selected (${formatPrice(count)})`;
  btn.disabled = count === 0;
}

function updateApplyAllButton() {
  const btn = document.getElementById('apply-all-btn');
  btn.textContent = `Apply to all ${matches.length} matches (${formatPrice(matches.length)})`;
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
