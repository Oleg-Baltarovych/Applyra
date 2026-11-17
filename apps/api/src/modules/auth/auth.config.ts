import { betterAuth, type BetterAuthOptions, type BetterAuthRateLimitStorage } from 'better-auth';
import { APIError } from 'better-auth/api';
import { CLIENT_IP_HEADER } from '../../platform/http/index.js';
import { newId } from '../../platform/ids/uuid-v7.js';
import { capSessionExpiry } from './session-lifetime.domain.js';
import { isSignupAllowed } from './signup-allowlist.domain.js';

// TODO(M0-09): take the code from the contracts `ErrorCode` enum once it exists.
export const SIGNUP_CLOSED = 'SIGNUP_CLOSED';

/** Cookie names (ADR 008, 09 §3): `__Host-` = Secure, Path=/, no Domain → bound to the API host only. */
export const COOKIE_PREFIX = '__Host-applyra';
export const SESSION_COOKIE = `${COOKIE_PREFIX}.session`;

const MINUTE_S = 60;
const DAY_S = 24 * 60 * MINUTE_S;

export interface GoogleCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface AuthConfig {
  /** AUTH_SIGNUP_ALLOWLIST (FR-AUTH-02). Empty = nobody can sign up. */
  signupAllowlist: readonly string[];
  /** Better Auth store: Prisma adapter (auth.options.ts); the memory adapter in in-process tests. */
  database: BetterAuthOptions['database'];
  /** ≥ 32 chars. Required: without it Better Auth would fall back to env or a public default secret. */
  secret: string;
  /** Public origin of the API (OAuth callbacks, cookie scope). */
  baseURL: string;
  /** WEB_ORIGIN: the only origin trusted by /api/auth/* (Origin header, callbackURL, errorCallbackURL). */
  webOrigin: string;
  /** Google OAuth (FR-AUTH-01); absent → no social provider, the API still boots (ADR 022). */
  google?: GoogleCredentials;
  /** Rate-limit counters (Redis in production: auth-rate-limit.store.ts). */
  rateLimitStorage: BetterAuthRateLimitStorage;
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
    trustedOrigins: [config.webOrigin],
    emailAndPassword: config.emailAndPassword,
    // The Google provider always sends a PKCE challenge (S256); scopes openid email profile.
    socialProviders: config.google
      ? { google: { clientId: config.google.clientId, clientSecret: config.google.clientSecret } }
      : {},
    // 09 §4.2: sliding 7 d (refreshed at most once a day), fresh for sensitive actions 10 min (M3-09). The absolute
    // 30 d cap is SessionLifetimeGuard. No cookieCache (default off): revocation and sign-out apply immediately.
    session: { expiresIn: 7 * DAY_S, updateAge: DAY_S, freshAge: 10 * MINUTE_S },
    account: {
      // 09 §4.2: OAuth access/refresh/id tokens encrypted at rest with a key derived from BETTER_AUTH_SECRET
      // (changing the secret makes stored tokens unreadable, like it invalidates sessions).
      encryptOAuthTokens: true,
      // 09 §4.4 (S-07): Google links to an existing user only if Google verified the email AND the local email is
      // verified (no trusted providers); otherwise the callback redirects with ?error=account_not_linked.
      accountLinking: { enabled: true, trustedProviders: [], allowDifferentEmails: false },
    },
    // OAuth errors raised before the SPA's errorCallbackURL is known (bad or missing state) land on the SPA too,
    // never on Better Auth's own /error page.
    onAPIError: { errorURL: `${config.webOrigin}/sign-in` },
    rateLimit: {
      // Better Auth enables it only in production by default; on everywhere so tests run the real limiter.
      enabled: true,
      window: MINUTE_S,
      max: 100,
      // R0 values (decision 2026-11-17); the 09 §4.3 password rules arrive with R1. These override the built-in
      // `/sign-in*` rule (3 per 10 s).
      customRules: {
        '/sign-in/social': { window: MINUTE_S, max: 10 },
        '/callback/*': { window: MINUTE_S, max: 20 },
      },
      customStorage: config.rateLimitStorage,
    },
    advanced: {
      // UUID v7 for user/session/account/verification so auth rows join domain tables by uuid FK.
      database: { generateId: () => newId() },
      // Set from req.ip by platform/http authRequestPolicy (TRUST_PROXY_HOPS); X-Forwarded-For is never read directly.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
      // Better Auth defaults this to true under NODE_ENV=test; the Origin/callbackURL checks run in every env.
      disableOriginCheck: false,
      // MUST stay false: Better Auth only knows the `__Secure-` auto-prefix and would prepend it to our names
      // (`__Secure-__Host-...`). `__Host-` comes from the names below; Secure is forced by defaultCookieAttributes,
      // also over http://localhost (a secure context in Chrome/Firefox, not in Safari).
      useSecureCookies: false,
      cookiePrefix: COOKIE_PREFIX, // state, dont_remember... → `__Host-applyra.<name>`
      cookies: { session_token: { name: SESSION_COOKIE } },
      // Defaults already give HttpOnly, SameSite=Lax, Path=/; crossSubDomainCookies off → no Domain.
      defaultCookieAttributes: { secure: true },
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
      session: {
        update: {
          // Absolute 30 d cap inside Better Auth (09 §4.2): a sliding refresh never extends expiresAt past
          // createdAt + 30 d, so Better Auth itself (get-session and every /api/auth endpoint) stops honouring an
          // over-age session. Create needs no clamp (now + 7 d). get-session puts the session it refreshes into
          // ctx.context.session before updating; SessionLifetimeGuard stays as defence in depth on Nest routes.
          before: async (data, ctx) => {
            const createdAt = ctx?.context.session?.session.createdAt;
            const requested = data.expiresAt;
            if (!createdAt || !(requested instanceof Date)) return;
            return {
              data: { ...data, expiresAt: capSessionExpiry(new Date(createdAt), requested) },
            };
          },
        },
      },
      user: {
        create: {
          // Runs only when a new user row is created, so existing users sign in without the check.
          // Must throw APIError with a code: OAuth callback redirects to errorURL?error=<code>,
          // programmatic calls get 403 { code }; returning `false` degrades to "unable_to_create_user".
          before: async (user) => {
            const candidate = { email: user.email, emailVerified: user.emailVerified };
            if (!isSignupAllowed(candidate, config.signupAllowlist)) {
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
