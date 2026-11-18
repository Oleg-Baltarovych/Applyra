import { describe, expect, it } from 'vitest';
import { signInErrorMessage } from './sign-in-error';

describe('signInErrorMessage', () => {
  it('maps the allowlist rejection (FR-AUTH-02)', () => {
    expect(signInErrorMessage('SIGNUP_CLOSED')).toBe('Access is invite-only');
  });

  it('maps an unverified Google email on an existing account (09 §4.4)', () => {
    expect(signInErrorMessage('account_not_linked')).toBe(
      'Verify your email address in your Google account, then try again',
    );
  });

  it.each(['unable_to_create_user', 'state_mismatch', '<script>', 'x'.repeat(500)])(
    'shows a generic message for %s without echoing it',
    (code) => {
      const message = signInErrorMessage(code);
      expect(message).toBe('Sign-in failed, try again');
      expect(message).not.toContain(code);
    },
  );

  it('returns null without an error', () => {
    expect(signInErrorMessage(null)).toBeNull();
  });
});
