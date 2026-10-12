// Light, dark or auto theme. Lives outside the dashboard so it also applies to the empty state.
// The choice is a per-browser convenience in localStorage; "Forget my data" leaves it alone.
// `onChange` runs after every switch (and when the system theme flips while on auto) so the
// charts can re-read the CSS colour variables.

const KEY = 'spend-theme';
const THEMES = ['auto', 'light', 'dark'];

export function currentTheme() {
  try { const t = localStorage.getItem(KEY); if (THEMES.includes(t)) return t; } catch { /* storage unavailable */ }
  return 'auto';
}

export function applyTheme(theme = currentTheme()) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
  document.querySelectorAll('[data-theme-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-btn') === theme)));
}

export function setTheme(theme) {
  if (!THEMES.includes(theme)) return;
  try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
  applyTheme(theme);
}

export function setupTheme(onChange = () => {}) {
  applyTheme();
  document.querySelectorAll('[data-theme-btn]').forEach((b) => b.addEventListener('click', () => { setTheme(b.getAttribute('data-theme-btn')); onChange(); }));
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (currentTheme() === 'auto') onChange(); });
}
