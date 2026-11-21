import { describe, expect, it } from 'vitest';
import { normalize, parseRemote, parseSalary } from '../src/normalize/normalize.ts';
import { canonicalUrl } from '../src/normalize/url.ts';

const now = new Date('2026-11-19T06:00:00Z');

describe('parseSalary', () => {
  it.each([
    ['$3000–4000', { min: 3000, max: 4000, currency: 'USD' }],
    ['від $2500', { min: 2500, currency: 'USD' }],
    ['до $2000', { max: 2000, currency: 'USD' }],
    ['up to 5k USD', { max: 5000, currency: 'USD' }],
    ['до 90 000 грн', { max: 90_000, currency: 'UAH' }],
    ['$3500', { min: 3500, max: 3500, currency: 'USD' }],
  ])('%s', (text, expected) => {
    expect(parseSalary(text)).toEqual(expected);
  });

  it('returns undefined without a currency or amount', () => {
    expect(parseSalary('competitive')).toBeUndefined();
    expect(parseSalary('3000')).toBeUndefined();
  });
});

describe('parseRemote', () => {
  it.each([
    ['Remote', 'remote'],
    ['Київ, віддалено', 'remote'],
    ['Львів, гібрид', 'hybrid'],
    ['Київ, офіс', 'office'],
    ['Київ', 'unknown'],
  ])('%s → %s', (text, mode) => {
    expect(parseRemote(text)).toBe(mode);
  });
});

describe('canonicalUrl', () => {
  it('drops tracking params, fragment and trailing slash, keeps real params sorted', () => {
    expect(canonicalUrl('https://EX.com/a/?utm_source=x&b=2&a=1#top')).toBe(
      'https://ex.com/a?a=1&b=2',
    );
  });
});

describe('normalize', () => {
  it('builds a Vacancy with a stable id and parsed fields', () => {
    const v = normalize(
      {
        source: 'dou',
        sourceId: '123',
        url: 'https://jobs.example.com/v/123/?utm_source=rss',
        title: '  Senior   Node.js Developer ',
        company: 'Example',
        salary: 'до $5000',
        location: 'Київ, Львів, віддалено',
        experience: '3+ years',
        publishedAt: '2026-11-18T09:00:00Z',
      },
      now,
    );
    expect(v).toMatchObject({
      id: 'dou:123',
      url: 'https://jobs.example.com/v/123',
      title: 'Senior Node.js Developer',
      salary: { max: 5000, currency: 'USD' },
      location: { cities: ['Київ', 'Львів'], remote: 'remote' },
      experienceYears: 3,
    });
  });

  it('rejects items without a title or an http(s) url', () => {
    expect(normalize({ source: 's', url: 'https://x.test/1', title: ' ' }, now)).toBeUndefined();
    expect(normalize({ source: 's', url: 'ftp://x.test/1', title: 'T' }, now)).toBeUndefined();
  });

  it('strips CR/LF from single-line fields (no log/workflow-command injection)', () => {
    const v = normalize(
      {
        source: 's',
        sourceId: '1\n::error::x',
        url: 'https://x.test/1',
        title: 'Node.js\r\n::warning::pwned',
        company: 'A\nB',
        location: 'Kyiv\r\nremote',
        salary: 'до $5000\n',
      },
      now,
    );
    const singleLine = [v?.id, v?.title, v?.company, ...(v?.location.cities ?? [])];
    for (const field of singleLine) expect(field).not.toMatch(/[\r\n]/);
    expect(v?.title).toBe('Node.js ::warning::pwned');
  });
});
