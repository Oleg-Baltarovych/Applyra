import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyState, selectNew } from '../src/dedup.ts';
import { LlmError, type LlmClient } from '../src/explain.ts';
import { parseProfile } from '../src/filter.ts';
import type { Message } from '../src/format.ts';
import { createSources, redact, run, type RunOptions } from '../src/main.ts';
import { normalize } from '../src/normalize/normalize.ts';
import { FakeSource, SAMPLE_ITEMS, type Source } from '../src/sources/source.ts';
import { fileStore, loadState, type StateStore } from '../src/state.ts';
import { TelegramApiError } from '../src/telegram.ts';
import type { RawItem, Vacancy } from '../src/types.ts';

const profile = parseProfile(
  JSON.parse(await readFile(new URL('../profile.json', import.meta.url), 'utf8')),
);
const now = new Date('2026-11-19T06:00:00Z');

let dir: string;
let statePath: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'digest-main-'));
  statePath = path.join(dir, 'sent.json');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const options = (over: Partial<RunOptions> = {}) => {
  const lines: string[] = [];
  const send = vi.fn<(message: Message) => Promise<void>>(async () => {});
  const opts: RunOptions = {
    sources: [new FakeSource(SAMPLE_ITEMS)],
    profile,
    store: fileStore(statePath),
    dryRun: false,
    now,
    send,
    log: (l) => lines.push(l),
    ...over,
  };
  return { opts, lines, send };
};

/** 20 distinct matching items with long titles → the digest needs more than one message. */
const manyItems: RawItem[] = Array.from({ length: 20 }, (_, i) => ({
  source: 'fake',
  url: `https://jobs.example.com/vacancies/${2000 + i}`,
  title: `Senior Node.js Engineer ${i} ${'x'.repeat(180)}`,
  company: `Company ${i}`,
  location: 'remote',
  description: 'Node.js, TypeScript.',
}));
const toVacancy = (item: RawItem): Vacancy => {
  const v = normalize(item, now);
  if (!v) throw new Error('fixture must normalize');
  return v;
};

describe('run', () => {
  it('dry run prints the digest inside a stop-commands block, sends nothing, leaves no state', async () => {
    const { opts, lines, send } = options({ dryRun: true });
    const summary = await run(opts);
    expect(summary).toEqual({ fetched: 5, fresh: 4, matched: 2, sent: 0, rejected: 0 });
    const out = lines.join('\n');
    expect(out).toContain('Senior Node.js / NestJS Engineer');
    expect(out).toContain('Full-stack Developer (Node.js + React)');
    expect(out).not.toContain('Java Developer');
    expect(out).not.toContain('Junior');
    expect(send).not.toHaveBeenCalled();
    await expect(readFile(statePath)).rejects.toThrow();
  });

  it('dry run output cannot inject workflow commands', async () => {
    const evil: RawItem = {
      source: 'fake',
      url: 'https://jobs.example.com/vacancies/666',
      title: 'Senior Node.js Engineer\n::error::pwned',
      company: '::warning::evil\r\n::add-mask::x',
      location: 'remote',
    };
    const { opts, lines } = options({ dryRun: true, sources: [new FakeSource([evil])] });
    await run(opts);
    const printed = lines.join('\n').split('\n');
    const open = printed[0]?.match(/^::stop-commands::([0-9a-f-]{36})$/);
    expect(open).not.toBeNull();
    const token = open?.[1] ?? '';
    const close = printed.indexOf(`::${token}::`);
    expect(close).toBeGreaterThan(0);
    const body = printed.slice(1, close);
    expect(body.length).toBeGreaterThan(0);
    for (const line of body) expect(line.startsWith('  ')).toBe(true);
    expect(printed.slice(close + 1).some((l) => l.includes('::warning::'))).toBe(false);
  });

  it('sends once, remembers it, and sends nothing on the next run', async () => {
    const first = options();
    expect((await run(first.opts)).sent).toBe(2);
    expect(first.send).toHaveBeenCalledTimes(3); // header + one message per vacancy

    const second = options();
    expect(await run(second.opts)).toMatchObject({ fresh: 2, matched: 0, sent: 0 });
    expect(second.send).not.toHaveBeenCalled();
  });

  it('keeps going when one source fails, and fails when all do', async () => {
    const broken: Source = { name: 'broken', fetch: async () => Promise.reject(new Error('503')) };
    const partial = options({ sources: [broken, new FakeSource(SAMPLE_ITEMS)] });
    expect((await run(partial.opts)).sent).toBe(2);
    expect(partial.lines).toContain('source broken failed: 503');

    await expect(run(options({ sources: [broken] }).opts)).rejects.toThrow(
      'All sources failed (broken: 503)',
    );
  });

  describe('source failure alert', () => {
    const broken: Source = { name: 'broken', fetch: async () => Promise.reject(new Error('503')) };

    it('follows the digest with an alert naming the failed source', async () => {
      const { opts, send } = options({ sources: [broken, new FakeSource(SAMPLE_ITEMS)] });
      await run(opts);
      expect(send).toHaveBeenCalledTimes(4); // header + 2 vacancies + alert
      const alert = send.mock.calls[3]?.[0];
      expect(alert?.vacancies).toEqual([]);
      expect(alert?.silent).toBeUndefined();
      expect(alert?.text).toContain('broken: 503');
    });

    it('is sent even when there is nothing new', async () => {
      await run(options().opts);
      const { opts, send } = options({ sources: [broken, new FakeSource(SAMPLE_ITEMS)] });
      await run(opts);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0].text).toContain('broken: 503');
    });

    it('a failing alert does not fail the run or lose the state', async () => {
      const send = vi.fn(async (m: Message) => {
        if (m.vacancies.length === 0 && m.text.includes('broken')) throw new Error('network down');
      });
      const { opts, lines } = options({ send, sources: [broken, new FakeSource(SAMPLE_ITEMS)] });
      expect((await run(opts)).sent).toBe(2);
      expect(lines).toContain('alert failed: network down');
      expect(await run(options().opts)).toMatchObject({ sent: 0 });
    });

    it('is only logged in a dry run', async () => {
      const { opts, send, lines } = options({
        dryRun: true,
        sources: [broken, new FakeSource(SAMPLE_ITEMS)],
      });
      await run(opts);
      expect(send).not.toHaveBeenCalled();
      expect(lines).toContain('source broken failed: 503');
    });
  });

  describe('fit explanations', () => {
    const llm = (complete: LlmClient['complete']): LlmClient => ({ model: 'fake-llm', complete });

    it('explains each vacancy (line 4) and reports the stats', async () => {
      const reports: string[][] = [];
      const { opts, send, lines } = options({
        llm: llm(async () => ({ value: { fit: 'Node.js і NestJS', risk: 'рівень неясний' } })),
        report: async (r) => {
          reports.push(r);
        },
      });
      expect((await run(opts)).sent).toBe(2);
      const vacancyTexts = send.mock.calls.map((c) => c[0]).filter((m) => m.vacancies.length);
      expect(
        vacancyTexts.every((m) => m.text.includes('💡 Node.js і NestJS · ⚠️ рівень неясний')),
      ).toBe(true);
      expect(lines.some((l) => l.includes('explain: fake-llm · ok 2 · failed 0'))).toBe(true);
      expect(reports.flat().join('\n')).toContain('fake-llm');
    });

    it('a broken explainer still sends the digest, without line 4, and alerts once', async () => {
      const { opts, send } = options({
        llm: llm(async () => {
          throw new LlmError('auth', 'Workers AI failed with HTTP 401');
        }),
      });
      expect((await run(opts)).sent).toBe(2);
      const messages = send.mock.calls.map((c) => c[0]);
      expect(messages.some((m) => m.text.includes('💡'))).toBe(false);
      const alert = messages.at(-1);
      expect(alert?.vacancies).toEqual([]);
      expect(alert?.text).toContain('без пояснень');
      expect(alert?.text).toContain('Workers AI failed with HTTP 401');
    });

    it('a failed source and a broken explainer share one alert', async () => {
      const broken: Source = {
        name: 'broken',
        fetch: async () => Promise.reject(new Error('503')),
      };
      const { opts, send } = options({
        sources: [broken, new FakeSource(SAMPLE_ITEMS)],
        llm: llm(async () => ({ value: 'garbage' })),
      });
      await run(opts);
      const alerts = send.mock.calls.map((c) => c[0]).filter((m) => m.text.includes('⚠️ <b>'));
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.text).toContain('broken: 503');
      expect(alerts[0]?.text).toContain('пояснення: 2 з 2 без пояснення (invalid answer)');
    });

    it('a few odd answers are only logged; a limit cutting the run short alerts', async () => {
      let calls = 0;
      const odd = options({
        llm: llm(async () => (++calls === 1 ? { value: 'garbage' } : { value: { fit: 'ok' } })),
        explainOptions: { concurrency: 1 },
      });
      await run(odd.opts);
      expect(odd.send.mock.calls.map((c) => c[0].text).some((t) => t.includes('⚠️ <b>'))).toBe(
        false,
      );

      await rm(statePath, { force: true });
      let n = 0;
      const limited = options({
        llm: llm(async () => {
          if (++n === 2) throw new LlmError('limit', 'Workers AI limit reached (HTTP 429)');
          return { value: { fit: 'ok' } };
        }),
        explainOptions: { concurrency: 1 },
      });
      await run(limited.opts);
      expect(limited.send.mock.calls.at(-1)?.[0].text).toContain(
        'пояснення: 1 з 2 без пояснення (Workers AI limit reached (HTTP 429))',
      );
    });

    it('a half-configured explainer is reported in the alert', async () => {
      const { opts, send } = options({
        llmConfigError: 'Missing environment variables: CLOUDFLARE_AI_TOKEN',
      });
      expect((await run(opts)).sent).toBe(2);
      expect(send.mock.calls.at(-1)?.[0].text).toContain(
        'пояснення: Missing environment variables: CLOUDFLARE_AI_TOKEN',
      );
    });

    it('a failing report does not fail the run', async () => {
      const { opts, lines } = options({
        llm: llm(async () => ({ value: { fit: 'ok' } })),
        report: async () => Promise.reject(new Error('disk full')),
      });
      expect((await run(opts)).sent).toBe(2);
      expect(lines).toContain('report failed: disk full');
    });
  });

  it('redacts urls in source errors', async () => {
    const leaky: Source = {
      name: 'leaky',
      fetch: async () =>
        Promise.reject(new Error('GET https://user:pw@feed.test/rss?token=abc#x failed: 503')),
    };
    const { opts, lines } = options({ sources: [leaky, new FakeSource(SAMPLE_ITEMS)] });
    await run(opts);
    const line = lines.find((l) => l.startsWith('source leaky failed'));
    expect(line).toBe('source leaky failed: GET https://feed.test/rss failed: 503');
  });

  it('a Telegram 400 on one message quarantines its vacancies and the run continues', async () => {
    const send = vi
      .fn<(message: Message) => Promise<void>>()
      .mockResolvedValueOnce(undefined) // header
      .mockRejectedValueOnce(new TelegramApiError(400, 'Bad Request: message is too long'))
      .mockResolvedValue(undefined);
    const { opts, lines } = options({ send, sources: [new FakeSource(manyItems)] });
    const summary = await run(opts);
    expect(send.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(summary.rejected).toBeGreaterThan(0);
    expect(summary.sent).toBeGreaterThan(0);
    expect(summary.rejected + summary.sent).toBe(20);
    expect(lines.some((l) => l.includes('message 2 rejected by Telegram'))).toBe(true);
    // Both the delivered and the quarantined vacancies are remembered: nothing is retried forever.
    expect(selectNew(manyItems.map(toVacancy), await loadState(statePath), now)).toEqual([]);
  });

  it('fails fast on other send errors and persists only what was delivered', async () => {
    const send = vi.fn(async () =>
      Promise.reject(new TelegramApiError(500, 'Internal Server Error')),
    );
    await expect(run(options({ send }).opts)).rejects.toThrow('HTTP 500');
  });

  it('a 400 that is not about the message content (chat not found) fails the run', async () => {
    const send = vi.fn(async () =>
      Promise.reject(new TelegramApiError(400, 'Bad Request: chat not found')),
    );
    await expect(run(options({ send }).opts)).rejects.toThrow('chat not found');
    expect(Object.keys((await loadState(statePath)).sent)).toEqual([]);
    expect(Object.keys((await loadState(statePath)).sent)).toEqual([]);
  });

  it('a failing state save does not mask the send error', async () => {
    const store: StateStore = {
      load: async () => emptyState(),
      save: async () => Promise.reject(new Error('disk full')),
    };
    const send = vi.fn(async () => Promise.reject(new Error('network down')));
    const { opts, lines } = options({ send, store });
    await expect(run(opts)).rejects.toThrow('network down');
    expect(lines).toContain('saving state failed: disk full');
  });

  it('does not save when loading the state failed', async () => {
    const save = vi.fn(async () => {});
    const store: StateStore = { load: async () => Promise.reject(new Error('corrupt')), save };
    await expect(run(options({ store }).opts)).rejects.toThrow('corrupt');
    expect(save).not.toHaveBeenCalled();
  });
});

describe('redact', () => {
  it('strips userinfo, query and fragment, line breaks, and caps the length', () => {
    expect(redact('x https://a:b@h.test/p?q=1#f y')).toBe('x https://h.test/p y');
    expect(redact('a\r\nb')).toBe('a b');
    expect(redact('z'.repeat(1000)).length).toBeLessThanOrEqual(300);
  });
});

describe('createSources', () => {
  it('expands site names into one source per feed', () => {
    expect(createSources(['dou', 'djinni'], false).map((s) => s.name)).toEqual([
      'dou/Node.js',
      'dou/Fullstack',
      'djinni/Node.js',
      'djinni/Fullstack',
    ]);
  });
  it('rejects unknown names and the fake source outside dry runs', () => {
    expect(() => createSources(['workua'], false)).toThrow('Unknown source: workua');
    expect(() => createSources(['fake'], false)).toThrow(/only with --dry-run/);
    expect(createSources(['fake'], true).map((s) => s.name)).toEqual(['fake']);
  });
  it('builds each site once even when listed twice', () => {
    expect(createSources(['dou', 'dou'], false)).toHaveLength(2);
  });
});
