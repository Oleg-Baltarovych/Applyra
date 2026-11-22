import { describe, expect, it } from 'vitest';
import type { Ranked } from '../src/filter.ts';
import { alertMessage, escapeHtml, formatDigest, TELEGRAM_LIMIT } from '../src/format.ts';
import type { Vacancy } from '../src/types.ts';
import { vacancy } from './support/vacancy.ts';

const date = new Date('2026-11-19T06:00:00Z');
const ranked = (overrides: Partial<Vacancy> = {}, reasons = ['node.js']): Ranked => ({
  vacancy: vacancy(overrides),
  score: 1,
  reasons,
  caveats: [],
});

describe('alertMessage', () => {
  it('is an escaped, bounded, audible message with no vacancies', () => {
    const m = alertMessage('Дайджест не надіслано', [
      'dou: <503>',
      ...Array(20).fill('x'.repeat(500)),
    ]);
    expect(m.vacancies).toEqual([]);
    expect(m.silent).toBeUndefined();
    expect(m.text).toMatch(/^⚠️ <b>Applyra: Дайджест не надіслано<\/b>\n• dou: &lt;503&gt;\n/);
    expect(m.text.split('\n').filter((l) => l.startsWith('• '))).toHaveLength(10);
    expect(m.text.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
  });
});

describe('escapeHtml', () => {
  it('escapes the characters Telegram HTML requires', () => {
    expect(escapeHtml(`<b>"A" & 'B'</b>`)).toBe(`&lt;b&gt;&quot;A&quot; &amp; 'B'&lt;/b&gt;`);
  });
});

describe('formatDigest', () => {
  it('returns no messages for an empty digest', () => {
    expect(formatDigest([], { date })).toEqual([]);
  });

  it('renders a header and an escaped, linked item', () => {
    const [header, msg] = formatDigest(
      [ranked({ title: 'Node <Dev> & Co', company: 'A"B', url: 'https://x.test/1?a=1&b="2"' })],
      { date },
    );
    expect(header).toEqual({ text: '<b>Applyra · 2026-11-19 · 1 нова</b>', vacancies: [] });
    expect(msg?.text).toContain(
      '<a href="https://x.test/1?a=1&amp;b=&quot;2&quot;">Node &lt;Dev&gt; &amp; Co</a>',
    );
    expect(msg?.text).toContain('A&quot;B');
    expect(msg?.text).not.toContain('<Dev>');
  });

  it('shows how old the vacancy is (Kyiv calendar days), on the reasons line', () => {
    const at = (iso: string) => {
      const [, msg] = formatDigest([ranked({ publishedAt: new Date(iso) })], { date });
      return msg?.text.split('\n')[2];
    };
    // date = 2026-11-19 08:00 Kyiv
    expect(at('2026-11-19T05:00:00Z')).toBe('<i>node.js</i> · 🕒 сьогодні');
    expect(at('2026-11-18T22:30:00Z')).toBe('<i>node.js</i> · 🕒 сьогодні'); // 00:30 Kyiv, the 19th
    expect(at('2026-11-18T21:30:00Z')).toBe('<i>node.js</i> · 🕒 вчора'); // 23:30 Kyiv, the 18th
    expect(at('2026-11-18T12:00:00Z')).toBe('<i>node.js</i> · 🕒 вчора');
    expect(at('2026-11-16T12:00:00Z')).toBe('<i>node.js</i> · 🕒 3 дні тому');
    expect(at('2026-11-13T12:00:00Z')).toBe('<i>node.js</i> · 🕒 6 днів тому');
    expect(at('2026-10-29T12:00:00Z')).toBe('<i>node.js</i> · 🕒 21 день тому');
    expect(at('2026-11-20T12:00:00Z')).toBe('<i>node.js</i> · 🕒 сьогодні'); // future (clock skew)
  });

  it('keeps the first two lines (title, meta) free of the age: the bot stores them', () => {
    const [, msg] = formatDigest([ranked({ company: 'Acme' })], { date });
    expect(msg?.text.split('\n').slice(0, 2).join('\n')).not.toContain('🕒');
  });

  it('groups matches: a header with counts, and a silent divider before those with caveats', () => {
    const clean = [ranked(), ranked()];
    const caveated = { ...ranked(), caveats: ['+ python'] };
    const [header, a, b, divider, c] = formatDigest([...clean, caveated], { date });
    expect(header?.text).toBe(
      '<b>Applyra · 2026-11-19 · 3 нові</b>\n✅ точний збіг: 2 · ⚠️ із застереженнями: 1',
    );
    expect([a, b, c].map((m) => m?.vacancies.length)).toEqual([1, 1, 1]);
    expect(divider).toEqual({
      text: '<b>⚠️ Із застереженнями · 1</b>\n<i>інший стек, неясний рівень або формат роботи</i>',
      vacancies: [],
      silent: true,
    });
  });

  it('has no divider or counts line when all matches are of one kind', () => {
    const messages = formatDigest([ranked(), ranked()], { date });
    expect(messages).toHaveLength(3);
    expect(messages[0]?.text).toBe('<b>Applyra · 2026-11-19 · 2 нові</b>');
    const onlyCaveated = formatDigest([{ ...ranked(), caveats: ['level unclear'] }], { date });
    expect(onlyCaveated).toHaveLength(2);
  });

  it('shows the salary when present', () => {
    const [, msg] = formatDigest([ranked({ salary: { min: 3000, max: 4000, currency: 'USD' } })], {
      date,
    });
    expect(msg?.text).toContain('3000–4000 USD');
  });

  it('does not link non-http urls', () => {
    const [, msg] = formatDigest([ranked({ url: 'javascript:alert(1)' })], { date });
    expect(msg?.text).not.toContain('href');
  });

  it('shows at most three reasons, caveats included', () => {
    const item: Ranked = {
      ...ranked({}, ['node.js', 'nestjs', 'react', 'redis']),
      caveats: ['remote unclear'],
    };
    const [, msg] = formatDigest([item], { date });
    expect(msg?.text).toContain('node.js · nestjs · remote unclear');
    expect(msg?.text).not.toContain('react');
  });

  it('sends one message per vacancy, in order, each with its own status buttons', () => {
    const items = Array.from({ length: 3 }, (_, i) => ranked({ id: `dou:${100 + i}` }));
    const [header, ...messages] = formatDigest(items, { date });
    expect(header?.replyMarkup).toBeUndefined();
    expect(messages.map((m) => m.vacancies.map((v) => v.id))).toEqual([
      ['dou:100'],
      ['dou:101'],
      ['dou:102'],
    ]);
    for (const m of messages) expect(m.text.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
    expect(messages[1]?.replyMarkup?.inline_keyboard.flat().map((b) => b.callback_data)).toEqual([
      's:a:dou:101',
      's:p:dou:101',
      's:r:dou:101',
      's:x:dou:101',
    ]);
  });

  it('only the header makes a sound: vacancy messages are silent', () => {
    const [header, ...messages] = formatDigest([ranked(), ranked()], { date });
    expect(header?.silent).toBeUndefined();
    expect(messages.map((m) => m.silent)).toEqual([true, true]);
  });

  it('truncates huge fields so a single item still fits', () => {
    const [, msg] = formatDigest(
      [
        ranked({
          title: 'T'.repeat(10_000),
          company: 'C'.repeat(10_000),
          url: `https://x.test/${'p'.repeat(5000)}`,
        }),
      ],
      { date },
    );
    expect(msg?.text.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
  });

  it('measures the url cap on the escaped href: an &-heavy url loses its link', () => {
    // 600 raw chars, but every "&" becomes "&amp;" → ~1800 escaped chars.
    const url = `https://x.test/?${'a=1&'.repeat(150)}`;
    const [, msg] = formatDigest([ranked({ url })], { date });
    expect(msg?.text).not.toContain('href');
    expect(msg?.text).toContain('Senior Node.js Developer');
  });

  it('truncates a 10 000-char city', () => {
    const [, msg] = formatDigest(
      [ranked({ location: { cities: ['K'.repeat(10_000), 'Lviv'], remote: 'remote' } })],
      { date },
    );
    expect(msg?.text).toContain('Lviv');
    expect(msg?.text.length).toBeLessThan(600);
  });

  it('caps escaped text: a title full of "&" stays within the title budget', () => {
    const [, msg] = formatDigest([ranked({ title: '&'.repeat(10_000) })], { date });
    expect(msg?.text.length).toBeLessThan(600);
    expect(msg?.text).not.toMatch(/&(?!amp;|quot;|lt;|gt;)/); // no entity cut in half
  });

  it('falls back to a title-only block when a block cannot fit the limit', () => {
    const item = ranked({ company: 'Company', title: 'Node.js Developer' }, [
      'node.js',
      'nestjs',
      'react',
    ]);
    const [, msg] = formatDigest([item], { date, limit: 120 });
    expect(msg?.text.length).toBeLessThanOrEqual(120);
    expect(msg?.text).toContain('<b>Node.js Developer</b>');
    expect(msg?.vacancies).toEqual([item.vacancy]);
  });
});
