/* A browser preference only; never modifies shared broadcast or admin data. */
(() => {
  const key = 'hsfm-color-theme';
  const root = document.documentElement;
  function apply(value) {
    const dark = value === 'dark';
    root.dataset.theme = dark ? 'dark' : 'light';
    const button = document.getElementById('themeToggle');
    if (!button) return;
    const label = dark ? '화이트톤으로 전환' : '다크톤으로 전환';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(dark));
    button.querySelector('.action-label').textContent = label;
  }
  let saved;
  try { saved = localStorage.getItem(key); } catch (_) { /* Storage can be disabled. */ }
  apply(saved);
  document.addEventListener('DOMContentLoaded', () => {
    apply(root.dataset.theme);
    document.getElementById('themeToggle').addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      apply(next);
      try { localStorage.setItem(key, next); } catch (_) { /* Keep the current session usable. */ }
    });
  });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) apply(event.newValue);
  });
})();

