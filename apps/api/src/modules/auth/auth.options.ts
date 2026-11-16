// Production auth config built from the validated environment (AuthModule.forRootAsync seam).
import { memoryAdapter } from 'better-auth/adapters/memory';
import { ConfigService } from '../../platform/config/index.js';
import type { AuthConfig } from './auth.config.js';
import type { AuthModuleAsyncOptions } from './auth.module.js';

export const authOptionsFromConfig: AuthModuleAsyncOptions = {
  inject: [ConfigService],
  useFactory: (config: ConfigService): AuthConfig => ({
    // TODO(M0-08): Prisma adapter (DI-provided PrismaClient via `inject`).
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    signupAllowlist: config.get('AUTH_SIGNUP_ALLOWLIST'),
    secret: config.get('BETTER_AUTH_SECRET'),
    baseURL: config.get('BETTER_AUTH_URL'),
    trustedOrigins: [config.get('WEB_ORIGIN')],
  }),
};
