import { SetMetadata } from '@nestjs/common';

export const IDOR_EXEMPT_KEY = 'applyra:idor-exempt';

/**
 * Marks a private handler as needing no IDOR fixture (11-testing.md §4 p.5): only for routes that never take another
 * user's resource, e.g. `GET /me`. The reason is mandatory and printed by the IDOR gate (test/idor-gate.test.ts).
 * Handler-only on purpose: a new route in an "exempt" controller must never be silently exempt. Metadata only — no
 * runtime effect.
 */
export function IdorExempt(reason: string): MethodDecorator {
  const trimmed = reason.trim();
  if (trimmed === '') throw new Error('@IdorExempt(reason): the reason must not be empty');
  return SetMetadata(IDOR_EXEMPT_KEY, trimmed);
}
