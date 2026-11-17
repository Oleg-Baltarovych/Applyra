// Production auth config built from the validated environment (AuthModule.forRootAsync seam).
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { Redis } from 'ioredis';
import { ConfigService } from '../../platform/config/index.js';
import { type AppPrisma, PRISMA } from '../../platform/prisma/di.js';
import { REDIS } from '../../platform/redis/index.js';
import { createAuthRateLimitStore } from './auth-rate-limit.store.js';
import type { AuthConfig } from './auth.config.js';
import type { AuthModuleAsyncOptions } from './auth.module.js';

export const authOptionsFromConfig: AuthModuleAsyncOptions = {
  inject: [ConfigService, PRISMA, REDIS],
  useFactory: (config: ConfigService, prisma: AppPrisma, redis: Redis): AuthConfig => {
    // env.schema enforces both-or-neither; Google is registered only when both are set (ADR 022).
    const clientId = config.get('GOOGLE_CLIENT_ID');
    const clientSecret = config.get('GOOGLE_CLIENT_SECRET');
    return {
      // The extended app client (applyra_app). Auth tables are not guarded (UNGUARDED_OWNED_MODELS / no owner
      // column), so Better Auth's lookups by token/id/email pass the user-scope extension.
      // transaction: true — multi-step writes (sign-up: user + account) run in one interactive transaction
      // (supported by @better-auth/prisma-adapter 1.7.25: `prisma.$transaction` around a tx-bound adapter).
      database: prismaAdapter(prisma, { provider: 'postgresql', transaction: true }),
      signupAllowlist: config.get('AUTH_SIGNUP_ALLOWLIST'),
      secret: config.get('BETTER_AUTH_SECRET'),
      baseURL: config.get('BETTER_AUTH_URL'),
      webOrigin: config.get('WEB_ORIGIN'),
      ...(clientId && clientSecret ? { google: { clientId, clientSecret } } : {}),
      rateLimitStorage: createAuthRateLimitStore(redis),
    };
  },
};
