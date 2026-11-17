// R0 sign-up gate (FR-AUTH-02, S-06): only provider-verified emails from AUTH_SIGNUP_ALLOWLIST may create an account.
// The only place that case-folds: platform/config/env.schema.ts just splits, trims and validates the list.
const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export interface SignupCandidate {
  readonly email: string;
  /** From the provider (Google `email_verified`); an unverified address proves nothing about ownership. */
  readonly emailVerified: boolean;
}

/** Verified email + exact, case-insensitive match; an empty allowlist admits nobody (fails closed). */
export function isSignupAllowed(candidate: SignupCandidate, allowlist: readonly string[]): boolean {
  if (candidate.emailVerified !== true) return false;
  const email = normalizeEmail(candidate.email);
  return allowlist.some((allowed) => normalizeEmail(allowed) === email);
}
