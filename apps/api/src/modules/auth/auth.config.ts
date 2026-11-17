import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError } from 'better-auth/api';
import { newId } from '../../platform/ids/uuid-v7.js';
import { isSignupAllowed } from './signup-allowlist.domain.js';

// TODO(M0-09): take the code from the contracts `ErrorCode` enum once it exists.
export const SIGNUP_CLOSED = 'SIGNUP_CLOSED';

export interface AuthConfig {
  /** AUTH_SIGNUP_ALLOWLIST (FR-AUTH-02). Empty = nobody can sign up. */
  signupAllowlist: readonly string[];
  /** Better Auth store: Prisma adapter (auth.options.ts); the memory adapter in in-process tests. */
  database: BetterAuthOptions['database'];
  /** ≥ 32 chars. Required: without it Better Auth would fall back to env or a public default secret. */
  secret: string;
  /** Public origin of the API (OAuth callbacks, cookie scope). */
  baseURL: string;
  /** Origins allowed to call /api/auth/* (the SPA origin). */
  trustedOrigins: readonly string[];
  /** R0 ships Google OAuth only (M0-10); tests enable email + password to drive sign-up without an OAuth mock. */
  emailAndPassword?: BetterAuthOptions['emailAndPassword'];
}

const MIN_SECRET_LENGTH = 32;

/** Pure factory: same config → equivalent instance; config comes from DI (AuthModule.forRootAsync). */
export function createAuth(config: AuthConfig) {
  if (!config.secret) throw new Error('Auth secret is required (BETTER_AUTH_SECRET)');
  if (config.secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`Auth secret must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  return betterAuth({
    database: config.database,
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: [...config.trustedOrigins],
    emailAndPassword: config.emailAndPassword,
    advanced: {
      // UUID v7 for user/session/account/verification so auth rows join domain tables by uuid FK.
      database: { generateId: () => newId() },
    },
    user: {
      additionalFields: {
        // input: false — never settable from sign-up/update-user request bodies.
        role: { type: ['USER', 'ADMIN'], required: false, defaultValue: 'USER', input: false },
        deletedAt: { type: 'date', required: false, input: false }, // soft delete (05 §2.3, 09)
        demoExpiresAt: { type: 'date', required: false, input: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Runs only when a new user row is created, so existing users sign in without the check.
          // Must throw APIError with a code: OAuth callback redirects to errorURL?error=<code>,
          // programmatic calls get 403 { code }; returning `false` degrades to "unable_to_create_user".
          before: async (user) => {
            if (!isSignupAllowed(user.email, config.signupAllowlist)) {
              throw new APIError('FORBIDDEN', {
                code: SIGNUP_CLOSED,
                message: 'Sign-up is closed for this email',
              });
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
