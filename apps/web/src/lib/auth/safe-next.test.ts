import { describe, expect, it } from 'vitest';
import { DEFAULT_LANDING, safeNext } from './safe-next';

describe('safeNext', () => {
  it.each([
    ['/today', '/today'],
    ['/applications?view=table#x', '/applications?view=table#x'],
    ['/settings/preferences', '/settings/preferences'],
  ])('keeps a same-origin relative path %s', (raw, expected) => {
    expect(safeNext(raw)).toBe(expected);
  });

  it.each([
    null,
    '',
    'today',
    '//evil.example',
    '/\\evil.example',
    '/%5Cevil',
    'https://evil.example/x',
    'javascript:alert(1)',
    '/sign-in',
    '/sign-in?next=/today',
    '/\tevil',
    ' /today',
  ])('falls back to the default landing for %o', (raw) => {
    expect(safeNext(raw)).toBe(DEFAULT_LANDING);
  });

  it('default landing is /applications (Q2: Today branch arrives with M1)', () => {
    expect(DEFAULT_LANDING).toBe('/applications');
  });
});
