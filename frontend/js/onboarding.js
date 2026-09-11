if (!localStorage.getItem('token')) {
  window.location.href = 'login.html';
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function setupToggle(toggleId, uploadBlockId, typeBlockId) {
  const toggle = document.getElementById(toggleId);
  const uploadBlock = document.getElementById(uploadBlockId);
  const typeBlock = document.getElementById(typeBlockId);

  toggle.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      toggle.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const isUpload = btn.dataset.mode === 'upload';
      uploadBlock.style.display = isUpload ? 'block' : 'none';
      typeBlock.style.display = isUpload ? 'none' : 'block';
    });
  });
}

setupToggle('cv-toggle', 'cv-upload-block', 'cv-type-block');

// ---- CV save ----
document.getElementById('cv-save-btn').addEventListener('click', async () => {
  const btn = document.getElementById('cv-save-btn');
  const errorEl = document.getElementById('cv-error');
  errorEl.style.display = 'none';

  const isUploadMode = document.querySelector('#cv-toggle button.active').dataset.mode === 'upload';
  const file = document.getElementById('cv-file').files[0];
  const text = document.getElementById('cv-text').value;

  if (isUploadMode && !file) return showFieldError(errorEl, 'Choose a file first.');
  if (!isUploadMode && !text.trim()) return showFieldError(errorEl, 'Type your CV details first.');

  btn.disabled = true;
  btn.textContent = 'Processing…';
  try {
    if (isUploadMode) {
      const formData = new FormData();
      formData.append('file', file);
      await api.postForm('/profile/cv/upload', formData);
    } else {
      await api.post('/profile/cv/text', { text });
    }
    btn.textContent = 'Saved ✓';
  } catch (err) {
    showFieldError(errorEl, err.message);
    btn.textContent = 'Save CV';
  } finally {
    btn.disabled = false;
  }
});

function showFieldError(el, message) {
  el.textContent = message;
  el.style.display = 'block';
}

// ---- Cover letter ----
const clUploadBlock = document.getElementById('cl-upload-block');
document.getElementById('cl-toggle').querySelectorAll('button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#cl-toggle button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    clUploadBlock.style.display = btn.dataset.mode === 'upload' ? 'block' : 'none';
  });
});

document.getElementById('cl-extract-btn').addEventListener('click', async () => {
  const btn = document.getElementById('cl-extract-btn');
  const errorEl = document.getElementById('cl-extract-error');
  errorEl.style.display = 'none';

  const file = document.getElementById('cl-file').files[0];
  if (!file) return showFieldError(errorEl, 'Choose a file first.');

  btn.disabled = true;
  btn.textContent = 'Reading your cover letter…';
  try {
    const formData = new FormData();
    formData.append('file', file);
    const data = await api.postForm('/profile/cover-letter/extract', formData);
    document.getElementById('q1').value = data.greatestAchievement || '';
    document.getElementById('q2').value = data.skillsAndTools || '';
    document.getElementById('q3').value = data.experienceSummary || '';
    updateWordCounts();
  } catch (err) {
    showFieldError(errorEl, err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Extract answers from file';
  }
});

const MIN_PER_QUESTION = 250;
const REQUIRED_TOTAL = 1000;

function updateWordCounts() {
  const q1 = countWords(document.getElementById('q1').value);
  const q2 = countWords(document.getElementById('q2').value);
  const q3 = countWords(document.getElementById('q3').value);
  const total = q1 + q2 + q3;

  setCounter('q1-count', q1, MIN_PER_QUESTION);
  setCounter('q2-count', q2, MIN_PER_QUESTION);
  setCounter('q3-count', q3, MIN_PER_QUESTION);

  const totalEl = document.getElementById('total-count');
  totalEl.textContent = `${total} / ${REQUIRED_TOTAL} words`;
  totalEl.classList.toggle('met', total >= REQUIRED_TOTAL);

  const saveBtn = document.getElementById('cl-save-btn');
  saveBtn.disabled = !(total >= REQUIRED_TOTAL && q1 >= MIN_PER_QUESTION && q2 >= MIN_PER_QUESTION && q3 >= MIN_PER_QUESTION);
}

function setCounter(elId, count, min) {
  const el = document.getElementById(elId);
  el.textContent = `${count} / ${min} words minimum`;
  el.classList.toggle('met', count >= min);
}

['q1', 'q2', 'q3'].forEach((id) => {
  document.getElementById(id).addEventListener('input', updateWordCounts);
});
updateWordCounts();

document.getElementById('cl-save-btn').addEventListener('click', async () => {
  const btn = document.getElementById('cl-save-btn');
  const errorEl = document.getElementById('cl-error');
  errorEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await api.post('/profile/cover-letter', {
      greatestAchievement: document.getElementById('q1').value,
      skillsAndTools: document.getElementById('q2').value,
      experienceSummary: document.getElementById('q3').value
    });
    btn.textContent = 'Saved ✓';
  } catch (err) {
    showFieldError(errorEl, err.message);
    btn.textContent = 'Save answers';
    btn.disabled = false;
  }
});
