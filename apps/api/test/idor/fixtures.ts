// IDOR fixture registry (11-testing.md §4): one entry per private route, unless the handler has @IdorExempt(reason).
// The coverage gate (test/idor-gate.test.ts) fails on a private route missing here and on an entry for an unknown route.
// First entries: M1-04 (/jobs/:id); M0-11 routes are @IdorExempt.
import type { IdorFixture } from './define-idor-fixture.js';

export const idorFixtures: readonly IdorFixture[] = [];
