const TRACKING = /^(utm_\w+|fbclid|gclid|yclid|ref|_ga)$/i;

/**
 * Canonical form used for dedup: lower-case host, no fragment, no tracking params, sorted query,
 * no trailing slash. Unparseable input is returned trimmed (it still dedups by exact text).
 */
export function canonicalUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return raw.trim();
  }
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  const path = url.pathname.replace(/\/+$/, '');
  const query = url.searchParams.toString();
  return `${url.protocol}//${url.host.toLowerCase()}${path}${query ? `?${query}` : ''}`;
}

export const isHttpUrl = (s: string): boolean => /^https?:\/\//i.test(s);
