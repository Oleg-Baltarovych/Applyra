// R0 sign-up gate (FR-AUTH-02, S-06): only emails from AUTH_SIGNUP_ALLOWLIST may create an account.
// The only place that case-folds: platform/config/env.schema.ts just splits, trims and validates the list.
const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** Exact, case-insensitive match; an empty allowlist admits nobody (fails closed). */
export function isSignupAllowed(email: string, allowlist: readonly string[]): boolean {
  const candidate = normalizeEmail(email);
  return allowlist.some((allowed) => normalizeEmail(allowed) === candidate);
}
