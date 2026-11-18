import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatNumber } from './format';

// 23:30 UTC on 1 Nov = 01:30 on 2 Nov in Kyiv (UTC+2 after the October DST switch).
const LATE_EVENING_UTC = '2026-11-01T23:30:00.000Z';

describe('formatDate', () => {
  it('uses the user time zone, not the machine one', () => {
    expect(formatDate(LATE_EVENING_UTC, { timeZone: 'UTC', locale: 'en-GB' })).toBe('1 Nov 2026');
    expect(formatDate(LATE_EVENING_UTC, { timeZone: 'Europe/Kyiv', locale: 'en-GB' })).toBe(
      '2 Nov 2026',
    );
  });

  it('follows the locale', () => {
    expect(formatDate(LATE_EVENING_UTC, { timeZone: 'UTC', locale: 'en-US' })).toBe('Nov 1, 2026');
  });

  it('accepts a Date', () => {
    expect(formatDate(new Date(LATE_EVENING_UTC), { timeZone: 'UTC', locale: 'en-GB' })).toBe(
      '1 Nov 2026',
    );
  });
});

describe('formatDateTime', () => {
  it('shows the wall-clock time in the user time zone', () => {
    expect(formatDateTime(LATE_EVENING_UTC, { timeZone: 'Europe/Kyiv', locale: 'en-GB' })).toBe(
      '2 Nov 2026, 01:30',
    );
    expect(formatDateTime(LATE_EVENING_UTC, { timeZone: 'UTC', locale: 'en-GB' })).toBe(
      '1 Nov 2026, 23:30',
    );
  });
});

describe('formatNumber', () => {
  it('groups digits per locale', () => {
    expect(formatNumber(1234567.5, { locale: 'en-US' })).toBe('1,234,567.5');
    expect(formatNumber(1234567.5, { locale: 'de-DE' })).toBe('1.234.567,5');
  });
});
