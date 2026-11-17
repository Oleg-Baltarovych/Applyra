// Production auth config built from the validated environment (AuthModule.forRootAsync seam).
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { ConfigService } from '../../platform/config/index.js';
import { type AppPrisma, PRISMA } from '../../platform/prisma/di.js';
import type { AuthConfig } from './auth.config.js';
import type { AuthModuleAsyncOptions } from './auth.module.js';

export const authOptionsFromConfig: AuthModuleAsyncOptions = {
  inject: [ConfigService, PRISMA],
  useFactory: (config: ConfigService, prisma: AppPrisma): AuthConfig => ({
    // The extended app client (applyra_app). Auth tables are not guarded (UNGUARDED_OWNED_MODELS / no owner
    // column), so Better Auth's lookups by token/id/email pass the user-scope extension.
    // transaction: true — multi-step writes (sign-up: user + account) run in one interactive transaction
    // (supported by @better-auth/prisma-adapter 1.7.25: `prisma.$transaction` around a tx-bound adapter).
    database: prismaAdapter(prisma, { provider: 'postgresql', transaction: true }),
    signupAllowlist: config.get('AUTH_SIGNUP_ALLOWLIST'),
    secret: config.get('BETTER_AUTH_SECRET'),
    baseURL: config.get('BETTER_AUTH_URL'),
    trustedOrigins: [config.get('WEB_ORIGIN')],
  }),
};
