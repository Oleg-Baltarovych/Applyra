import { createHash } from 'node:crypto';
import { experienceYears } from '../text.ts';
import type { Currency, RawItem, RemoteMode, Salary, Vacancy } from '../types.ts';
import { canonicalUrl, isHttpUrl } from './url.ts';

/** Single-line text: any whitespace run (incl. CR/LF) → one space, so feed text cannot start a log line. */
const clean = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

const CURRENCIES: [RegExp, Currency][] = [
  [/\$|usd|дол/i, 'USD'],
  [/€|eur|євро/i, 'EUR'],
  [/₴|uah|грн/i, 'UAH'],
];

/** "$3000–4000", "від $2500", "до 90 000 грн", "up to 5k USD" → Salary; undefined if unreadable. */
export function parseSalary(text: string | undefined): Salary | undefined {
  if (!text) return undefined;
  const currency = CURRENCIES.find(([re]) => re.test(text))?.[1];
  if (!currency) return undefined;
  const amounts = [...text.matchAll(/(\d[\d\s.,]*)(k)?/gi)]
    .map((m) => {
      const n = Number((m[1] ?? '').replace(/[\s.,]/g, ''));
      return m[2] ? n * 1000 : n;
    })
    .filter((n) => n > 0);
  const [first, second] = amounts;
  if (first === undefined) return undefined;
  if (second !== undefined)
    return { min: Math.min(first, second), max: Math.max(first, second), currency };
  // (?!\p{L}) instead of \b: \b is ASCII-only and never matches after "до"/"від".
  if (/(^|\s)(до|up to|to|max)(?!\p{L})/iu.test(text)) return { max: first, currency };
  if (/(^|\s)(від|от|from|min)(?!\p{L})/iu.test(text)) return { min: first, currency };
  return { min: first, max: first, currency };
}

/** Remote/hybrid/office from free text (en/uk/ru). */
export function parseRemote(text: string | undefined): RemoteMode {
  const t = (text ?? '').toLowerCase();
  if (/hybrid|гібрид|гибрид/.test(t)) return 'hybrid';
  if (/remote|віддален|дистанц|удален/.test(t)) return 'remote';
  if (/office|офіс|офис|on-?site/.test(t)) return 'office';
  return 'unknown';
}

const REMOTE_WORDS = /^(remote|віддалено|дистанційно|hybrid|гібрид|office|офіс|on-?site)$/i;

/** Raw source item → Vacancy, or undefined when it lacks a usable title or http(s) url. */
export function normalize(raw: RawItem, now: Date): Vacancy | undefined {
  const title = clean(raw.title);
  const url = canonicalUrl(raw.url);
  if (!title || !isHttpUrl(url)) return undefined;
  const id = clean(raw.sourceId) || createHash('sha256').update(url).digest('hex').slice(0, 16);
  const published = raw.publishedAt ? new Date(raw.publishedAt) : now;
  const location = clean(raw.location);
  const salary = parseSalary(raw.salary);
  const experience = raw.experience ? experienceYears(raw.experience) : undefined;
  const description = clean(raw.description);
  return {
    id: `${raw.source}:${id}`,
    source: raw.source,
    url,
    title,
    company: clean(raw.company),
    ...(salary ? { salary } : {}),
    location: {
      cities: location
        .split(/[,;/]/)
        .map((c) => c.trim())
        .filter((c) => c && !REMOTE_WORDS.test(c)),
      remote: parseRemote(location),
    },
    ...(experience !== undefined ? { experienceYears: experience } : {}),
    publishedAt: Number.isNaN(published.getTime()) ? now : published,
    ...(description ? { description } : {}),
  };
}
