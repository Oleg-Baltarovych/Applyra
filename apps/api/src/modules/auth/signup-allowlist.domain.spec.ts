import { describe, expect, it } from 'vitest';
import { isSignupAllowed } from './signup-allowlist.domain.js';

describe('isSignupAllowed', () => {
  const allowlist = ['owner@example.com', 'Friend@Example.org'];

  it('allows an email from the allowlist', () => {
    expect(isSignupAllowed('owner@example.com', allowlist)).toBe(true);
  });

  it('compares case-insensitively and ignores surrounding whitespace', () => {
    expect(isSignupAllowed('friend@example.org', ['  friend@example.org '])).toBe(true);
    expect(isSignupAllowed('  OWNER@example.COM ', allowlist)).toBe(true);
    expect(isSignupAllowed('friend@example.org', allowlist)).toBe(true);
  });

  it('rejects an email outside the allowlist', () => {
    expect(isSignupAllowed('stranger@example.com', allowlist)).toBe(false);
  });

  it('rejects everyone when the allowlist is empty (fails closed)', () => {
    expect(isSignupAllowed('owner@example.com', [])).toBe(false);
  });

  it('does not match on substrings or another domain', () => {
    expect(isSignupAllowed('owner@example.com.evil.test', allowlist)).toBe(false);
    expect(isSignupAllowed('xowner@example.com', allowlist)).toBe(false);
  });
});
