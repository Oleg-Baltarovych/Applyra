import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CurrencyCode, IdempotencyKey, IsoDateTime, PaginationQuery, page } from '../src/index.js';

describe('PaginationQuery (06 §2)', () => {
  it('defaults limit to 25 and coerces the query string', () => {
    expect(PaginationQuery.parse({})).toEqual({ limit: 25 });
    expect(PaginationQuery.parse({ limit: '100', cursor: 'eyJ2IjoxfQ' })).toEqual({
      limit: 100,
      cursor: 'eyJ2IjoxfQ',
    });
  });

  it('rejects limit outside 1..100, non-integers and a non-base64url cursor', () => {
    for (const limit of ['0', '101', '2.5', 'abc', '']) {
      expect(PaginationQuery.safeParse({ limit }).success, limit).toBe(false);
    }
    expect(PaginationQuery.safeParse({ cursor: 'a+b/c=' }).success).toBe(false);
    expect(PaginationQuery.safeParse({ cursor: '' }).success).toBe(false);
  });

  it('is strict', () => {
    expect(PaginationQuery.safeParse({ offset: '10' }).success).toBe(false);
  });

  it('request JSON Schema (io: input) is representable', () => {
    expect(() => z.toJSONSchema(PaginationQuery, { io: 'input' })).not.toThrow();
  });
});

describe('page()', () => {
  const Page = page(z.strictObject({ id: z.string() }));

  it('accepts { items, nextCursor } with a null cursor on the last page', () => {
    const body = { items: [{ id: 'a' }], nextCursor: null };
    expect(Page.parse(body)).toEqual(body);
  });

  it('requires nextCursor (null, never omitted) and validates items', () => {
    expect(Page.safeParse({ items: [] }).success).toBe(false);
    expect(Page.safeParse({ items: [{ id: 1 }], nextCursor: null }).success).toBe(false);
  });
});

describe('IdempotencyKey (06 §4)', () => {
  it('accepts 8..128 chars of [A-Za-z0-9_-]', () => {
    expect(IdempotencyKey.safeParse('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b').success).toBe(true);
    expect(IdempotencyKey.safeParse('a'.repeat(8)).success).toBe(true);
    expect(IdempotencyKey.safeParse('a_'.repeat(64)).success).toBe(true);
  });

  it('rejects too short, too long and other characters', () => {
    expect(IdempotencyKey.safeParse('a'.repeat(7)).success).toBe(false);
    expect(IdempotencyKey.safeParse('a'.repeat(129)).success).toBe(false);
    expect(IdempotencyKey.safeParse('abcd efgh').success).toBe(false);
  });
});

describe('scalars', () => {
  it('IsoDateTime requires UTC with Z (06 §1)', () => {
    expect(IsoDateTime.safeParse('2026-11-19T10:00:00.000Z').success).toBe(true);
    expect(IsoDateTime.safeParse('2026-11-19T10:00:00+02:00').success).toBe(false);
    expect(IsoDateTime.safeParse('2026-11-19').success).toBe(false);
  });

  it('CurrencyCode is three upper-case letters (= DB CHECK)', () => {
    expect(CurrencyCode.safeParse('USD').success).toBe(true);
    for (const bad of ['usd', 'US', 'USDT'])
      expect(CurrencyCode.safeParse(bad).success, bad).toBe(false);
  });
});
