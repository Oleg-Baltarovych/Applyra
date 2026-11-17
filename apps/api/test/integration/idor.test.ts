// IDOR suite (FR-AUTH-03; 11-testing.md §4 p.3): for every fixture in test/idor/fixtures.ts user A owns a resource,
// user B (both signed in through the real OAuth path) requests it → 404 NOT_FOUND + A's state unchanged, or for lists
// 200 without any of A's ids; A's own request must succeed (positive control). Coverage of the registry is enforced
// in-process by test/idor-gate.test.ts. The self-test drives the same runner with probe fixtures that must fail.
import { randomUUID } from 'node:crypto';
import { Controller, Get, type INestApplication, Param } from '@nestjs/common';
import { OptionalAuth } from '@thallesp/nestjs-better-auth';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Session, type UserSession } from '../../src/modules/auth/index.js';
import { AppException } from '../../src/platform/http/index.js';
import type { AppPrisma } from '../../src/platform/prisma/index.js';
import { defineIdorFixture, type IdorFixture } from '../idor/define-idor-fixture.js';
import { idorFixtures } from '../idor/fixtures.js';
import { type IdorRunContext, runIdorFixture } from '../idor/run-idor-fixture.js';
import { createHttpApp } from '../support/http-app.js';
import { checkCoverage, type Route, routeKey } from '../support/idor-gate.js';
import { buildRouteTable } from '../support/route-table.js';
import { signInAs, type TestSession } from '../support/session.js';
import { testEnv } from '../support/test-env.js';
import { testPrisma } from './support/prisma.js';
import { testInfra } from './support/test-infra.js';

const WEB_ORIGIN = testEnv().WEB_ORIGIN;

// Self-test only: an in-memory per-user resource with one correct and one leaking list route.
const items = new Map<string, { ownerId: string; title: string }>();

@Controller('idor-probe')
class IdorRunnerProbeController {
  @Get('items/:id')
  byId(@Param('id') id: string, @Session() session: UserSession): { id: string; title: string } {
    const item = items.get(id);
    if (item?.ownerId !== session.user.id) throw new AppException('NOT_FOUND', 'Not found');
    return { id, title: item.title };
  }

  @OptionalAuth()
  @Get('feed')
  feed(@Session() session: UserSession | null): { ids: string[] } {
    const me = session?.user.id;
    return { ids: [...items].filter(([, i]) => i.ownerId === me).map(([id]) => id) };
  }

  @Get('leak')
  leak(): { ids: string[] } {
    return { ids: [...items.keys()] };
  }
}

const createItem = (owner: TestSession) => {
  const id = randomUUID();
  items.set(id, { ownerId: owner.userId, title: 'A' });
  return id;
};
const byIdFixture = (params: (id: string) => Record<string, string>, ownedIds = true) =>
  defineIdorFixture({
    route: 'GET /idor-probe/items/:id',
    kind: 'by-id',
    setup: ({ owner }) => {
      const id = createItem(owner);
      return Promise.resolve({
        params: params(id),
        ownedIds: ownedIds ? [id] : [],
        snapshot: () => Promise.resolve(items.get(id) ?? null),
      });
    },
  });
const listFixture = (route: 'GET /idor-probe/feed' | 'GET /idor-probe/leak'): IdorFixture =>
  defineIdorFixture({
    route,
    kind: 'list',
    setup: ({ owner }) => Promise.resolve({ ownedIds: [createItem(owner)] }),
  });

let app: INestApplication;
let prisma: AppPrisma;
let a: TestSession;
let b: TestSession;
let routes: Route[];

const contextFor = (fixture: IdorFixture): IdorRunContext => {
  const route = routes.find((r) => routeKey(r) === fixture.route);
  if (!route) throw new Error(`no route ${fixture.route}`);
  return {
    prisma,
    owner: a,
    other: b,
    anonymous: request.agent(app.getHttpServer()).set('Origin', WEB_ORIGIN),
    route,
  };
};

beforeAll(async () => {
  app = await createHttpApp({
    env: testEnv({ DATABASE_URL: testInfra().databaseUrl, REDIS_URL: testInfra().redisUrl }),
    controllers: [IdorRunnerProbeController],
  });
  prisma = testPrisma();
  a = await signInAs(app, 'A');
  b = await signInAs(app, 'B');
  routes = buildRouteTable(app);
});

afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});

describe('IDOR suite', () => {
  it('A and B sign in through the real auth path as distinct users; every fixture names a route of the app', () => {
    expect(a.userId).not.toBe(b.userId);
    const keys = idorFixtures.map((f) => f.route);
    expect(checkCoverage(routes, keys).unknownFixtures).toEqual([]);
  });

  for (const fixture of idorFixtures) {
    it(`${fixture.route} (${fixture.kind}): user B cannot reach user A's resource`, async () => {
      await runIdorFixture(fixture, contextFor(fixture));
    });
  }

  // TODO(first admin route, R1): @Roles('ADMIN') → 404 for USER incl. demo (11 §4 table).
  it.todo("@Roles('ADMIN') route → 404 for a USER");
  // TODO(M1-02, mutation metadata): GET handlers are not marked as mutations (11 §4 p.6).
  it.todo('GET handlers are not marked as mutations');
});

describe('IDOR runner self-test (probe fixtures)', () => {
  it('a correct by-id fixture passes', async () => {
    const fixture = byIdFixture((id) => ({ id }));
    await runIdorFixture(fixture, contextFor(fixture));
  });

  it('an @OptionalAuth list fixture passes (B and anonymous see none of A ids)', async () => {
    const fixture = listFixture('GET /idor-probe/feed');
    await runIdorFixture(fixture, contextFor(fixture));
  });

  it('a fixture with a wrong param fails the positive control', async () => {
    const fixture = byIdFixture(() => ({ id: randomUUID() }));
    await expect(runIdorFixture(fixture, contextFor(fixture))).rejects.toThrow(/positive control/);
  });

  it('a fixture without owned ids fails', async () => {
    const fixture = byIdFixture((id) => ({ id }), false);
    await expect(runIdorFixture(fixture, contextFor(fixture))).rejects.toThrow(/owned id/);
  });

  it("a list route that leaks A's ids fails", async () => {
    const fixture = listFixture('GET /idor-probe/leak');
    await expect(runIdorFixture(fixture, contextFor(fixture))).rejects.toThrow(/leaks A's id/);
  });
});
