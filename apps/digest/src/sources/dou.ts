import type { RawItem } from '../types.ts';
import { decodeEntities, htmlToText, isLinkOn, parseRss } from './rss.ts';

export interface DouTitle {
  role: string;
  company: string;
  salary?: string;
  /** Cities and the remote marker, comma-separated ('' when none). */
  location: string;
}

const CURRENCY = /\$|€|грн|uah|usd|eur/i;
const COMPANY_SUFFIX = /^(inc|llc|ltd|gmbh|corp|plc|s\.?r\.?o|тов)\.?$/i;

/**
 * DOU packs everything into the title: "Role в Company, city, city, $X–Y, віддалено".
 * The last " в " splits role from the rest (a role may itself contain " в ").
 */
export function parseDouTitle(title: string): DouTitle {
  const at = title.lastIndexOf(' в ');
  if (at < 0) return { role: title.trim(), company: '', location: '' };
  const [first = '', ...parts] = title
    .slice(at + 3)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  let company = first;
  // "Acme, Inc., Київ": a legal-form suffix after the first comma still belongs to the company.
  while (parts[0] !== undefined && COMPANY_SUFFIX.test(parts[0])) company += `, ${parts.shift()}`;
  const salary = parts.find((p) => /\d/.test(p) && CURRENCY.test(p));
  return {
    role: title.slice(0, at).trim(),
    company,
    ...(salary ? { salary } : {}),
    location: parts.filter((p) => p !== salary).join(', '),
  };
}

/** DOU RSS → raw items. The id is the number in the link (the guid carries a changing `?timestamp`). */
export function douItems(xml: string): RawItem[] {
  return parseRss(xml)
    .filter((item) => isLinkOn(item.link, 'jobs.dou.ua'))
    .map((item) => {
      // Titles are double-escaped ("до&amp;nbsp;$2500"): decode the HTML layer too.
      const t = parseDouTitle(decodeEntities(item.title));
      const id = /\/vacancies\/(\d+)\//.exec(item.link)?.[1];
      const description = htmlToText(item.description);
      return {
        source: 'dou',
        ...(id ? { sourceId: id } : {}),
        url: item.link,
        title: t.role,
        company: t.company,
        ...(t.salary ? { salary: t.salary } : {}),
        location: t.location,
        publishedAt: item.pubDate,
        ...(description ? { description } : {}),
      };
    });
}
