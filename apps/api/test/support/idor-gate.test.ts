import { describe, expect, it } from 'vitest';
import { checkCoverage, fillPath, formatReport, type Route, routeKey } from './idor-gate.js';

const route = (over: Partial<Route> & Pick<Route, 'method' | 'path'>): Route => ({
  isPublic: false,
  isOptional: false,
  roles: [],
  idorExempt: null,
  controller: 'C',
  handler: 'h',
  ...over,
});

describe('checkCoverage (11 §4 p.4)', () => {
  it('lists a private route without fixture or exemption as uncovered', () => {
    const result = checkCoverage([route({ method: 'GET', path: '/jobs/:id' })], []);
    expect(result.uncovered).toEqual(['GET /jobs/:id']);
  });

  it('a fixture covers its route', () => {
    const result = checkCoverage([route({ method: 'GET', path: '/jobs/:id' })], ['GET /jobs/:id']);
    expect(result).toEqual({ uncovered: [], unknownFixtures: [], exempt: [], badExemptions: [] });
  });

  it('skips @Public routes', () => {
    const result = checkCoverage([route({ method: 'GET', path: '/health', isPublic: true })], []);
    expect(result.uncovered).toEqual([]);
  });

  it('counts @OptionalAuth routes as private', () => {
    const result = checkCoverage([route({ method: 'GET', path: '/feed', isOptional: true })], []);
    expect(result.uncovered).toEqual(['GET /feed']);
  });

  it('an exemption covers the route and is reported with its reason', () => {
    const result = checkCoverage(
      [route({ method: 'GET', path: '/me', idorExempt: 'own data only' })],
      [],
    );
    expect(result.uncovered).toEqual([]);
    expect(result.exempt).toEqual([{ route: 'GET /me', reason: 'own data only' }]);
  });

  it.each([
    ['a non-existent route', []],
    ['a public route', [route({ method: 'GET', path: '/gone', isPublic: true })]],
    ['an exempt route', [route({ method: 'GET', path: '/gone', idorExempt: 'x' })]],
  ])('flags a fixture for %s', (_label, routes) => {
    expect(checkCoverage(routes, ['GET /gone']).unknownFixtures).toEqual(['GET /gone']);
  });

  it.each([
    [
      'a :param in the path',
      route({ method: 'GET', path: '/jobs/:id', idorExempt: 'x' }),
      'path param',
    ],
    [
      'a non-GET method',
      route({ method: 'PATCH', path: '/me/settings', idorExempt: 'x' }),
      'non-GET',
    ],
  ])('rejects an exemption with %s unless allowlisted', (_label, exempted, problem) => {
    expect(checkCoverage([exempted], []).badExemptions).toEqual([expect.stringContaining(problem)]);
    expect(checkCoverage([exempted], [], [routeKey(exempted)]).badExemptions).toEqual([]);
  });

  it('a @Roles route needs a fixture: an exemption does not cover it', () => {
    const admin = route({ method: 'GET', path: '/admin/users', roles: ['ADMIN'], idorExempt: 'x' });
    const result = checkCoverage([admin], [], ['GET /admin/users']);
    expect(result.uncovered).toEqual(['GET /admin/users']);
    expect(result.badExemptions).toEqual([expect.stringContaining('@Roles')]);
    expect(result.exempt).toEqual([]);
    expect(checkCoverage([admin], ['GET /admin/users']).uncovered).toEqual([]);
  });

  it('formatReport names uncovered routes, unknown fixtures and exemptions', () => {
    const report = formatReport({
      uncovered: ['GET /jobs/:id'],
      unknownFixtures: ['DELETE /gone'],
      exempt: [{ route: 'GET /me', reason: 'own data only' }],
      badExemptions: ['PATCH /me/settings — non-GET'],
    });
    expect(report).toContain('PATCH /me/settings — non-GET');
    expect(report).toContain('GET /jobs/:id');
    expect(report).toContain('DELETE /gone');
    expect(report).toContain('GET /me — own data only');
  });
});

describe('fillPath', () => {
  it('replaces every :param', () => {
    expect(fillPath('/jobs/:id/notes/:noteId', { id: 'a', noteId: 'b' })).toBe('/jobs/a/notes/b');
  });

  it('throws on a missing param', () => {
    expect(() => fillPath('/jobs/:id', {})).toThrow(/:id/);
  });
});
