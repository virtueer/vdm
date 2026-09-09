export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'vdm-theme';

/** Reads the persisted choice; falls back to the OS preference. */
export function resolveInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch (_err) {
    // storage can be unavailable; fall through to the system preference
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (_err) {
    // persisting is best-effort
  }
}
