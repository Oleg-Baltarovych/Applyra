import type { Ranked } from './filter.ts';
import { isHttpUrl } from './normalize/url.ts';
import { statusKeyboard, type InlineKeyboard } from './status.ts';
import type { Salary, Vacancy } from './types.ts';

/** Telegram sendMessage text limit. Measured on the raw HTML (stricter than Telegram's own count). */
export const TELEGRAM_LIMIT = 4096;
// Budgets in ESCAPED characters ("&" counts as the 5 chars of "&amp;"), so a block is bounded
// (~1.2k chars) whatever the feed contains.
const MAX_TITLE = 200;
const MAX_COMPANY = 100;
const MAX_CITY = 50;
const MAX_CITIES = 3;
const MAX_REASON = 60;
const MAX_HREF = 1000;
const MAX_REASONS = 3;

export interface Message {
  /** Telegram HTML (parse_mode: HTML). */
  text: string;
  /** Vacancies in this message — marked as sent only after it is delivered. */
  vacancies: Vacancy[];
  /** Status buttons (ADR 028); absent on the header. */
  replyMarkup?: InlineKeyboard;
}

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Escape, keeping the escaped result ≤ max chars; cuts between characters, never inside an entity. */
function escapeFit(s: string, max: number): string {
  const full = escapeHtml(s);
  if (full.length <= max) return full;
  let out = '';
  for (const ch of s) {
    const piece = escapeHtml(ch);
    if (out.length + piece.length > max - 1) break;
    out += piece;
  }
  return `${out}…`;
}

const salaryText = (s: Salary): string => {
  if (s.min !== undefined && s.max !== undefined)
    return s.min === s.max ? `${s.min} ${s.currency}` : `${s.min}–${s.max} ${s.currency}`;
  return s.min !== undefined ? `від ${s.min} ${s.currency}` : `до ${s.max ?? 0} ${s.currency}`;
};

const MODE = { remote: 'remote', hybrid: 'hybrid', office: 'office', unknown: 'remote?' } as const;

/** Caveats are always shown (up to 2); the strongest reasons fill the rest. */
const shownReasons = (r: Ranked): string[] => {
  const caveats = r.caveats.slice(0, MAX_REASONS - 1);
  return [...r.reasons.slice(0, MAX_REASONS - caveats.length), ...caveats];
};

const titleOnly = (r: Ranked, max: number): string =>
  `<b>${escapeFit(r.vacancy.title, Math.min(MAX_TITLE, Math.max(1, max - 7)))}</b>`;

/** One vacancy; never longer than `max` (falls back to the bare title). */
function block(r: Ranked, max: number): string {
  const v = r.vacancy;
  const title = escapeFit(v.title, MAX_TITLE);
  const href = isHttpUrl(v.url) ? escapeHtml(v.url) : '';
  const heading =
    href && href.length <= MAX_HREF ? `<b><a href="${href}">${title}</a></b>` : `<b>${title}</b>`;
  const where = [
    MODE[v.location.remote],
    ...v.location.cities.slice(0, MAX_CITIES).map((c) => escapeFit(c, MAX_CITY)),
  ].join(', ');
  const meta = [
    v.company ? escapeFit(v.company, MAX_COMPANY) : '',
    v.salary ? escapeHtml(salaryText(v.salary)) : '',
    where,
  ]
    .filter(Boolean)
    .join(' · ');
  const reasons = shownReasons(r).map((s) => escapeFit(s, MAX_REASON));
  const full = [heading, meta, reasons.length ? `<i>${reasons.join(' · ')}</i>` : '']
    .filter(Boolean)
    .join('\n');
  return full.length <= max ? full : titleOnly(r, max);
}

/**
 * Ranked vacancies → Telegram messages: a short header, then one message per vacancy with status buttons
 * (ADR 028), so each vacancy can be marked on its own. Every message is ≤ limit.
 */
export function formatDigest(items: Ranked[], opts: { date: Date; limit?: number }): Message[] {
  if (items.length === 0) return [];
  const limit = opts.limit ?? TELEGRAM_LIMIT;
  const header: Message = {
    text: `<b>Applyra · ${opts.date.toISOString().slice(0, 10)} · ${items.length} new</b>`,
    vacancies: [],
  };
  return [
    header,
    ...items.map((item): Message => {
      const keyboard = statusKeyboard(item.vacancy.id);
      return {
        text: block(item, limit),
        vacancies: [item.vacancy],
        ...(keyboard ? { replyMarkup: keyboard } : {}),
      };
    }),
  ];
}
