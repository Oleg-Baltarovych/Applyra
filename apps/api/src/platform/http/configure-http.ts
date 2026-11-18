import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '../config/index.js';
import { authBodyLimit } from './auth-body-limit.js';
import { authRequestPolicy } from './auth-request-policy.js';
import { requestIdMiddleware } from './request-id.middleware.js';

/** Every controller route lives under it (06-api.md §1), except the paths in API_PREFIX_EXCLUDE. */
export const API_PREFIX = 'api/v1';

/**
 * Outside the prefix: probes for Docker/Caddy (12-infra-ops.md: `/health/*` is not part of the versioned API) and the
 * Better Auth mount. `setGlobalPrefix` REPLACES the exclude list, including the `/api/auth` entries thallesp adds in its
 * module constructor (before configureHttp runs), so they are restated here.
 */
export const API_PREFIX_EXCLUDE: readonly string[] = [
  'health/live',
  'health/ready',
  'api/auth',
  'api/auth/*path',
];

function noStore(_req: Request, res: Response, next: NextFunction): void {
  // The API serves nothing publicly cacheable (09-security-privacy.md §9.2).
  res.setHeader('Cache-Control', 'no-store');
  next();
}

/**
 * The single place for app-level HTTP policy (main.ts and every Supertest app). `app.use` runs before module
 * middleware, so all of it also covers /api/auth/*. Call before `app.init()` / `app.listen()`.
 */
export function configureHttp(app: INestApplication, config: ConfigService): void {
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_PREFIX, { exclude: [...API_PREFIX_EXCLUDE] });
  // req.ip: socket address, or the X-Forwarded-For entry added by the trusted proxy hops (0 = none).
  const hops = config.get('TRUST_PROXY_HOPS');
  (app.getHttpAdapter().getInstance() as { set(key: string, value: unknown): void }).set(
    'trust proxy',
    hops === 0 ? false : hops,
  );
  app.use(requestIdMiddleware);
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-site' },
      strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
    }),
  );
  app.use(noStore);
  app.enableCors({
    origin: [config.get('WEB_ORIGIN')],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Idempotency-Key'],
    maxAge: 600,
  });
  app.use(authBodyLimit);
  app.use(authRequestPolicy(config.get('WEB_ORIGIN')));
}
