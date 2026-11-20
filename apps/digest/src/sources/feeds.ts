import type { RawItem } from '../types.ts';
import { djinniItems } from './djinni.ts';
import { douItems } from './dou.ts';
import { fetchText, type FetchImpl } from './http.ts';
import type { Source } from './source.ts';

interface Site {
  /** One feed (= one request per run) per key: a category or keyword. */
  keys: string[];
  url: (key: string) => string;
  parse: (xml: string, key: string) => RawItem[];
}

/**
 * Public RSS feeds (docs/spec.md §2). Each feed is its own Source, so one broken feed does not hide
 * the others. Source-side filters keep feeds small; the profile filter still runs on everything.
 */
const SITES: Record<string, Site> = {
  dou: {
    keys: ['Node.js', 'Fullstack'],
    // `exp` takes one value only (the last one wins), so experience is left to the profile filter.
    url: (c) => `https://jobs.dou.ua/vacancies/feeds/?category=${encodeURIComponent(c)}&remote`,
    parse: (xml) => douItems(xml),
  },
  djinni: {
    keys: ['Node.js', 'Fullstack'],
    url: (k) =>
      `https://djinni.co/jobs/rss/?primary_keyword=${encodeURIComponent(k)}` +
      '&exp_level=2y&exp_level=3y&exp_level=5y&employment=remote',
    parse: djinniItems,
  },
};

/** Sources for a site name (`dou`, `djinni`), or undefined when the name is unknown. */
export function feedSources(site: string, fetchImpl?: FetchImpl): Source[] | undefined {
  const config = Object.hasOwn(SITES, site) ? SITES[site] : undefined;
  if (!config) return undefined;
  return config.keys.map((key) => {
    const name = `${site}/${key}`;
    return {
      name,
      fetch: async () => {
        const xml = await fetchText(name, config.url(key), fetchImpl);
        try {
          return config.parse(xml, key);
        } catch (err) {
          throw new Error(`${name}: ${err instanceof Error ? err.message : 'parse failed'}`, {
            cause: err,
          });
        }
      },
    };
  });
}
