import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { djinniItems } from '../src/sources/djinni.ts';
import { douItems, parseDouTitle } from '../src/sources/dou.ts';
import { feedSources } from '../src/sources/feeds.ts';
import { fetchText, MAX_BYTES } from '../src/sources/http.ts';
import { decodeEntities, htmlToText, isLinkOn, MAX_ITEMS, parseRss } from '../src/sources/rss.ts';
import { normalize } from '../src/normalize/normalize.ts';

const fixture = (name: string) => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const now = new Date('2026-11-19T06:00:00Z');

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities in one pass', () => {
    expect(decodeEntities('a &amp; b &lt;p&gt; &quot;x&quot; &#39;y&#39; &#x2014; &nbsp;z')).toBe(
      'a & b <p> "x" \'y\' —  z',
    );
  });
  it('does not double-decode and keeps unknown or invalid entities', () => {
    expect(decodeEntities('&amp;lt; &bogus; &#xFFFFFFF; &#0;')).toBe(
      '&lt; &bogus; &#xFFFFFFF; &#0;',
    );
  });
});

describe('htmlToText', () => {
  it('strips tags, drops script/style bodies and decodes entities', () => {
    expect(
      htmlToText(
        '<p>Node &amp; <b>TS</b></p><script>alert(1)</script><style>p{}</style><li>x</li>',
      ),
    ).toBe('Node & TS x');
  });
  it('joins inline tags without a space and drops an unterminated tag', () => {
    expect(htmlToText('Java<b>Script</b>, <i>Type</i>Script<br/>next<p')).toBe(
      'JavaScript, TypeScript next',
    );
  });
  it('stays linear on hostile input', () => {
    const start = performance.now();
    htmlToText('<'.repeat(1_000_000));
    htmlToText('<script>'.repeat(100_000));
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe('parseRss', () => {
  it('reads items with title, link, description, pubDate, guid and categories', async () => {
    const items = parseRss(await fixture('djinni-nodejs.xml'));
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: 'Senior Node.js Engineer (NestJS)',
      link: 'https://djinni.co/jobs/857600-senior-node-js-engineer-nestjs/',
      pubDate: 'Wed, 18 Nov 2026 23:45:54 +0200',
      categories: ['Node.js'],
    });
    expect(items[0]?.description).toContain('<strong>Example Agro</strong>');
  });
  it('reads CDATA verbatim', async () => {
    const items = parseRss(await fixture('dou-nodejs.xml'));
    expect(items[2]?.description).toBe(
      '<p>NestJS, Redis &amp; RabbitMQ</p><script>alert(1)</script>',
    );
  });
  it('rejects a document that is not RSS (e.g. an HTML challenge page)', () => {
    expect(() => parseRss('<!DOCTYPE html><html><title>Just a moment...</title></html>')).toThrow(
      /not an RSS feed/,
    );
  });
  it('handles self-closing tags with attributes', () => {
    const [item] = parseRss(
      '<rss><channel><item><description a="x"/><title>T</title><category/><category>K</category></item></channel></rss>',
    );
    expect(item).toMatchObject({ title: 'T', description: '', categories: ['K'] });
  });
  it('caps the item count and stays linear on an unterminated body', () => {
    const many = `<rss><channel>${'<item><title>x</title></item>'.repeat(MAX_ITEMS + 5)}</channel></rss>`;
    expect(parseRss(many)).toHaveLength(MAX_ITEMS);
    const start = performance.now();
    expect(parseRss(`<rss>${'<item '.repeat(400_000)}`)).toEqual([]);
    expect(parseRss(`<rss><item>${'<title>'.repeat(200_000)}</item>`)).toHaveLength(1);
    expect(performance.now() - start).toBeLessThan(1000);
  });
  it('returns no items for an empty channel', () => {
    expect(parseRss('<rss version="2.0"><channel><title>x</title></channel></rss>')).toEqual([]);
  });
});

describe('parseDouTitle', () => {
  it('splits "Role в Company, cities, salary, remote"', () => {
    expect(
      parseDouTitle(
        'Senior Engineer в команду Payments в Demo Labs, Київ, Варшава (Польща), $4000–5500, віддалено',
      ),
    ).toEqual({
      role: 'Senior Engineer в команду Payments',
      company: 'Demo Labs',
      salary: '$4000–5500',
      location: 'Київ, Варшава (Польща), віддалено',
    });
  });
  it('reads an "up to" salary', () => {
    expect(parseDouTitle('Full Stack Developer в Sample Ltd, до $2500, віддалено')).toMatchObject({
      company: 'Sample Ltd',
      salary: 'до $2500',
      location: 'віддалено',
    });
  });
  it('keeps a legal-form suffix after a comma in the company', () => {
    expect(parseDouTitle('Dev в Acme, Inc., Київ, віддалено')).toMatchObject({
      company: 'Acme, Inc.',
      location: 'Київ, віддалено',
    });
  });
  it('keeps a title without " в " as the role', () => {
    expect(parseDouTitle('Backend Developer')).toEqual({
      role: 'Backend Developer',
      company: '',
      location: '',
    });
  });
});

describe('douItems', () => {
  it('maps the feed to raw items with the numeric vacancy id', async () => {
    const items = douItems(await fixture('dou-nodejs.xml'));
    expect(items).toHaveLength(4);
    expect(items[0]).toEqual({
      source: 'dou',
      sourceId: '356709',
      url: 'https://jobs.dou.ua/companies/example-pay/vacancies/356709/?utm_source=jobsrss',
      title: 'Node.js Developer',
      company: 'Example Pay',
      location: 'віддалено',
      publishedAt: 'Wed, 18 Nov 2026 12:54:01 +0200',
      description: 'Our client is a fintech company. 4+ years with Node.js & TypeScript PostgreSQL',
    });
    expect(items[1]).toMatchObject({ salary: 'до $2500', company: 'Sample Holdings Limited' });
    expect(items[2]?.description).toBe('NestJS, Redis & RabbitMQ');
  });
  it('normalizes into vacancies with salary, remote mode, cities and a stable id', async () => {
    const [, second, third] = douItems(await fixture('dou-nodejs.xml')).map((r) =>
      normalize(r, now),
    );
    expect(second).toMatchObject({
      id: 'dou:356100',
      url: 'https://jobs.dou.ua/companies/sample-holdings/vacancies/356100',
      salary: { max: 2500, currency: 'USD' },
      location: { remote: 'remote', cities: [] },
    });
    expect(third?.location.cities).toEqual(['Київ', 'Львів', 'Варшава (Польща)']);
    expect(third?.salary).toEqual({ min: 4000, max: 5500, currency: 'USD' });
    expect(second?.publishedAt.toISOString()).toBe('2026-11-17T08:00:00.000Z');
  });
  it('drops items whose link points outside jobs.dou.ua', () => {
    const xml = `<rss><channel>
      <item><title>A в X</title><link>https://evil.example/vacancies/1/</link></item>
      <item><title>B в X</title><link>http://jobs.dou.ua/companies/x/vacancies/2/</link></item>
      <item><title>C в X</title><link>https://jobs.dou.ua/companies/x/vacancies/3/</link></item>
    </channel></rss>`;
    expect(douItems(xml).map((i) => i.sourceId)).toEqual(['3']);
  });
});

describe('djinniItems', () => {
  it('maps a keyword-filtered feed; remote comes from the request filter', async () => {
    const items = djinniItems(await fixture('djinni-nodejs.xml'), 'Node.js');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      source: 'djinni',
      sourceId: '857600',
      title: 'Senior Node.js Engineer (NestJS)',
      company: 'Example Agro',
      location: 'віддалено',
      publishedAt: 'Wed, 18 Nov 2026 23:45:54 +0200',
    });
    expect(items[0]?.description).toContain('Досвід від 4 років з Node.js');
    expect(items[1]).toMatchObject({ title: 'Middle Backend Developer & DevOps', company: '' });
  });
  it('rejects the unfiltered feed Djinni returns for an unknown keyword', async () => {
    const xml = await fixture('djinni-unfiltered.xml');
    expect(() => djinniItems(xml, 'Node.js')).toThrow(/not filtered by "Node.js"/);
  });
  const feed = (...cats: string[]) =>
    `<rss><channel>${cats
      .map(
        (c, i) =>
          `<item><title>T${i}</title><link>https://djinni.co/jobs/${i + 1}-t/</link><category>${c}</category></item>`,
      )
      .join('')}</channel></rss>`;
  it('rejects a feed where even one item lacks the keyword category', () => {
    expect(() => djinniItems(feed('Node.js', 'Python'), 'Node.js')).toThrow(/not filtered/);
  });
  it('matches the category case-insensitively and drops off-site links', () => {
    const xml = feed('node.js', 'Node.js').replace(
      'https://djinni.co/jobs/2-t/',
      'https://evil.example/jobs/2-t/',
    );
    expect(djinniItems(xml, 'Node.js').map((i) => i.sourceId)).toEqual(['1']);
  });
  it('normalizes into remote vacancies with the parsed date', async () => {
    const [v] = djinniItems(await fixture('djinni-nodejs.xml'), 'Node.js').map((r) =>
      normalize(r, now),
    );
    expect(v).toMatchObject({
      id: 'djinni:857600',
      company: 'Example Agro',
      location: { remote: 'remote', cities: [] },
    });
    expect(v?.publishedAt.toISOString()).toBe('2026-11-18T21:45:54.000Z');
  });
});

const response = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers });

describe('fetchText', () => {
  it('sends a descriptive user agent and returns the body', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response('<rss/>'));
    await expect(fetchText('dou/Node.js', 'https://example.com/feed', fetchImpl)).resolves.toBe(
      '<rss/>',
    );
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('user-agent')).toMatch(/^ApplyraDigest\//);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.redirect).toBe('error');
  });
  it('reports name + status only — never the url or body', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response('secret body', 403));
    const err = await fetchText(
      'djinni/Node.js',
      'https://example.com/feed?token=x',
      fetchImpl,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('djinni/Node.js: HTTP 403');
  });
  it('wraps network errors without their message', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed: https://example.com/feed?token=x');
    });
    await expect(fetchText('dou/Node.js', 'https://example.com/feed', fetchImpl)).rejects.toThrow(
      /^dou\/Node\.js: request failed \(TypeError\)$/,
    );
  });
  it('refuses oversized bodies', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response('x'.repeat(MAX_BYTES + 1)));
    await expect(fetchText('dou/Node.js', 'https://example.com/feed', fetchImpl)).rejects.toThrow(
      /too large/,
    );
  });
  it('refuses a declared oversized body before reading it', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      response('<rss/>', 200, { 'content-length': String(MAX_BYTES + 1) }),
    );
    await expect(fetchText('dou/Node.js', 'https://example.com/feed', fetchImpl)).rejects.toThrow(
      /^dou\/Node\.js: response too large$/,
    );
  });
});

describe('isLinkOn', () => {
  it('accepts only https on the exact host', () => {
    expect(isLinkOn('https://djinni.co/jobs/1-x/', 'djinni.co')).toBe(true);
    expect(isLinkOn('https://djinni.co.evil.example/', 'djinni.co')).toBe(false);
    expect(isLinkOn('javascript:alert(1)', 'djinni.co')).toBe(false);
    expect(isLinkOn('not a url', 'djinni.co')).toBe(false);
  });
});

describe('feedSources', () => {
  it('builds one source (one request) per configured feed', async () => {
    const xml = await fixture('dou-nodejs.xml');
    const fetchImpl = vi.fn<typeof fetch>(async () => response(xml));
    const sources = feedSources('dou', fetchImpl) ?? [];
    expect(sources.map((s) => s.name)).toEqual(['dou/Node.js', 'dou/Fullstack']);
    const items = await sources[0]?.fetch();
    expect(items).toHaveLength(4);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      'https://jobs.dou.ua/vacancies/feeds/?category=Node.js&remote',
    );
  });
  it('pre-filters Djinni by keyword, experience and remote', () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (u) => {
      urls.push(String(u));
      return response('<rss><channel></channel></rss>');
    });
    const sources = feedSources('djinni', fetchImpl) ?? [];
    expect(sources.map((s) => s.name)).toEqual(['djinni/Node.js', 'djinni/Fullstack']);
    return sources[1]?.fetch().then((items) => {
      expect(items).toEqual([]);
      expect(urls).toEqual([
        'https://djinni.co/jobs/rss/?primary_keyword=Fullstack&exp_level=2y&exp_level=3y&exp_level=5y&employment=remote',
      ]);
    });
  });
  it('prefixes parse errors with the feed name (e.g. an anti-bot page)', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response('<!DOCTYPE html><html></html>'));
    const [source] = feedSources('dou', fetchImpl) ?? [];
    await expect(source?.fetch()).rejects.toThrow(/^dou\/Node\.js: not an RSS feed$/);
  });
  it('returns undefined for an unknown source', () => {
    expect(feedSources('workua')).toBeUndefined();
  });
});
