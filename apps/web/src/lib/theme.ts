// Theme preference (10 §8): system | light | dark in localStorage['applyra.theme'] — the same key and rules as
// public/theme-init.js, which applies it before first paint; this module changes it at runtime (Settings).
export const THEME_STORAGE_KEY = 'applyra.theme';
export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

const isTheme = (value: unknown): value is Theme => THEMES.some((theme) => theme === value);

/** Stored preference; missing, unknown or unreadable storage (privacy mode) = system. */
export function readTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** Sets `.dark` on <html>: forced by light/dark, from prefers-color-scheme for system. */
export function applyTheme(theme: Theme): void {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

/** While the preference is `system`, re-applies it when the OS scheme changes; returns the unsubscribe. */
export function watchSystemTheme(): () => void {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => applyTheme('system');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Persists (best effort: blocked storage keeps the choice for this page only) and applies the preference. */
export function saveTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked or full: the theme still applies until reload.
  }
  applyTheme(theme);
}
