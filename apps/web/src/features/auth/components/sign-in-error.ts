// `?error=` on /sign-in (OAuth errorCallbackURL, 10 §2.1): known codes get a specific message, anything else a
// generic one — the raw value is never rendered.
const MESSAGES: Record<string, string> = {
  SIGNUP_CLOSED: 'Access is invite-only',
  account_not_linked: 'Verify your email address in your Google account, then try again',
};

export function signInErrorMessage(code: string | null): string | null {
  if (code === null) return null;
  return Object.hasOwn(MESSAGES, code) ? (MESSAGES[code] ?? null) : 'Sign-in failed, try again';
}
