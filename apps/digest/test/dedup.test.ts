import { describe, expect, it } from 'vitest';
import { emptyState, markSent, pruneState, selectNew } from '../src/dedup.ts';
import { vacancy } from './support/vacancy.ts';

const now = new Date('2026-11-19T06:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe('selectNew', () => {
  it('keeps everything when nothing was sent yet', () => {
    const items = [vacancy(), vacancy({ title: 'Backend Engineer' })];
    expect(selectNew(items, emptyState(), now)).toEqual(items);
  });

  it('drops a vacancy whose canonical url was already sent', () => {
    const sent = vacancy({ url: 'https://Jobs.example.com/v/1/?utm_source=tg#apply' });
    const state = markSent(emptyState(), [sent], daysAgo(1));
    const again = vacancy({ url: 'https://jobs.example.com/v/1', title: 'Other' });
    expect(selectNew([again], state, now)).toEqual([]);
  });

  it('keeps meaningful query parameters in the canonical url', () => {
    const sent = vacancy({ url: 'https://jobs.example.com/view?id=1' });
    const state = markSent(emptyState(), [sent], daysAgo(1));
    const other = vacancy({ url: 'https://jobs.example.com/view?id=2', title: 'Other' });
    expect(selectNew([other], state, now)).toEqual([other]);
  });

  it('drops a repost of the same title + company under another url (fuzzy key)', () => {
    const sent = vacancy({ title: 'Senior Node.js Developer (Remote)', company: 'Acme LLC' });
    const state = markSent(emptyState(), [sent], daysAgo(1));
    const repost = vacancy({ title: 'senior  node.js developer', company: 'ACME' });
    expect(selectNew([repost], state, now)).toEqual([]);
  });

  it('does not fuzzy-match when the company is unknown', () => {
    const sent = vacancy({ company: '' });
    const state = markSent(emptyState(), [sent], daysAgo(1));
    const other = vacancy({ company: '' });
    expect(selectNew([other], state, now)).toEqual([other]);
  });

  describe('cross-site repeats when one side has no company (Djinni rarely names it)', () => {
    const dou = (over: Partial<Parameters<typeof vacancy>[0]> = {}) =>
      vacancy({
        source: 'dou',
        title: 'Middle Node.js Backend Engineer (TypeScript) — FinTech',
        company: 'NerdySoft',
        ...over,
      });
    const djinni = (over: Partial<Parameters<typeof vacancy>[0]> = {}) =>
      vacancy({
        source: 'djinni',
        title: 'Middle Node.js Backend Engineer (TypeScript) - FinTech',
        company: '',
        ...over,
      });

    it('keeps the version with the company within one batch, whatever the order', () => {
      const known = dou();
      expect(selectNew([djinni(), known], emptyState(), now)).toEqual([known]);
    });

    it('drops the company-less post when the same title was sent in the last 7 days', () => {
      const state = markSent(emptyState(), [dou()], daysAgo(6));
      expect(selectNew([djinni()], state, now)).toEqual([]);
    });

    it('drops the post with a company when the same title was sent without one', () => {
      const state = markSent(emptyState(), [djinni()], daysAgo(1));
      expect(selectNew([dou()], state, now)).toEqual([]);
    });

    it('lets the title match expire after 7 days', () => {
      const state = markSent(emptyState(), [dou()], daysAgo(8));
      const later = djinni();
      expect(selectNew([later], state, now)).toEqual([later]);
    });

    it('never merges two posts that both name (different) companies', () => {
      const state = markSent(emptyState(), [dou()], daysAgo(1));
      const other = dou({ company: 'Other Corp' });
      expect(selectNew([other], state, now)).toEqual([other]);
    });

    it('needs at least 4 title words: generic titles stay apart', () => {
      const state = markSent(
        emptyState(),
        [dou({ title: 'Senior Node.js Developer' })],
        daysAgo(1),
      );
      const generic = djinni({ title: 'Senior Node.js Developer' });
      expect(selectNew([generic], state, now)).toEqual([generic]);
    });

    it('counts words in brackets: a different stack in brackets is a different vacancy', () => {
      const state = markSent(
        emptyState(),
        [dou({ title: 'Senior Backend Developer (Node.js)' })],
        daysAgo(1),
      );
      const go = djinni({ title: 'Senior Backend Developer (Go)' });
      expect(selectNew([go], state, now)).toEqual([go]);
    });
  });

  it('deduplicates within one batch, first occurrence wins', () => {
    const a = vacancy({ source: 'a' });
    const b = vacancy({ source: 'b', url: a.url });
    expect(selectNew([a, b], emptyState(), now)).toEqual([a]);
  });
});

describe('pruneState', () => {
  it('forgets entries older than the TTL so they can be sent again', () => {
    const old = vacancy();
    const recent = vacancy({ title: 'Fullstack Engineer' });
    let state = markSent(emptyState(), [old], daysAgo(31));
    state = markSent(state, [recent], daysAgo(2));
    const pruned = pruneState(state, now, 30);
    expect(selectNew([old, recent], pruned, now)).toEqual([old]);
  });
});
