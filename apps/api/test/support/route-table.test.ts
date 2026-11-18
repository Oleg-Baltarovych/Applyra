// Route table from the real composition (11-testing.md §4 p.1): AppModule + a test-only probe controller.
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHttpApp } from './http-app.js';
import { IdorProbeController } from './idor-probe.controller.js';
import { adapterRouteProblems, buildRouteTable } from './route-table.js';
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
        path: '/api/v1/probe/open',
        handler: 'open',
        isPublic: true,
        isOptional: false,
        idorExempt: null,
      },
      {
        ...base,
        method: 'GET',
        path: '/api/v1/probe/:id',
        handler: 'byId',
        isPublic: false,
        isOptional: false,
        idorExempt: null,
      },
      ...['/api/v1/probe/me', '/api/v1/probe/me/alias'].map((path) => ({
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
        path: '/api/v1/probe/optional/list',
        handler: 'maybe',
        isPublic: false,
        isOptional: true,
        idorExempt: null,
      },
    ]);
  });

  it('includes the AppModule routes: health outside the /api/v1 prefix, @Public', () => {
    const health = buildRouteTable(app).filter((r) => r.controller === 'HealthController');
    expect(health.map((r) => [r.method, r.path, r.isPublic])).toEqual(
      expect.arrayContaining([
        ['GET', '/health/live', true],
        ['GET', '/health/ready', true],
      ]),
    );
  });
});

describe('buildRouteTable — global prefix excludes', () => {
  async function probeApp(exclude: string[]): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      controllers: [IdorProbeController],
    }).compile();
    const probe = moduleRef.createNestApplication();
    probe.setGlobalPrefix('api/v1', { exclude });
    await probe.init();
    return probe;
  }

  it('leaves an excluded static path unprefixed', async () => {
    const probe = await probeApp(['probe/open', '/probe/me']);
    try {
      expect(buildRouteTable(probe).map((r) => `${r.method} ${r.path}`)).toEqual([
        'GET /probe/open',
        'GET /api/v1/probe/:id',
        'POST /probe/me',
        'POST /api/v1/probe/me/alias',
        'GET /api/v1/probe/optional/list',
      ]);
      // Cross-check against the paths Express actually serves.
      expect(adapterRouteProblems(probe, buildRouteTable(probe))).toEqual([]);
    } finally {
      await probe.close();
    }
  });

  it('refuses an exclude with a parameter or wildcard it cannot model', async () => {
    const probe = await probeApp(['probe/:id']);
    try {
      expect(() => buildRouteTable(probe)).toThrow(/probe\/:id is not modelled/);
    } finally {
      await probe.close();
    }
  });
});
