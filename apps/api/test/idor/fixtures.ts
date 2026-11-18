// IDOR fixture registry (11-testing.md §4): one entry per private route, unless the handler has @IdorExempt(reason).
// The coverage gate (test/idor-gate.test.ts) fails on a private route missing here and on an entry for an unknown route.
// Keys carry the /api/v1 prefix (e.g. 'GET /api/v1/jobs/:id'). First entries: M1-04; M0-11 /me routes are
// @IdorExempt (test/idor/exemptions.ts) with their A/B isolation in test/integration/me.test.ts.
import type { IdorFixture } from './define-idor-fixture.js';

export const idorFixtures: readonly IdorFixture[] = [];
