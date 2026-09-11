document.addEventListener('DOMContentLoaded', () => {
  // Mobile menu toggle
  const toggle = document.querySelector('.navbar-mobile-toggle');
  const links = document.querySelector('.navbar-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const isOpen = links.classList.toggle('navbar-links-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });
  }

  // Swap "Sign in / Get started" for "Dashboard / Log out" when logged in
  const token = localStorage.getItem('token');
  const authSlot = document.querySelector('[data-nav-auth]');
  if (token && authSlot) {
    authSlot.innerHTML = `
      <a href="dashboard.html" class="btn btn-outline" style="padding:8px 16px;font-size:0.85rem;">Dashboard</a>
      <button class="btn btn-primary" style="padding:8px 16px;font-size:0.85rem;" data-logout>Log out</button>
    `;
    document.querySelector('[data-logout]')?.addEventListener('click', () => {
      localStorage.removeItem('token');
      window.location.href = 'index.html';
    });
  }
});
