// Typed IDOR fixture (11-testing.md §4 p.2–3). Registered in fixtures.ts; run by test/integration/idor.test.ts.
import type { AppPrisma } from '../../src/platform/prisma/index.js';
import type { TestSession } from '../support/session.js';

export type RouteKey = `${'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'} /${string}`;

export interface IdorFixtureSetup {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: object;
  /** Ids of A's resources that must never appear in B's (or an anonymous) response; at least one. */
  ownedIds: string[];
  /** DB state of A's resource: required (non-null) for by-id / create-ref, equal before and after B's request. */
  snapshot?: () => Promise<unknown>;
}

export interface IdorFixture {
  /** Exactly the route-table key, e.g. `GET /jobs/:id`. */
  route: RouteKey;
  /** 11 §4 table: by-id → 404 + unchanged; list → 200 without A's ids; create-ref → 404 + unchanged. */
  kind: 'by-id' | 'list' | 'create-ref';
  /**
   * Creates A's resource (owner = user A, signed in through the real auth path). Called twice per run: once for the
   * positive control (A's own request must succeed), once for B's attempt — so mutating requests get a fresh resource.
   */
  setup(ctx: { prisma: AppPrisma; owner: TestSession }): Promise<IdorFixtureSetup>;
}

export const defineIdorFixture = (fixture: IdorFixture): IdorFixture => fixture;
