import { describe, expect, it } from 'vitest';
import {
  ABSOLUTE_SESSION_LIFETIME_MS,
  capSessionExpiry,
  isBeyondAbsoluteLifetime,
} from './session-lifetime.domain.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const createdAt = new Date('2026-01-01T00:00:00.000Z');
const at = (offsetMs: number) => new Date(createdAt.getTime() + offsetMs);

describe('isBeyondAbsoluteLifetime', () => {
  it('is 30 days (09 §4.2)', () => {
    expect(ABSOLUTE_SESSION_LIFETIME_MS).toBe(30 * DAY_MS);
  });

  it('keeps a session younger than the lifetime', () => {
    expect(isBeyondAbsoluteLifetime(createdAt, at(0))).toBe(false);
    expect(isBeyondAbsoluteLifetime(createdAt, at(30 * DAY_MS - 1))).toBe(false);
  });

  it('keeps a session exactly at the lifetime', () => {
    expect(isBeyondAbsoluteLifetime(createdAt, at(30 * DAY_MS))).toBe(false);
  });

  it('ends a session older than the lifetime', () => {
    expect(isBeyondAbsoluteLifetime(createdAt, at(30 * DAY_MS + 1))).toBe(true);
  });

  it('honours a custom lifetime', () => {
    expect(isBeyondAbsoluteLifetime(createdAt, at(1001), 1000)).toBe(true);
    expect(isBeyondAbsoluteLifetime(createdAt, at(1000), 1000)).toBe(false);
  });
});

describe('capSessionExpiry', () => {
  it('keeps a requested expiry inside the absolute lifetime', () => {
    const requested = at(29 * DAY_MS);
    expect(capSessionExpiry(createdAt, requested)).toEqual(requested);
  });

  it('clamps a sliding refresh to createdAt + 30 d', () => {
    expect(capSessionExpiry(createdAt, at(36 * DAY_MS))).toEqual(at(30 * DAY_MS));
    expect(capSessionExpiry(createdAt, at(30 * DAY_MS + 1))).toEqual(at(30 * DAY_MS));
  });

  it('keeps an expiry exactly at the cap', () => {
    expect(capSessionExpiry(createdAt, at(30 * DAY_MS))).toEqual(at(30 * DAY_MS));
  });
});
