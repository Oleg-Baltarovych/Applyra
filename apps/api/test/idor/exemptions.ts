// Reviewed @IdorExempt surface (11-testing.md §4 p.5). Every change here shows up in the diff of a PR.

/**
 * Exempt routes with a `:param` or a non-GET method — allowed only after review, one comment each saying why the route
 * cannot reach another user's resource (e.g. M0-11 `PATCH /me/settings`: writes only the caller's own row).
 */
export const EXEMPT_ALLOWLIST: readonly string[] = [
  // M0-11: the handler takes no id at all — userId only from the session, `UpdateUserSettings` is strict (a smuggled
  // `userId` → 400) and the repository updates `where: { userId }`. Cross-user isolation: test/integration/me.test.ts.
  'PATCH /api/v1/me/settings',
];

/** Expected exemptions of the production AppModule (route → reason); asserted exactly by test/idor-gate.test.ts. */
export const EXPECTED_EXEMPT_ROUTES: readonly { route: string; reason: string }[] = [
  { route: 'GET /api/v1/me', reason: 'self-scoped: user from the session, no id input' },
  {
    route: 'PATCH /api/v1/me/settings',
    reason: "self-scoped: writes only the session user's settings row; strict body has no id",
  },
];
