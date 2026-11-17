// Executes one IDOR fixture (11-testing.md §4 p.3). Throws (Vitest assertion) on any violation, so the integration
// suite and its self-test (a broken probe fixture must fail) share the exact same checks.
import { ApiError } from '@applyra/contracts';
import { expect } from 'vitest';
import type { AppPrisma } from '../../src/platform/prisma/index.js';
import { expectContract } from '../support/expect-contract.js';
import { fillPath, type Route } from '../support/idor-gate.js';
import type { TestSession } from '../support/session.js';
import type { IdorFixture, IdorFixtureSetup } from './define-idor-fixture.js';

type Agent = TestSession['agent'];
type Lower = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface IdorRunContext {
  prisma: AppPrisma;
  owner: TestSession;
  other: TestSession;
  /** Cookie-less agent with Origin preset (for @OptionalAuth routes). */
  anonymous: Agent;
  /** The fixture's route-table row (flags decide the anonymous check). */
  route: Route;
}

async function send(agent: Agent, fixture: IdorFixture, setup: IdorFixtureSetup) {
  const [method = '', path = ''] = fixture.route.split(' ');
  // RouteKey's method union, lower-cased, is exactly the set of Supertest verbs used here.
  let req = agent[method.toLowerCase() as Lower](fillPath(path, setup.params ?? {}));
  if (setup.query) req = req.query(setup.query);
  if (setup.body !== undefined) req = req.send(setup.body);
  return req;
}

const expectNoOwnedIds = (body: unknown, ownedIds: readonly string[], who: string) => {
  const text = JSON.stringify(body);
  for (const id of ownedIds) expect(text, `${who} response leaks A's id ${id}`).not.toContain(id);
};

async function freshSetup(fixture: IdorFixture, ctx: IdorRunContext): Promise<IdorFixtureSetup> {
  const setup = await fixture.setup({ prisma: ctx.prisma, owner: ctx.owner });
  expect(setup.ownedIds.length, 'fixture must return at least one owned id').toBeGreaterThan(0);
  return setup;
}

export async function runIdorFixture(fixture: IdorFixture, ctx: IdorRunContext): Promise<void> {
  // Positive control: the same request as the owner succeeds, so a 404 for B is not a broken fixture.
  const control = await send(ctx.owner.agent, fixture, await freshSetup(fixture, ctx));
  expect(
    control.status,
    `positive control: A's own request → ${String(control.status)}`,
  ).toBeGreaterThanOrEqual(200);
  expect(
    control.status,
    `positive control: A's own request → ${String(control.status)}`,
  ).toBeLessThan(300);

  const setup = await freshSetup(fixture, ctx);
  const before = fixture.kind === 'list' ? undefined : await setup.snapshot?.();
  if (fixture.kind !== 'list') {
    expect(before ?? null, `${fixture.kind} fixture needs a non-null snapshot()`).not.toBeNull();
  }
  const res = await send(ctx.other.agent, fixture, setup);
  if (fixture.kind === 'list') {
    expect(res.status).toBe(200);
    expectNoOwnedIds(res.body, setup.ownedIds, 'B');
  } else {
    expect(expectContract(res, 404, ApiError).code).toBe('NOT_FOUND');
    expect(await setup.snapshot?.(), "A's resource changed after B's request").toEqual(before);
  }

  if (ctx.route.isOptional) {
    const anonymousSetup = await freshSetup(fixture, ctx);
    const anonymous = await send(ctx.anonymous, fixture, anonymousSetup);
    expectNoOwnedIds(anonymous.body, anonymousSetup.ownedIds, 'anonymous');
  }
}
