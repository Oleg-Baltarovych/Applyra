import type { RawItem } from '../types.ts';
import { decodeEntities, htmlToText, isLinkOn, parseRss } from './rss.ts';

const COMPANY = /<strong>\s*Про компанію\s+([^<]{1,100}?)\s*<\/strong>/i;

/**
 * Djinni RSS (requested with `primary_keyword=<keyword>&employment=remote`) → raw items.
 * Djinni silently ignores an unknown keyword and returns the unfiltered feed, so every item must carry
 * the requested category — otherwise the whole feed is rejected instead of flooding the digest.
 */
export function djinniItems(xml: string, keyword: string): RawItem[] {
  const items = parseRss(xml);
  const want = keyword.toLowerCase();
  if (items.some((i) => !i.categories.some((c) => c.toLowerCase() === want)))
    throw new Error(`feed is not filtered by "${keyword}" (unknown keyword?)`);
  return items
    .filter((item) => isLinkOn(item.link, 'djinni.co'))
    .map((item) => {
      const id = /\/jobs\/(\d+)-/.exec(item.link)?.[1];
      const company = COMPANY.exec(item.description)?.[1];
      const description = htmlToText(item.description);
      return {
        source: 'djinni',
        ...(id ? { sourceId: id } : {}),
        url: item.link,
        title: decodeEntities(item.title),
        company: company ? decodeEntities(company) : '',
        // The request asks for remote-only posts; Djinni has no per-item location field.
        location: 'віддалено',
        publishedAt: item.pubDate,
        ...(description ? { description } : {}),
      };
    });
}
