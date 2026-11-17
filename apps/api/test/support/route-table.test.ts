// Route table from the real composition (11-testing.md §4 p.1): AppModule + a test-only probe controller.
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHttpApp } from './http-app.js';
import { IdorProbeController } from './idor-probe.controller.js';
import { buildRouteTable } from './route-table.js';
import { testEnv } from './test-env.js';

let app: INestApplication;

beforeAll(async () => {
  app = await createHttpApp({ env: testEnv(), controllers: [IdorProbeController] });
});

afterAll(async () => {
  await app.close();
});

describe('buildRouteTable', () => {
  it('lists every handler with joined path and auth / exemption flags', () => {
    const probe = buildRouteTable(app).filter((r) => r.controller === 'IdorProbeController');
    const base = { controller: 'IdorProbeController', roles: [] };
    expect(probe).toEqual([
      {
        ...base,
        method: 'GET',
        path: '/probe/open',
        handler: 'open',
        isPublic: true,
        isOptional: false,
        idorExempt: null,
      },
      {
        ...base,
        method: 'GET',
        path: '/probe/:id',
        handler: 'byId',
        isPublic: false,
        isOptional: false,
        idorExempt: null,
      },
      ...['/probe/me', '/probe/me/alias'].map((path) => ({
        ...base,
        method: 'POST',
        path,
        handler: 'me',
        isPublic: false,
        isOptional: false,
        idorExempt: 'probe: own data only',
      })),
      {
        ...base,
        method: 'GET',
        path: '/probe/optional/list',
        handler: 'maybe',
        isPublic: false,
        isOptional: true,
        idorExempt: null,
      },
    ]);
  });

  it('includes the AppModule routes (health, @Public)', () => {
    const health = buildRouteTable(app).filter((r) => r.controller === 'HealthController');
    expect(health.map((r) => [r.method, r.path, r.isPublic])).toEqual(
      expect.arrayContaining([
        ['GET', '/health/live', true],
        ['GET', '/health/ready', true],
      ]),
    );
  });
});
