import { describe, expect, it } from 'vitest';
import { isSignupAllowed } from './signup-allowlist.domain.js';

const verified = (email: string) => ({ email, emailVerified: true });

describe('isSignupAllowed', () => {
  const allowlist = ['owner@example.com', 'Friend@Example.org'];

  it('allows a verified email from the allowlist', () => {
    expect(isSignupAllowed(verified('owner@example.com'), allowlist)).toBe(true);
  });

  it('compares case-insensitively and ignores surrounding whitespace', () => {
    expect(isSignupAllowed(verified('friend@example.org'), ['  friend@example.org '])).toBe(true);
    expect(isSignupAllowed(verified('  OWNER@example.COM '), allowlist)).toBe(true);
    expect(isSignupAllowed(verified('friend@example.org'), allowlist)).toBe(true);
  });

  it('rejects an email outside the allowlist', () => {
    expect(isSignupAllowed(verified('stranger@example.com'), allowlist)).toBe(false);
  });

  it('rejects everyone when the allowlist is empty (fails closed)', () => {
    expect(isSignupAllowed(verified('owner@example.com'), [])).toBe(false);
  });

  it('does not match on substrings or another domain', () => {
    expect(isSignupAllowed(verified('owner@example.com.evil.test'), allowlist)).toBe(false);
    expect(isSignupAllowed(verified('xowner@example.com'), allowlist)).toBe(false);
  });

  it('rejects an allowlisted email that the provider did not verify', () => {
    expect(isSignupAllowed({ email: 'owner@example.com', emailVerified: false }, allowlist)).toBe(
      false,
    );
  });
});
