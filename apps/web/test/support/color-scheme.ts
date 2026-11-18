// Controllable prefers-color-scheme for theme tests (jsdom has no real media queries).
import { vi } from 'vitest';

export function fakeColorScheme(initialDark = false) {
  let dark = initialDark;
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', (media: string) => ({
    media,
    get matches() {
      return dark;
    },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }));
  return {
    /** Flips the OS scheme and fires `change` like the browser does. */
    setDark(next: boolean) {
      dark = next;
      for (const listener of [...listeners]) listener();
    },
    listenerCount: () => listeners.size,
  };
}
