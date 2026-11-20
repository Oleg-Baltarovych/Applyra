import type { RawItem } from '../types.ts';
import { asciiLower, decodeEntities, htmlToText } from './rss.ts';

/** One alert e-mail as read from the mailbox (sources/email.ts). */
export interface MailMessage {
  /** Sender address (From header — forgeable on its own). */
  from: string;
  /** Domains with `dkim=pass` in the receiving server's Authentication-Results (see dkimPassDomains). */
  dkimDomains: string[];
  date: Date;
  /** The text/html part, UTF-8. */
  html: string;
}

const MAX_HEADER = 8000;

/** `dkim=<result> header.x=value …` with plain tokens only (no comments, quotes or escapes). */
const DKIM_CLAUSE =
  /^\s*dkim=([a-z]{1,10})((?:\s+header\.[a-z]{1,10}=[^\s;()"\\]{1,300}){0,8})\s*$/i;

/**
 * Domains that passed DKIM according to the **topmost** Authentication-Results header — the one the receiving
 * server (e.g. mx.google.com) prepends; headers further down may come from the sender and are not trusted.
 * `rawHeaders` is the header block as fetched (folded lines allowed).
 */
export function dkimPassDomains(rawHeaders: string, authservId: string): string[] {
  const unfolded = rawHeaders.slice(0, 64_000).replace(/\r?\n[ \t]+/g, ' ');
  const line = unfolded
    .split(/\r?\n/)
    .find((l) => asciiLower(l.slice(0, 23)) === 'authentication-results:');
  if (!line) return [];
  const [server = '', ...clauses] = line.slice(23, 23 + MAX_HEADER).split(';');
  // Only the expected receiving server's verdict counts (its id is the first token).
  if (asciiLower(server.trim().split(/\s+/)[0] ?? '') !== asciiLower(authservId)) return [];
  // The server reflects sender-controlled text (SPF comment, smtp.mailfrom, ARC) in later clauses — and does not
  // escape it reliably, so no tokenizer can tell injected clauses from real ones. The DKIM verdicts come first
  // (Gmail: dkim…; arc…; spf…; dmarc…) and their values cannot hold ';' (it separates DKIM-Signature tags), so
  // only the leading run of strictly formed dkim clauses is read; the first other clause ends it.
  const domains: string[] = [];
  for (const clause of clauses) {
    const m = DKIM_CLAUSE.exec(clause);
    if (!m) break;
    if (asciiLower(m[1] ?? '') !== 'pass') continue;
    const d = /\bheader\.(?:d=|i=[^@\s]*@)([a-z0-9.-]{1,253})(?=\s|$)/i.exec(clause)?.[1];
    if (d) domains.push(asciiLower(d).replace(/^\.+|\.+$/g, ''));
  }
  return domains;
}

interface Site {
  source: string;
  /** Sender domains whose mail is parsed (anything else in the mailbox is ignored). */
  senders: RegExp;
  /** Vacancy link → canonical url (rebuilt from the id, so tracking redirects and params vanish). */
  match: (href: string) => { id: string; url: string } | undefined;
}

const SITES: Site[] = [
  {
    source: 'workua',
    senders: /(^|\.)work\.ua$/i,
    match: (h) => {
      const id = /(?:^|[/.])work\.ua\/(?:(?:ru|en|uk)\/)?jobs\/(\d{5,10})(?!\d)/i.exec(h)?.[1];
      return id ? { id, url: `https://www.work.ua/jobs/${id}/` } : undefined;
    },
  },
  {
    source: 'robotaua',
    senders: /(^|\.)(robota|rabota)\.ua$/i,
    match: (h) => {
      const m =
        /(?:^|[/.])r[oa]bota\.ua\/(?:(?:ru|en|ua)\/)?company(\d{1,10})\/vacancy(\d{1,10})(?!\d)/i.exec(
          h,
        );
      return m?.[1] && m[2]
        ? { id: m[2], url: `https://robota.ua/company${m[1]}/vacancy${m[2]}` }
        : undefined;
    },
  },
  {
    source: 'linkedin',
    senders: /(^|\.)linkedin\.com$/i,
    match: (h) => {
      // "/jobs/view/123…" or "/jobs/view/some-title-123…": the id ends the path segment.
      const segment = /(?:^|[/.])linkedin\.com\/(?:comm\/)?jobs\/view\/([^/?#\s]{1,300})/i.exec(
        h,
      )?.[1];
      const id = segment ? /(?:^|-)(\d{6,12})$/.exec(segment)?.[1] : undefined;
      return id ? { id, url: `https://www.linkedin.com/jobs/view/${id}/` } : undefined;
    },
  },
];

const MAX_TAG = 4000;
const MAX_TITLE = 200;
/** Button/teaser texts that are never a vacancy title. */
const GENERIC =
  /^(переглянути|детальніше|докладніше|відгукнутися|подати|просмотреть|подробнее|откликнуться|view|apply|see|show|more|easy apply)(?![\p{L}\p{N}])/iu; // not \b: ASCII-only, never matches after Cyrillic

/** `<a href>` links with their visible text; linear scan, tags longer than MAX_TAG are skipped. */
function anchors(html: string): { href: string; text: string }[] {
  const lower = asciiLower(html); // same length as html, so indices line up
  const out: { href: string; text: string }[] = [];
  let i = 0;
  for (;;) {
    const start = lower.indexOf('<a', i);
    if (start < 0) return out;
    i = start + 2;
    if (!/[\s>]/.test(lower[i] ?? '')) continue;
    const gt = lower.indexOf('>', i);
    if (gt < 0) return out;
    const close = lower.indexOf('</a', gt + 1);
    if (close < 0) return out;
    i = close + 3;
    if (gt - start > MAX_TAG) continue;
    const tag = html.slice(start, gt);
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const value = href?.[1] ?? href?.[2] ?? href?.[3];
    if (value)
      out.push({ href: decodeEntities(value), text: htmlToText(html.slice(gt + 1, close)) });
  }
}

/** The href plus its url-decoded forms (trackers wrap the target as an encoded query parameter). */
function hrefForms(href: string): string[] {
  const forms = [href];
  for (let k = 0; k < 2; k++) {
    try {
      const next = decodeURIComponent(forms[forms.length - 1] ?? '');
      if (next === forms[forms.length - 1]) break;
      forms.push(next);
    } catch {
      break;
    }
  }
  return forms;
}

const domainOf = (address: string) => address.slice(address.lastIndexOf('@') + 1).trim();

/** Real alerts list 10–30 vacancies; more is junk (or hostile) and is cut. */
export const MAX_ITEMS_PER_MAIL = 100;

/**
 * Job-alert e-mail (Work.ua, robota.ua, LinkedIn) → raw items: every link to a vacancy page becomes one item,
 * titled by the most descriptive text among the links to it. Template-agnostic on purpose: the mail layout
 * changes, the vacancy url shape does not. Only mail whose From domain belongs to the site **and** that passed
 * DKIM for the site's domain is read: a forged From alone could inject titles into the digest.
 */
export function alertItems(message: MailMessage): RawItem[] {
  const site = SITES.find(
    (s) =>
      s.senders.test(domainOf(message.from)) && message.dkimDomains.some((d) => s.senders.test(d)),
  );
  if (!site) return [];
  const found = new Map<string, { url: string; titles: string[] }>();
  for (const a of anchors(message.html)) {
    if (found.size >= MAX_ITEMS_PER_MAIL) break;
    const hit = hrefForms(a.href)
      .map((f) => site.match(f))
      .find((m) => m !== undefined);
    if (!hit) continue;
    const entry = found.get(hit.id) ?? { url: hit.url, titles: [] };
    if (a.text && a.text.length <= MAX_TITLE && !GENERIC.test(a.text)) entry.titles.push(a.text);
    found.set(hit.id, entry);
  }
  const items: RawItem[] = [];
  for (const [id, { url, titles }] of found) {
    // The first descriptive link text is the title in every layout seen so far (image links have none).
    const title = titles[0];
    if (!title) continue;
    items.push({
      source: site.source,
      sourceId: id,
      url,
      title,
      publishedAt: message.date.toISOString(),
    });
  }
  return items;
}
