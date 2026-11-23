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
const MAX_EXPLAIN = 300;

export interface Message {
  /** Telegram HTML (parse_mode: HTML). */
  text: string;
  /** Vacancies in this message — marked as sent only after it is delivered. */
  vacancies: Vacancy[];
  /** Status buttons (ADR 003); absent on the header. */
  replyMarkup?: InlineKeyboard;
  /** Delivered without a sound: only the header of a digest notifies. */
  silent?: true;
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

/** Ukrainian plural: plural(3, ['день', 'дні', 'днів']) → 'дні'. */
const plural = (n: number, [one, few, many]: readonly [string, string, string]): string => {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return one;
  return d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14) ? few : many;
};

const kyivDay = (d: Date): number =>
  Date.parse(d.toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' }));

/** Age in Kyiv calendar days: "сьогодні", "вчора", "3 дні тому" (a future date counts as today). */
function age(published: Date, now: Date): string {
  const days = Math.max(0, Math.round((kyivDay(now) - kyivDay(published)) / 86_400_000));
  if (days === 0) return 'сьогодні';
  if (days === 1) return 'вчора';
  return `${days} ${plural(days, ['день', 'дні', 'днів'])} тому`;
}

const titleOnly = (r: Ranked, max: number): string =>
  `<b>${escapeFit(r.vacancy.title, Math.min(MAX_TITLE, Math.max(1, max - 7)))}</b>`;

/** One vacancy; never longer than `max` (falls back to the bare title). */
function block(r: Ranked, max: number, now: Date): string {
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
  // Line 3, not the meta line: the bot copies lines 1–2 into /status, where an age would go stale.
  const details = [
    reasons.length ? `<i>${reasons.join(' · ')}</i>` : '',
    `🕒 ${age(v.publishedAt, now)}`,
  ]
    .filter(Boolean)
    .join(' · ');
  const base = [heading, meta, details].join('\n');
  const e = r.explanation;
  // Line 4 (ADR 005) is the first thing to go when the block does not fit.
  const full = e
    ? `${base}\n💡 ${escapeFit(e.fit, MAX_EXPLAIN)}${e.risk ? ` · ⚠️ ${escapeFit(e.risk, MAX_EXPLAIN)}` : ''}`
    : base;
  if (full.length <= max) return full;
  return base.length <= max ? base : titleOnly(r, max);
}

const MAX_ALERT_LINES = 10;
const MAX_ALERT_LINE = 300;

/** A problem report for the owner (failed sources, failed run); audible, escaped, ≤ ~3.2k chars. */
export function alertMessage(title: string, details: string[]): Message {
  const lines = details.slice(0, MAX_ALERT_LINES).map((d) => `• ${escapeFit(d, MAX_ALERT_LINE)}`);
  return {
    text: [`⚠️ <b>Applyra: ${escapeFit(title, MAX_ALERT_LINE)}</b>`, ...lines].join('\n'),
    vacancies: [],
  };
}

/**
 * Ranked vacancies → Telegram messages: a short header, then one message per vacancy with status buttons
 * (ADR 003), so each vacancy can be marked on its own. Every message is ≤ limit.
 */
export function formatDigest(items: Ranked[], opts: { date: Date; limit?: number }): Message[] {
  if (items.length === 0) return [];
  const limit = opts.limit ?? TELEGRAM_LIMIT;
  // rank() puts clean matches first; a divider marks where those with caveats begin.
  const clean = items.filter((i) => i.caveats.length === 0).length;
  const caveated = items.length - clean;
  const mixed = clean > 0 && caveated > 0;
  const count = `${items.length} ${plural(items.length, ['нова', 'нові', 'нових'])}`;
  const title = `<b>Applyra · ${opts.date.toISOString().slice(0, 10)} · ${count}</b>`;
  const messages: Message[] = [
    {
      text: mixed
        ? `${title}\n✅ точний збіг: ${clean} · ⚠️ із застереженнями: ${caveated}`
        : title,
      vacancies: [],
    },
  ];
  items.forEach((item, i) => {
    if (mixed && i === clean)
      messages.push({
        text: `<b>⚠️ Із застереженнями · ${caveated}</b>\n<i>інший стек, неясний рівень або формат роботи</i>`,
        vacancies: [],
        silent: true,
      });
    const keyboard = statusKeyboard(item.vacancy.id);
    messages.push({
      text: block(item, limit, opts.date),
      vacancies: [item.vacancy],
      silent: true,
      ...(keyboard ? { replyMarkup: keyboard } : {}),
    });
  });
  return messages;
}
