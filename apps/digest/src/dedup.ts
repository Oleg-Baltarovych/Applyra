import { canonicalUrl } from './normalize/url.ts';
import type { Vacancy } from './types.ts';

/** Persisted between runs (state.ts): dedup key → ISO time it was sent. */
export interface SentState {
  version: 1;
  sent: Record<string, string>;
}

export const DEFAULT_TTL_DAYS = 30;

export const emptyState = (): SentState => ({ version: 1, sent: {} });

const NOISE = new Set(['remote', 'віддалено', 'дистанційно', 'hybrid', 'full', 'time', 'fulltime']);
const COMPANY_SUFFIX = new Set(['llc', 'inc', 'ltd', 'gmbh', 'corp', 'co', 'тов', 'фоп', 'group']);

const tokens = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .split(/[^\p{L}\p{N}.#+]+/u)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean);

/** Same title + company ⇒ same vacancy, even under another url (reposts, cross-posting). */
function fuzzyKey(v: Vacancy): string | undefined {
  const company = tokens(v.company).filter((t) => !COMPANY_SUFFIX.has(t));
  if (company.length === 0) return undefined; // unknown employer: too risky to merge
  const title = [...new Set(tokens(v.title).filter((t) => !NOISE.has(t)))].sort();
  return `tc:${company.join(' ')}|${title.join(' ')}`;
}

export function dedupKeys(v: Vacancy): string[] {
  const fuzzy = fuzzyKey(v);
  return [`url:${canonicalUrl(v.url)}`, ...(fuzzy ? [fuzzy] : [])];
}

/** Vacancies not sent before and not repeated within this batch (first occurrence wins). */
export function selectNew(vacancies: Vacancy[], state: SentState): Vacancy[] {
  const seen = new Set(Object.keys(state.sent));
  const out: Vacancy[] = [];
  for (const v of vacancies) {
    const keys = dedupKeys(v);
    if (keys.some((k) => seen.has(k))) continue;
    for (const k of keys) seen.add(k);
    out.push(v);
  }
  return out;
}

export function markSent(state: SentState, vacancies: Vacancy[], at: Date): SentState {
  const sent = { ...state.sent };
  for (const v of vacancies) for (const k of dedupKeys(v)) sent[k] = at.toISOString();
  return { version: 1, sent };
}

/** Drop entries older than the TTL, so the state file stays small and old reposts may return. */
export function pruneState(state: SentState, now: Date, ttlDays = DEFAULT_TTL_DAYS): SentState {
  const cutoff = now.getTime() - ttlDays * 86_400_000;
  const sent = Object.fromEntries(
    Object.entries(state.sent).filter(([, at]) => Date.parse(at) >= cutoff),
  );
  return { version: 1, sent };
}
