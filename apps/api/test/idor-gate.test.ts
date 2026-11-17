// IDOR gate (FR-AUTH-03; 11-testing.md §4 p.4–6, 09 §15 API1/API5) on the production composition: every private route
// has an IDOR fixture or @IdorExempt(reason), and answers 401 without a session. No database needed: a cookie-less
// request never reaches Prisma (Better Auth's getSession returns null without a session cookie).
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXEMPT_ALLOWLIST, EXPECTED_EXEMPT_ROUTES } from './idor/exemptions.js';
import { idorFixtures } from './idor/fixtures.js';
import { createHttpApp } from './support/http-app.js';
import {
  checkCoverage,
  formatReport,
  globalGuardProblems,
  probeProtection,
} from './support/idor-gate.js';
import { IdorProbeController } from './support/idor-probe.controller.js';
import {
  adapterRouteProblems,
  applicationConfigOf,
  buildRouteTable,
} from './support/route-table.js';
import { testEnv } from './support/test-env.js';

const env = testEnv();
const fixtureKeys = idorFixtures.map((f) => f.route);

describe('IDOR gate — production AppModule', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createHttpApp({ env });
  });
  afterAll(async () => {
    await app.close();
  });

  it('coverage: every private route has a fixture or @IdorExempt, every fixture a route', () => {
    const result = checkCoverage(buildRouteTable(app), fixtureKeys, EXEMPT_ALLOWLIST);
    const report = formatReport(result);
    if (report) console.info(`IDOR gate report:\n${report}`);
    expect(result.uncovered, report).toEqual([]);
    expect(result.unknownFixtures, report).toEqual([]);
    expect(result.badExemptions, report).toEqual([]);
    // Every new exemption must also be added to test/idor/exemptions.ts, so it shows in the PR diff.
    expect(result.exempt, report).toEqual(EXPECTED_EXEMPT_ROUTES);
  });

  it('no route is registered on Express outside Nest controllers (besides allowlisted mounts)', () => {
    expect(adapterRouteProblems(app, buildRouteTable(app))).toEqual([]);
  });

  it('protection: every non-@Public, non-@OptionalAuth route answers 401 UNAUTHENTICATED without a session', async () => {
    expect(await probeProtection(app, buildRouteTable(app), env.WEB_ORIGIN)).toEqual([]);
  });

  it('global guards: HttpPolicyGuard, thallesp AuthGuard, then SessionLifetimeGuard', () => {
    expect(globalGuardProblems(applicationConfigOf(app).getGlobalGuards())).toEqual([]);
  });
});

describe('IDOR gate self-test', () => {
  describe('AppModule + an unfixtured private route', () => {
    let app: INestApplication;
    beforeAll(async () => {
      app = await createHttpApp({ env, controllers: [IdorProbeController] });
    });
    afterAll(async () => {
      await app.close();
    });

    it('coverage gate fails, naming the route; the exemption is reported', () => {
      const result = checkCoverage(buildRouteTable(app), fixtureKeys);
      expect(result.uncovered).toEqual(['GET /probe/:id', 'GET /probe/optional/list']);
      expect(formatReport(result)).toContain('GET /probe/:id');
      expect(result.exempt).toEqual([
        { route: 'POST /probe/me', reason: 'probe: own data only' },
        { route: 'POST /probe/me/alias', reason: 'probe: own data only' },
      ]);
    });

    it('a non-GET exemption is refused unless allowlisted', () => {
      const routes = buildRouteTable(app);
      expect(checkCoverage(routes, fixtureKeys).badExemptions).toEqual([
        'POST /probe/me — non-GET exempt route',
        'POST /probe/me/alias — non-GET exempt route',
      ]);
      const allowlist = ['POST /probe/me', 'POST /probe/me/alias'];
      expect(checkCoverage(routes, fixtureKeys, allowlist).badExemptions).toEqual([]);
    });

    it('a route registered directly on the Express adapter fails the adapter check', () => {
      app.getHttpAdapter().get('/__raw', (_req: unknown, res: { end(): void }) => {
        res.end();
      });
      expect(adapterRouteProblems(app, buildRouteTable(app))).toEqual([
        'GET /__raw is registered on Express outside Nest controllers',
      ]);
    });

    it('a fixture for a route that does not exist fails the gate', () => {
      const result = checkCoverage(buildRouteTable(app), ['DELETE /probe/:id']);
      expect(result.unknownFixtures).toEqual(['DELETE /probe/:id']);
    });

    it('protection gate passes: the private and exempt routes answer 401', async () => {
      expect(await probeProtection(app, buildRouteTable(app), env.WEB_ORIGIN)).toEqual([]);
    });
  });

  describe('the same controller without AuthModule', () => {
    let app: INestApplication;
    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [IdorProbeController],
      }).compile();
      app = moduleRef.createNestApplication();
      await app.init();
    });
    afterAll(async () => {
      await app.close();
    });

    it('protection gate fails, naming the unguarded routes', async () => {
      const failures = await probeProtection(app, buildRouteTable(app), env.WEB_ORIGIN);
      expect(failures).toEqual([
        'GET /probe/:id → 200 undefined',
        'POST /probe/me → 201 undefined',
        'POST /probe/me/alias → 201 undefined',
      ]);
    });

    it('global guard check fails', () => {
      expect(globalGuardProblems(applicationConfigOf(app).getGlobalGuards())).toEqual([
        'global HttpPolicyGuard is not registered',
        'global AuthGuard (@thallesp/nestjs-better-auth) is not registered',
        'global SessionLifetimeGuard is not registered',
      ]);
    });
  });
});
