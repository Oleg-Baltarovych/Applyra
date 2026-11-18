// Post-sign-in target from `?next=` (10 §4.2): only a same-origin relative path, otherwise the default landing.
// Prevents open redirects (`//evil`, `/\evil`, absolute and javascript: URLs).

/** Q2 (2026-11-18): always /applications for now; the M1 Today task adds "Today if reminders are due" (FR-AUTH-01). */
export const DEFAULT_LANDING = '/applications';

const BASE = 'https://applyra.invalid';

export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return DEFAULT_LANDING;
  // Backslashes (also encoded) and control/space characters: browsers normalise them into host separators.
  if (/[\\\s\p{Cc}]|%5c/iu.test(raw)) return DEFAULT_LANDING;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return DEFAULT_LANDING;
  }
  if (url.origin !== BASE) return DEFAULT_LANDING;
  if (url.pathname === '/sign-in' || url.pathname.startsWith('/sign-in/')) return DEFAULT_LANDING;
  return url.pathname + url.search + url.hash;
}
