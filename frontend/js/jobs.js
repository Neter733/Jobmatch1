let currentPage = 1;
let currentFilters = { country: '', industry: '', q: '' };

async function loadFilters() {
  try {
    const { countries, industries } = await api.get('/jobs/filters');
    const countrySelect = document.getElementById('country-filter');
    const industrySelect = document.getElementById('industry-filter');

    countries.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      countrySelect.appendChild(opt);
    });

    industries.forEach((i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = i;
      industrySelect.appendChild(opt);
    });
  } catch {
    // filters are non-critical — the page still works without them populated
  }
}

async function loadJobs() {
  const loadingText = document.getElementById('loading-text');
  const list = document.getElementById('job-list');
  loadingText.style.display = 'block';
  list.innerHTML = '';

  const params = new URLSearchParams({ page: currentPage, pageSize: 24 });
  if (currentFilters.country) params.set('country', currentFilters.country);
  if (currentFilters.industry) params.set('industry', currentFilters.industry);
  if (currentFilters.q) params.set('q', currentFilters.q);

  try {
    const data = await api.get(`/jobs/browse?${params.toString()}`);
    loadingText.style.display = 'none';
    renderJobs(data.jobs);
    renderPagination(data.page, data.totalPages);
  } catch (err) {
    loadingText.textContent = err.message;
  }
}

function renderJobs(jobs) {
  const list = document.getElementById('job-list');
  if (!jobs.length) {
    list.innerHTML = '<p style="color:var(--muted);font-size:0.9rem;">No jobs match these filters right now.</p>';
    return;
  }

  list.innerHTML = jobs.map((job) => `
    <div class="browse-card">
      <div>
        <p class="browse-card-title">${escapeHtml(job.title)}</p>
        <p class="browse-card-meta">${escapeHtml(job.company || '')} · ${escapeHtml(job.location || '')} · ${timeAgo(job.createdAt)}</p>
      </div>
      <div>
        ${job.industry ? `<span class="browse-card-tag">${escapeHtml(job.industry)}</span>` : ''}
        <a href="signup.html" class="btn btn-outline" style="padding:8px 16px;font-size:0.8rem;">See my match</a>
      </div>
    </div>
  `).join('');
}

function renderPagination(page, totalPages) {
  const container = document.getElementById('pagination');
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let html = '';
  if (page > 1) html += `<button class="btn btn-outline" data-page="${page - 1}">Previous</button>`;
  html += `<span style="font-size:0.85rem;color:var(--muted);align-self:center;">Page ${page} of ${totalPages}</span>`;
  if (page < totalPages) html += `<button class="btn btn-outline" data-page="${page + 1}">Next</button>`;

  container.innerHTML = html;
  container.querySelectorAll('[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentPage = Number(btn.dataset.page);
      loadJobs();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  return new Date(dateStr).toLocaleDateString();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

document.getElementById('country-filter').addEventListener('change', (e) => {
  currentFilters.country = e.target.value;
  currentPage = 1;
  loadJobs();
});

document.getElementById('industry-filter').addEventListener('change', (e) => {
  currentFilters.industry = e.target.value;
  currentPage = 1;
  loadJobs();
});

document.getElementById('search-btn').addEventListener('click', runSearch);
document.getElementById('search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runSearch();
});

function runSearch() {
  currentFilters.q = document.getElementById('search-input').value.trim();
  currentPage = 1;
  loadJobs();
}

loadFilters();
loadJobs();
