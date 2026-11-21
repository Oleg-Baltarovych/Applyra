/**
 * Minimal RSS 2.0 reader for known-format, untrusted-content feeds (pure, no I/O, no dependency).
 * Only the item fields the adapters need; values come back XML-decoded. Scanning is indexOf-based (linear):
 * no backtracking regex runs over the untrusted document, so a malformed body cannot hang the run.
 */
export interface RssItem {
  title: string;
  link: string;
  /** Item description as HTML (XML layer decoded), '' when absent. */
  description: string;
  pubDate: string;
  guid: string;
  /** Non-empty `<category>` values, in order. */
  categories: string[];
}

/** Hard cap: real feeds carry 20–100 items. */
export const MAX_ITEMS = 300;

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  euro: '€',
};

/** One pass over `&name;`, `&#N;`, `&#xH;` (so `&amp;lt;` → `&lt;`); unknown or invalid entities stay as-is. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (whole, body: string) => {
    if (!body.startsWith('#')) return Object.hasOwn(NAMED, body) ? (NAMED[body] ?? whole) : whole;
    const hex = body[1] === 'x' || body[1] === 'X';
    const code = hex ? parseInt(body.slice(2), 16) : Number(body.slice(1));
    const valid = code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
    return valid ? String.fromCodePoint(code) : whole;
  });
}

const BLOCK_TAG = /^\/?(p|br|li|ul|ol|div|h[1-6]|tr|td|th|table|blockquote|hr|pre)(?![a-z0-9])/i;

/**
 * HTML fragment → plain text: script/style bodies dropped, block tags become spaces, inline tags vanish
 * (`Java<b>Script</b>` → `JavaScript`), entities decoded.
 */
export function htmlToText(html: string): string {
  const lower = asciiLower(html); // same length as html, so indices line up
  let out = '';
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    const gt = html.indexOf('>', lt + 1);
    if (gt < 0) break; // unterminated tag: drop the rest
    const tag = html.slice(lt + 1, gt);
    i = gt + 1;
    const raw = /^(script|style)(?![a-z0-9])/i.exec(tag)?.[1]?.toLowerCase();
    if (raw) {
      const close = lower.indexOf(`</${raw}`, i);
      const closeGt = close < 0 ? -1 : lower.indexOf('>', close);
      i = closeGt < 0 ? html.length : closeGt + 1;
      out += ' ';
    } else if (BLOCK_TAG.test(tag)) out += ' ';
  }
  return decodeEntities(out).replace(/\s+/g, ' ').trim();
}

/** Text of an element value: CDATA sections verbatim, everything else XML-decoded. */
function value(raw: string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const start = raw.indexOf('<![CDATA[', i);
    if (start < 0) break;
    const end = raw.indexOf(']]>', start + 9);
    if (end < 0) break;
    out += decodeEntities(raw.slice(i, start)) + raw.slice(start + 9, end);
    i = end + 3;
  }
  return (out + decodeEntities(raw.slice(i))).trim();
}

/** Is the char after a tag name a delimiter (so `<link` does not match `<linkage>`)? */
const endsName = (c: string | undefined) =>
  c === '>' || c === '/' || (c !== undefined && /\s/.test(c));

/** Bodies of `<tag …>body</tag>` / `<tag/>` ('' for self-closing) within `block`. */
function elements(block: string, tag: string): string[] {
  const out: string[] = [];
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let i = 0;
  for (;;) {
    const start = block.indexOf(open, i);
    if (start < 0) return out;
    i = start + open.length;
    if (!endsName(block[i])) continue;
    const gt = block.indexOf('>', i);
    if (gt < 0) return out;
    if (block[gt - 1] === '/') {
      out.push('');
      i = gt + 1;
      continue;
    }
    const end = block.indexOf(close, gt + 1);
    if (end < 0) return out;
    out.push(block.slice(gt + 1, end));
    i = end + close.length;
  }
}

const first = (block: string, tag: string) => value(elements(block, tag)[0] ?? '');

/** Items of an RSS 2.0 document (at most MAX_ITEMS); throws when the text is not RSS (e.g. an anti-bot page). */
export function parseRss(xml: string): RssItem[] {
  if (!/<rss[\s>]/.test(xml.slice(0, 2000))) throw new Error('not an RSS feed');
  return elements(xml, 'item')
    .slice(0, MAX_ITEMS)
    .map((block) => ({
      title: first(block, 'title'),
      link: first(block, 'link'),
      description: first(block, 'description'),
      pubDate: first(block, 'pubDate'),
      guid: first(block, 'guid'),
      categories: elements(block, 'category').map(value).filter(Boolean),
    }));
}

/** Is `link` an https url on exactly `host`? Adapters drop items that point anywhere else. */
export function isLinkOn(link: string, host: string): boolean {
  try {
    const u = new URL(link);
    return u.protocol === 'https:' && u.host === host;
  } catch {
    return false;
  }
}

/**
 * Lower-cases A–Z only. Unlike toLowerCase() it never changes the string length ("İ" → "i̇" adds a code unit),
 * so indices found in the result are valid in the original.
 */
export const asciiLower = (s: string): string => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
