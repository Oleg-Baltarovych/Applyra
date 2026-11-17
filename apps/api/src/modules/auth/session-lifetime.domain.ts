// Absolute session lifetime (09 §4.2, FR-AUTH-04). Better Auth only has the sliding `expiresIn` (7 d idle);
// SessionLifetimeGuard ends a session once it is older than this, however active it is.
export const ABSOLUTE_SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/** True once more than `lifetimeMs` has passed since `createdAt` (exactly at the limit is still valid). */
export function isBeyondAbsoluteLifetime(
  createdAt: Date,
  now: Date,
  lifetimeMs: number = ABSOLUTE_SESSION_LIFETIME_MS,
): boolean {
  return now.getTime() - createdAt.getTime() > lifetimeMs;
}

/** The expiry a sliding refresh may set: never later than `createdAt + lifetimeMs` (Better Auth session hooks). */
export function capSessionExpiry(
  createdAt: Date,
  requested: Date,
  lifetimeMs: number = ABSOLUTE_SESSION_LIFETIME_MS,
): Date {
  const cap = createdAt.getTime() + lifetimeMs;
  return requested.getTime() > cap ? new Date(cap) : requested;
}
