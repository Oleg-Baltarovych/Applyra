import { canonicalUrl } from './normalize/url.ts';
import type { Vacancy } from './types.ts';

/** Persisted between runs (state.ts): dedup key → ISO time it was sent. */
export interface SentState {
  version: 1;
  sent: Record<string, string>;
}

const DEFAULT_TTL_DAYS = 30;

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

// Cross-site repeats (ADR 029): Djinni rarely names the company, so the same post on DOU and Djinni has no
// common fuzzy key. The full title (words in brackets included) then stands in for it — only when at least
// one side has no company, the title has ≥ 4 words, and within 7 days.
const MIN_TITLE_WORDS = 4;
const TITLE_MATCH_DAYS = 7;

/** Title key of a vacancy: `tk:` (company known) or `tu:` (unknown); undefined for short titles. */
function titleKey(v: Vacancy): string | undefined {
  const words = [...new Set(tokens(v.title.replace(/[()[\]]/g, ' ')).filter((t) => !NOISE.has(t)))];
  if (words.length < MIN_TITLE_WORDS) return undefined;
  return `${v.company.trim() ? 'tk' : 'tu'}:${words.sort().join(' ')}`;
}

/** A vacancy with a company repeats only a company-less one (`tu:`); a company-less one repeats either. */
const titleMatches = (key: string): string[] =>
  key.startsWith('tk:') ? [`tu:${key.slice(3)}`] : [key, `tk:${key.slice(3)}`];

function dedupKeys(v: Vacancy): string[] {
  const fuzzy = fuzzyKey(v);
  const title = titleKey(v);
  return [`url:${canonicalUrl(v.url)}`, ...(fuzzy ? [fuzzy] : []), ...(title ? [title] : [])];
}

/**
 * Vacancies not sent before and not repeated within this batch. Posts that name the company go first, so
 * of a cross-site pair the one with the company is kept; otherwise the first occurrence wins.
 */
export function selectNew(vacancies: Vacancy[], state: SentState, now: Date): Vacancy[] {
  const seen = new Map(Object.entries(state.sent).map(([k, at]) => [k, Date.parse(at)]));
  const titleCutoff = now.getTime() - TITLE_MATCH_DAYS * 86_400_000;
  const known = vacancies.filter((v) => v.company.trim());
  const unknown = vacancies.filter((v) => !v.company.trim());
  const out: Vacancy[] = [];
  for (const v of [...known, ...unknown]) {
    const keys = dedupKeys(v);
    const repeated = keys.some((k) =>
      /^t[ku]:/.test(k)
        ? titleMatches(k).some((m) => (seen.get(m) ?? -Infinity) >= titleCutoff)
        : seen.has(k),
    );
    if (repeated) continue;
    for (const k of keys) seen.set(k, now.getTime());
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
