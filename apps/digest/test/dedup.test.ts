import { describe, expect, it } from 'vitest';
import { emptyState, markSent, pruneState, selectNew } from '../src/dedup.ts';
import { vacancy } from './support/vacancy.ts';

const now = new Date('2026-11-19T06:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe('selectNew', () => {
  it('keeps everything when nothing was sent yet', () => {
    const items = [vacancy(), vacancy({ title: 'Backend Engineer' })];
    expect(selectNew(items, emptyState())).toEqual(items);
  });

  it('drops a vacancy whose canonical url was already sent', () => {
    const sent = vacancy({ url: 'https://Jobs.example.com/v/1/?utm_source=tg#apply' });
    const state = markSent(emptyState(), [sent], daysAgo(1));
    const again = vacancy({ url: 'https://jobs.example.com/v/1', title: 'Other' });
    expect(selectNew([again], state)).toEqual([]);
  });

  it('keeps meaningful query parameters in the canonical url', () => {
    const sent = vacancy({ url: 'https://jobs.example.com/view?id=1' });
    const state = markSent(emptyState(), [sent], daysAgo(1));
    const other = vacancy({ url: 'https://jobs.example.com/view?id=2', title: 'Other' });
    expect(selectNew([other], state)).toEqual([other]);
  });

  it('drops a repost of the same title + company under another url (fuzzy key)', () => {
    const sent = vacancy({ title: 'Senior Node.js Developer (Remote)', company: 'Acme LLC' });
    const state = markSent(emptyState(), [sent], daysAgo(1));
    const repost = vacancy({ title: 'senior  node.js developer', company: 'ACME' });
    expect(selectNew([repost], state)).toEqual([]);
  });

  it('does not fuzzy-match when the company is unknown', () => {
    const sent = vacancy({ company: '' });
    const state = markSent(emptyState(), [sent], daysAgo(1));
    const other = vacancy({ company: '' });
    expect(selectNew([other], state)).toEqual([other]);
  });

  it('deduplicates within one batch, first occurrence wins', () => {
    const a = vacancy({ source: 'a' });
    const b = vacancy({ source: 'b', url: a.url });
    expect(selectNew([a, b], emptyState())).toEqual([a]);
  });
});

describe('pruneState', () => {
  it('forgets entries older than the TTL so they can be sent again', () => {
    const old = vacancy();
    const recent = vacancy({ title: 'Fullstack Engineer' });
    let state = markSent(emptyState(), [old], daysAgo(31));
    state = markSent(state, [recent], daysAgo(2));
    const pruned = pruneState(state, now, 30);
    expect(selectNew([old, recent], pruned)).toEqual([old]);
  });
});
