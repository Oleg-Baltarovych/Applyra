import { describe, expect, it } from 'vitest';
import { resolveRequestId } from './request-id.domain.js';

const gen = () => 'generated-id';

describe('resolveRequestId', () => {
  it.each([
    ['a UUID', '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'],
    ['a Cloudflare-style ray id', '8f2b3c4d5e6f7a8b'],
    ['the shortest allowed (8)', 'abcd1234'],
    ['the longest allowed (64)', 'a'.repeat(64)],
  ])('echoes %s', (_label, id) => {
    expect(resolveRequestId(id, gen)).toBe(id);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['too short', 'abc1234'],
    ['too long', 'a'.repeat(65)],
    ['a newline (log injection)', 'abcd1234\nlevel=error'],
    ['spaces / punctuation', 'abcd 1234;x'],
    ['an underscore', 'abcd_1234'],
    ['an array (repeated header)', ['abcd1234', 'efgh5678']],
  ])('replaces an id that is %s', (_label, header) => {
    expect(resolveRequestId(header, gen)).toBe('generated-id');
  });
});
