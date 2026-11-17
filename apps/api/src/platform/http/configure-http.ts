import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '../config/index.js';
import { authBodyLimit } from './auth-body-limit.js';
import { requestIdMiddleware } from './request-id.middleware.js';

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
}
