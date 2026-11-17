// Process environment contract of the api (docs/spec/12-infra-ops.md §7). Parsed once at bootstrap by
// load-env.ts; everything else reads typed values through ConfigService. Variable list: /.env.example.
import { z } from 'zod';

const MIN_SECRET_LENGTH = 32;

/** Zod error map: "is required" for a missing value, `invalid` otherwise. Never includes the input. */
const reason =
  (invalid?: string) =>
  (issue: { input: unknown }): string | undefined =>
    issue.input === undefined ? 'is required' : invalid;

/** An empty value counts as missing: `KEY=` in an env file must not satisfy a required variable. */
const nonEmpty = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema);

const url = (protocol: RegExp, hint: string) =>
  nonEmpty(z.url({ protocol, error: reason(`must be a ${hint} URL`) }));

const port = nonEmpty(
  z
    .string({ error: reason() })
    .regex(/^\d+$/, { error: 'must be a port number' })
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(1, { error: 'must be 1-65535' })
        .max(65535, { error: 'must be 1-65535' }),
    ),
);

/** Reverse proxies in front of the api whose X-Forwarded-For entry is trusted (Express `trust proxy`). Unset = 0. */
const proxyHops = nonEmpty(
  z
    .string({ error: reason() })
    .regex(/^\d+$/, { error: 'must be a whole number 0-10' })
    .transform(Number)
    .pipe(z.number().int().max(10, { error: 'must be a whole number 0-10' }))
    .optional(),
).transform((value) => value ?? 0);

/** Optional string: an empty value means unset. */
const optionalString = nonEmpty(z.string().optional());

const origin = url(/^https?$/, 'http(s)').refine(
  (value) => URL.canParse(value) && new URL(value).origin === value,
  {
    error: 'must be an origin: scheme://host[:port], no path or trailing slash',
  },
);

/**
 * Comma-separated emails → trimmed list without empty items; frozen (z.readonly() is shallow).
 * Empty string = sign-up closed. Case-folding happens in one place only: isSignupAllowed
 * (modules/auth/signup-allowlist.domain.ts).
 */
const emailList = z
  .string({ error: reason() })
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== ''),
  )
  .pipe(z.array(z.email({ error: 'must be a comma-separated list of emails' })))
  .transform((list): readonly string[] => Object.freeze(list));

export const envSchema = z
  .object({
    NODE_ENV: nonEmpty(
      z.enum(['development', 'test', 'production'], {
        error: reason('must be development, test or production'),
      }),
    ),
    PORT: port,
    /**
     * 0 = the client IP is the socket address (direct exposure, local dev); behind Caddy (M0-14) = 1. Feeds req.ip →
     * the Better Auth rate-limit key (09 §4.3); X-Forwarded-For from the client is never trusted beyond these hops.
     */
    TRUST_PROXY_HOPS: proxyHops,
    /** Runtime role `applyra_app` (12 §4). Migrations use MAINTENANCE_DATABASE_URL via the Prisma CLI, not the api. */
    DATABASE_URL: url(/^postgres(ql)?$/, 'postgresql://'),
    REDIS_URL: url(/^rediss?$/, 'redis:// or rediss://'),
    BETTER_AUTH_SECRET: nonEmpty(
      z
        .string({ error: reason() })
        .min(MIN_SECRET_LENGTH, { error: `must be at least ${MIN_SECRET_LENGTH} characters` }),
    ),
    /**
     * Better Auth reads BETTER_AUTH_SECRETS from the process env itself and prefers it over the configured
     * secret (M0-02). Rotation is not adopted, so its mere presence is a configuration error.
     */
    BETTER_AUTH_SECRETS: z
      .undefined({
        error:
          'is not supported: unset it and use BETTER_AUTH_SECRET (secret rotation is not adopted)',
      })
      .optional(),
    /** Public origin of the API: OAuth callbacks, cookie scope. */
    BETTER_AUTH_URL: origin,
    /** SPA origin → Better Auth trustedOrigins (and the CORS allowlist from M0-09). */
    WEB_ORIGIN: origin,
    /** FR-AUTH-02: who may sign up. Must be present; may be empty (fails closed). */
    AUTH_SIGNUP_ALLOWLIST: emailList,
    // Optional integrations (12 §7): `cp .env.example .env` must be enough to start. Empty = unset.
    /** Google OAuth client (M0-10 registers the provider only when both are set; one alone → error). */
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    /** Sentry (M0-15); unset = disabled (local default, 12 §1). */
    SENTRY_DSN: nonEmpty(
      z.url({ protocol: /^https?$/, error: 'must be an http(s) URL' }).optional(),
    ),
    /** Ephemeral demo users (ADR 014; endpoint in M2-12). Strict `true`/`false`; unset = false. */
    DEMO_ENABLED: nonEmpty(
      z.enum(['true', 'false'], { error: 'must be true or false' }).optional(),
    ).transform((value) => value === 'true'),
  })
  .readonly();

export type Env = z.output<typeof envSchema>;

const PLACEHOLDER_MARKER = 'local-dev-only';
/** Values that must never carry the .env.example placeholders in production. */
const NO_PLACEHOLDER_KEYS = ['BETTER_AUTH_SECRET', 'DATABASE_URL', 'REDIS_URL'] as const;
const HTTPS_KEYS = ['BETTER_AUTH_URL', 'WEB_ORIGIN'] as const;

const isSet = (value: string | undefined): boolean => value !== undefined && value !== '';

/**
 * Cross-field and production-only guards on the raw values, so they are reported together with schema
 * errors (an object-level refine would run only once every field is valid). Skips keys that already failed.
 */
function crossFieldIssues(
  source: Readonly<Record<string, string | undefined>>,
  failed: ReadonlySet<string>,
): string[] {
  const issues: string[] = [];
  const googleId = isSet(source.GOOGLE_CLIENT_ID);
  const googleSecret = isSet(source.GOOGLE_CLIENT_SECRET);
  if (googleId !== googleSecret) {
    const missing = googleId ? 'GOOGLE_CLIENT_SECRET' : 'GOOGLE_CLIENT_ID';
    issues.push(
      `${missing}: is required when ${googleId ? 'GOOGLE_CLIENT_ID' : 'GOOGLE_CLIENT_SECRET'} is set (set both or neither)`,
    );
  }
  if (source.NODE_ENV !== 'production') return issues;
  for (const key of NO_PLACEHOLDER_KEYS) {
    if (!failed.has(key) && source[key]?.includes(PLACEHOLDER_MARKER)) {
      issues.push(`${key}: must not be a ${PLACEHOLDER_MARKER} placeholder in production`);
    }
  }
  for (const key of HTTPS_KEYS) {
    const value = source[key];
    if (!failed.has(key) && value !== undefined && !value.startsWith('https://')) {
      issues.push(`${key}: must use https in production`);
    }
  }
  return issues;
}

export type ParseEnvResult = { success: true; env: Env } | { success: false; errors: string[] };

/**
 * Validates the whole environment and returns every problem at once as `KEY: reason` lines.
 * Messages come from the schema only — input values (secrets, DSNs with passwords) are never echoed.
 */
export function parseEnv(source: Readonly<Record<string, string | undefined>>): ParseEnvResult {
  const result = envSchema.safeParse(source);
  // One reason per variable (the first); top-level key only — an index into a list
  // (AUTH_SIGNUP_ALLOWLIST.1) is not a variable name.
  const schemaErrors = new Map<string, string>();
  for (const issue of result.error?.issues ?? []) {
    const key = String(issue.path[0]);
    if (!schemaErrors.has(key)) schemaErrors.set(key, issue.message);
  }
  const errors = [
    ...[...schemaErrors].map(([key, message]) => `${key}: ${message}`),
    ...crossFieldIssues(source, new Set(schemaErrors.keys())),
  ];
  if (result.success && errors.length === 0) return { success: true, env: result.data };
  return { success: false, errors };
}
