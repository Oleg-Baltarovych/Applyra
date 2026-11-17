// Google OAuth for HTTP tests (M0-10): answers Google's token endpoint by `code` and lets every other request through.
// Better Auth's Google provider decodes (does not verify) an id_token received from the token endpoint over TLS, so
// an unsigned JWT is enough. better-fetch resolves `globalThis.fetch` per call, so a spy intercepts it.
import { createHash, randomInt } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { vi } from 'vitest';

export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const TEST_GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
export const TEST_GOOGLE_CLIENT_SECRET = 'test-only-google-client-secret';
/** BETTER_AUTH_URL of testEnv() + Better Auth's Google callback path; the mock rejects any other redirect_uri. */
export const TEST_GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/auth/callback/google';

export interface GoogleIdentity {
  readonly sub: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name: string;
}

/** Codes the mock knows. A and B are on the default test allowlist (test-env.ts). */
export const GOOGLE_IDENTITIES = {
  'code-A': {
    sub: 'google-sub-a',
    email: 'user-a@example.com',
    emailVerified: true,
    name: 'User A',
  },
  'code-B': {
    sub: 'google-sub-b',
    email: 'user-b@example.com',
    emailVerified: true,
    name: 'User B',
  },
  'code-denied': {
    sub: 'google-sub-denied',
    email: 'stranger@example.com',
    emailVerified: true,
    name: 'Stranger',
  },
  // Allowlisted address, but Google did not verify it.
  'code-unverified': {
    sub: 'google-sub-unverified',
    email: 'user-c@example.com',
    emailVerified: false,
    name: 'Unverified',
  },
  // Another Google account (new sub) claiming user A's address without Google verifying it (09 §4.4 linking).
  'code-A-unverified-other': {
    sub: 'google-sub-a-other',
    email: 'user-a@example.com',
    emailVerified: false,
    name: 'Not A',
  },
} as const satisfies Record<string, GoogleIdentity>;
export type GoogleCode = keyof typeof GOOGLE_IDENTITIES;

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

function idToken(identity: GoogleIdentity): string {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: 'https://accounts.google.com',
    aud: TEST_GOOGLE_CLIENT_ID,
    sub: identity.sub,
    email: identity.email,
    email_verified: identity.emailVerified,
    name: identity.name,
    iat: now,
    exp: now + 3600,
  };
  return `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url(claims)}.signature`;
}

const urlOf = (input: Parameters<typeof fetch>[0]): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

const formOf = (body: RequestInit['body']): URLSearchParams =>
  body instanceof URLSearchParams
    ? body
    : new URLSearchParams(typeof body === 'string' ? body : '');

// code → PKCE code_challenges issued for it (googleSignIn registers the authorize URL's challenge, one-time use).
const challenges = new Map<string, Set<string>>();
const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');
const invalidGrant = (description: string) =>
  Promise.resolve(
    Response.json({ error: 'invalid_grant', error_description: description }, { status: 400 }),
  );

/** Remember the PKCE challenge Google "received" for `code` (what the authorize redirect carried). */
export function expectGoogleCode(code: string, codeChallenge: string): void {
  const set = challenges.get(code) ?? new Set<string>();
  set.add(codeChallenge);
  challenges.set(code, set);
}

/**
 * Installs the fetch spy (idempotent per test file; Vitest isolates files). Like Google, the token endpoint rejects a
 * request without grant_type=authorization_code, the registered redirect_uri, or a code_verifier matching the
 * code_challenge of that authorization.
 */
export function installGoogleMock(): void {
  if (vi.isMockFunction(globalThis.fetch)) return;
  const realFetch = globalThis.fetch.bind(globalThis);
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    if (urlOf(input) !== GOOGLE_TOKEN_ENDPOINT) return realFetch(input, init);
    const form = formOf(init?.body);
    const code = form.get('code') ?? '';
    const identity: GoogleIdentity | undefined = (
      GOOGLE_IDENTITIES as Record<string, GoogleIdentity>
    )[code];
    if (!identity) return invalidGrant('unknown code');
    if (form.get('grant_type') !== 'authorization_code') return invalidGrant('grant_type');
    if (form.get('redirect_uri') !== TEST_GOOGLE_REDIRECT_URI) return invalidGrant('redirect_uri');
    const challenge = s256(form.get('code_verifier') ?? '');
    if (!challenges.get(code)?.delete(challenge)) return invalidGrant('code_verifier');
    return Promise.resolve(
      Response.json({
        access_token: `access-${code}`,
        id_token: idToken(identity),
        expires_in: 3599,
        token_type: 'Bearer',
        scope: 'openid email profile',
      }),
    );
  });
}

/** `name=value` of every Set-Cookie line (attributes dropped), keyed by name. */
export function cookiesOf(res: request.Response): Map<string, { pair: string; raw: string }> {
  const lines = res.get('Set-Cookie') ?? [];
  const cookies = new Map<string, { pair: string; raw: string }>();
  for (const raw of lines) {
    const pair = raw.split(';', 1)[0] ?? '';
    cookies.set(pair.slice(0, pair.indexOf('=')), { pair, raw });
  }
  return cookies;
}

// Random 10.x.y.z per call: files of one run share Valkey and the counters outlive a file (collision ~1 in 16M).
/** A distinct client IP per call, so one test never spends another test's rate-limit budget. */
export function nextTestIp(): string {
  return `10.${String(randomInt(256))}.${String(randomInt(256))}.${String(randomInt(256))}`;
}

export interface GoogleFlowOptions {
  readonly webOrigin: string;
  readonly callbackURL?: string;
  readonly errorCallbackURL?: string;
  readonly ip?: string;
}

export interface GoogleFlowResult {
  readonly start: request.Response;
  /** The callback response (302), or undefined if sign-in/social did not return an authorize URL. */
  readonly callback: request.Response | undefined;
  readonly authorizeUrl: URL | undefined;
}

export interface StartedGoogleSignIn {
  readonly start: request.Response;
  readonly authorizeUrl: URL | undefined;
  readonly state: string;
  /** The `Cookie` header value carrying the signed state cookie(s) sign-in/social set. */
  readonly stateCookie: string;
}

/** POST sign-in/social from the SPA origin (step 1 of the browser flow). */
export async function startGoogleSignIn(
  app: INestApplication,
  {
    webOrigin,
    callbackURL = `${webOrigin}/`,
    errorCallbackURL,
    ip = nextTestIp(),
  }: GoogleFlowOptions,
): Promise<StartedGoogleSignIn> {
  installGoogleMock();
  const start = await request(app.getHttpServer())
    .post('/api/auth/sign-in/social')
    .set('Origin', webOrigin)
    .set('X-Forwarded-For', ip)
    .send({ provider: 'google', callbackURL, ...(errorCallbackURL ? { errorCallbackURL } : {}) });
  const url: unknown = start.body?.url;
  const authorizeUrl = start.status === 200 && typeof url === 'string' ? new URL(url) : undefined;
  return {
    start,
    authorizeUrl,
    state: authorizeUrl?.searchParams.get('state') ?? '',
    stateCookie: [...cookiesOf(start).values()].map((c) => c.pair).join('; '),
  };
}

/** Google redirecting the browser back (step 2): GET /api/auth/callback/google?code&state with the given cookies. */
export function googleCallback(
  app: INestApplication,
  {
    code,
    state,
    cookie,
    ip = nextTestIp(),
  }: { code: string; state: string; cookie: string; ip?: string },
): Promise<request.Response> {
  return request(app.getHttpServer())
    .get('/api/auth/callback/google')
    .query({ code, state })
    .set('Cookie', cookie)
    .set('X-Forwarded-For', ip);
}

/**
 * The browser's view of a Google sign-in: sign-in/social, Google "authorizes" `code` for that PKCE challenge, then
 * the callback with the returned state + the state cookie (passed by hand: superagent does not replay Secure
 * cookies over http).
 */
export async function googleSignIn(
  app: INestApplication,
  code: GoogleCode | string,
  options: GoogleFlowOptions,
): Promise<GoogleFlowResult> {
  const ip = options.ip ?? nextTestIp();
  const started = await startGoogleSignIn(app, { ...options, ip });
  if (!started.authorizeUrl)
    return { start: started.start, callback: undefined, authorizeUrl: undefined };
  expectGoogleCode(code, started.authorizeUrl.searchParams.get('code_challenge') ?? '');
  const callback = await googleCallback(app, {
    code,
    state: started.state,
    cookie: started.stateCookie,
    ip,
  });
  return { start: started.start, callback, authorizeUrl: started.authorizeUrl };
}
