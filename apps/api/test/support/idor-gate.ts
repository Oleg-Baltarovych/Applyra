// IDOR gate (11-testing.md §4, T-02; 09 §15 API1/API5): coverage of private routes by fixtures/exemptions and a
// black-box auth probe. Pure logic is unit-tested in idor-gate.test.ts; the gate itself runs in test/idor-gate.test.ts.
import type { CanActivate, INestApplication } from '@nestjs/common';
import { AuthGuard } from '@thallesp/nestjs-better-auth';
import request from 'supertest';
import { SessionLifetimeGuard } from '../../src/modules/auth/session-lifetime.guard.js';
import { HttpPolicyGuard } from '../../src/platform/http/http-policy.guard.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD' | 'ALL';

/** One row of the route table (route-table.ts). */
export interface Route {
  readonly method: HttpMethod;
  /** Normalised: global prefix + controller + handler path, `/a/:id`, no trailing slash. */
  readonly path: string;
  readonly isPublic: boolean;
  readonly isOptional: boolean;
  readonly roles: readonly string[];
  /** `@IdorExempt` reason, or null. */
  readonly idorExempt: string | null;
  readonly controller: string;
  readonly handler: string;
}

export const routeKey = (route: Pick<Route, 'method' | 'path'>): string =>
  `${route.method} ${route.path}`;

export interface CoverageResult {
  /** Private, not exempt (or @Roles), no fixture. */
  readonly uncovered: readonly string[];
  /** Fixture keys that name no private, non-exempt route (removed, renamed, public or exempt). */
  readonly unknownFixtures: readonly string[];
  readonly exempt: readonly { route: string; reason: string }[];
  /** Exemptions the gate refuses: on a @Roles route, or with a :param / non-GET method and not allowlisted. */
  readonly badExemptions: readonly string[];
}

/**
 * `nonPublic − fixtures − exempt` must be empty (@OptionalAuth counts as private), and no fixture may dangle.
 * An exemption is only for routes that cannot take another user's resource: a :param or a mutation needs an entry in
 * `exemptAllowlist` (reviewed in test/idor/exemptions.ts); a @Roles route always needs a fixture (11 §4 table).
 */
export function checkCoverage(
  routes: readonly Route[],
  fixtureKeys: Iterable<string>,
  exemptAllowlist: Iterable<string> = [],
): CoverageResult {
  const fixtures = new Set(fixtureKeys);
  const allowlisted = new Set(exemptAllowlist);
  const needsFixture = new Set<string>();
  const exempt: { route: string; reason: string }[] = [];
  const badExemptions: string[] = [];
  for (const route of routes) {
    if (route.isPublic) continue;
    const key = routeKey(route);
    if (route.idorExempt === null) {
      needsFixture.add(key);
    } else if (route.roles.length > 0) {
      needsFixture.add(key);
      badExemptions.push(`${key} — @Roles route needs a fixture, not an exemption`);
    } else {
      exempt.push({ route: key, reason: route.idorExempt });
      if (!allowlisted.has(key)) {
        if (/:\w/.test(route.path)) badExemptions.push(`${key} — path param on an exempt route`);
        if (route.method !== 'GET') badExemptions.push(`${key} — non-GET exempt route`);
      }
    }
  }
  return {
    uncovered: [...needsFixture].filter((key) => !fixtures.has(key)).sort(),
    unknownFixtures: [...fixtures].filter((key) => !needsFixture.has(key)).sort(),
    exempt: exempt.sort((a, b) => a.route.localeCompare(b.route)),
    badExemptions: badExemptions.sort(),
  };
}

export function formatReport(result: CoverageResult): string {
  const section = (title: string, lines: readonly string[]) =>
    lines.length === 0 ? [] : [title, ...lines.map((line) => `  ${line}`)];
  return [
    ...section(
      'Private routes without an IDOR fixture (test/idor/fixtures.ts) or @IdorExempt(reason):',
      result.uncovered,
    ),
    ...section(
      'Fixtures for routes that do not exist or need none (public/exempt):',
      result.unknownFixtures,
    ),
    ...section(
      'Refused exemptions (fixture needed, or allowlist in test/idor/exemptions.ts):',
      result.badExemptions,
    ),
    ...section(
      'IDOR-exempt routes:',
      result.exempt.map(({ route, reason }) => `${route} — ${reason}`),
    ),
  ].join('\n');
}

/** Substitutes every `:param` of a route path; a missing value is a fixture bug. */
export function fillPath(path: string, params: Readonly<Record<string, string>>): string {
  return path.replace(/:(\w+)\??/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`no value for :${name} in ${path}`);
    return encodeURIComponent(value);
  });
}

const PROBE_ID = '0190a5f0-0000-7000-8000-000000000000';
const paramNames = (path: string) => [...path.matchAll(/:(\w+)/g)].map((m) => m[1] ?? '');

/**
 * Black-box auth probe: every non-@Public, non-@OptionalAuth route must answer a cookie-less request (valid Origin,
 * empty JSON body for mutations, path params = a fixed UUID v7) with 401 UNAUTHENTICATED. Returns the failures.
 */
export async function probeProtection(
  app: INestApplication,
  routes: readonly Route[],
  webOrigin: string,
): Promise<string[]> {
  const failures: string[] = [];
  for (const route of routes) {
    if (route.isPublic || route.isOptional) continue;
    const path = fillPath(
      route.path,
      Object.fromEntries(paramNames(route.path).map((name) => [name, PROBE_ID])),
    );
    const method = route.method === 'ALL' ? 'get' : route.method.toLowerCase();
    let req = request(app.getHttpServer())
      [method as 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'head'](path)
      .set('Origin', webOrigin);
    if (method !== 'get' && method !== 'head' && method !== 'options') req = req.send({});
    const res = await req;
    const code: unknown = (res.body as { code?: unknown } | undefined)?.code;
    if (res.status !== 401 || code !== 'UNAUTHENTICATED') {
      failures.push(`${routeKey(route)} → ${String(res.status)} ${String(code)}`);
    }
  }
  return failures;
}

/** Structural check: global guards run HttpPolicyGuard (CSRF 403 first), thallesp AuthGuard, SessionLifetimeGuard. */
export function globalGuardProblems(guards: readonly CanActivate[]): string[] {
  const types = guards.map((guard) => guard.constructor);
  const order = [
    ['HttpPolicyGuard', types.indexOf(HttpPolicyGuard)],
    ['AuthGuard (@thallesp/nestjs-better-auth)', types.indexOf(AuthGuard)],
    ['SessionLifetimeGuard', types.indexOf(SessionLifetimeGuard)],
  ] as const;
  const missing = order
    .filter(([, at]) => at === -1)
    .map(([name]) => `global ${name} is not registered`);
  if (missing.length > 0) return missing;
  return order.every(([, at], i) => i === 0 || at > (order[i - 1]?.[1] ?? -1))
    ? []
    : [`global guard order must be ${order.map(([name]) => name).join(' → ')}`];
}
