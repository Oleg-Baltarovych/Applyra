import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeColorScheme } from '../../test/support/color-scheme';
import { THEME_STORAGE_KEY, applyTheme, readTheme, saveTheme, watchSystemTheme } from './theme';

// jsdom has no matchMedia: stub the global (only `matches` is read by the code under test).
const prefersDark = (matches: boolean) =>
  vi.stubGlobal('matchMedia', (media: string) => ({ matches, media }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.documentElement.classList.remove('dark');
});

describe('readTheme', () => {
  it.each(['light', 'dark', 'system'] as const)('returns the stored %s', (theme) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    expect(readTheme()).toBe(theme);
  });

  it('falls back to system for a missing or unknown value', () => {
    expect(readTheme()).toBe('system');
    window.localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(readTheme()).toBe('system');
  });

  it('falls back to system when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(readTheme()).toBe('system');
  });
});

describe('applyTheme', () => {
  it('dark/light force the class regardless of the system preference', () => {
    prefersDark(false);
    applyTheme('dark');
    expect(document.documentElement).toHaveClass('dark');
    prefersDark(true);
    applyTheme('light');
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('system follows prefers-color-scheme', () => {
    prefersDark(true);
    applyTheme('system');
    expect(document.documentElement).toHaveClass('dark');
    prefersDark(false);
    applyTheme('system');
    expect(document.documentElement).not.toHaveClass('dark');
  });
});

describe('watchSystemTheme', () => {
  it('re-applies system on OS scheme changes until unsubscribed', () => {
    const scheme = fakeColorScheme(false);
    const stop = watchSystemTheme();
    scheme.setDark(true);
    expect(document.documentElement).toHaveClass('dark');
    scheme.setDark(false);
    expect(document.documentElement).not.toHaveClass('dark');
    stop();
    expect(scheme.listenerCount()).toBe(0);
  });
});

describe('public/theme-init.js', () => {
  it('reads the same storage key and values (pins against drift)', () => {
    const script = readFileSync(
      path.join(import.meta.dirname, '../../public/theme-init.js'),
      'utf8',
    );
    expect(script).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
    expect(script).toContain("stored === 'light' || stored === 'dark'");
  });
});

describe('saveTheme', () => {
  it('stores the preference under the theme-init.js key and applies it', () => {
    prefersDark(false);
    saveTheme('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
  });

  it('still applies the theme when storage throws', () => {
    prefersDark(false);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    saveTheme('dark');
    expect(document.documentElement).toHaveClass('dark');
  });
});
