// HTTP entrypoint. Layout: src/modules/<name>/ (index.ts = public API) · src/platform/ (shared backend code).
import { NestFactory } from '@nestjs/core';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { AppModule } from './app.module.js';

/** Fails fast on a missing variable; never falls back to a default. */
function requireEnv(name: string): string {
  // TODO(M0-04): from Zod config service — interim read of the process environment only.
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

async function bootstrap(): Promise<void> {
  // TODO(M0-04): port, secret, baseURL and origins from the Zod config service.
  const port = Number(requireEnv('PORT'));
  const app = await NestFactory.create(
    AppModule.forRoot({
      auth: {
        useFactory: () => ({
          // TODO(M0-08): Prisma adapter (DI-provided PrismaClient via `inject`).
          database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
          // TODO(M0-04): AUTH_SIGNUP_ALLOWLIST; empty = sign-up closed (fails closed).
          signupAllowlist: [],
          secret: requireEnv('BETTER_AUTH_SECRET'),
          baseURL: requireEnv('BETTER_AUTH_URL'),
          trustedOrigins: [requireEnv('WEB_ORIGIN')],
        }),
      },
    }),
    // Better Auth reads the raw body itself; @thallesp/nestjs-better-auth restores parsers elsewhere.
    { bodyParser: false },
  );
  app.enableShutdownHooks();
  await app.listen(port);
}

void bootstrap();
