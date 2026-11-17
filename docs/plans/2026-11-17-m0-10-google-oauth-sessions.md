# M0-10 · Google OAuth + allowlist + sessions

- Task: `mvp-tasks.md` M0-10 (GitHub #13) · FR-AUTH-01, FR-AUTH-02, FR-AUTH-03, FR-AUTH-04 · Release R0
- Spec: 09 §3 (cookies, Origin), §4.1–4.2 (methods, sessions), 06 §7.1 (auth rows), ADR 007, ADR 008, ADR 022
- Depends: M0-08 (Prisma adapter), M0-09 (error shape, `platform/redis`, OriginGuard for non-auth routes). Branch `feat/M0-10-google-oauth-sessions`.
- Library facts below were read from the installed source: better-auth 1.7.25, @better-auth/core 1.7.25, @thallesp/nestjs-better-auth 2.8.0. "Verify at implementation" marks the ones not yet run.

## Acceptance criteria (testable)
1. With `GOOGLE_CLIENT_ID/SECRET` set, `POST /api/auth/sign-in/social {provider:'google'}` returns the Google authorize URL with `code_challenge_method=S256` + `state`, and sets a signed `__Host-applyra.state` cookie.
2. Callback with a code (mocked token endpoint) for an allowlisted, `email_verified=true` email → user + account + session created, `302` to `callbackURL`, `Set-Cookie: __Host-applyra.session=…; Path=/; HttpOnly; Secure; SameSite=Lax`, no `Domain`, `Max-Age=604800`.
3. Email outside the allowlist, or `email_verified=false` → no user row, `302`, `Location` = `${WEB_ORIGIN}/sign-in?error=SIGNUP_CLOSED…` (`error` param asserted exactly; Better Auth also adds `error_description`).
4. Existing user (email since removed from the allowlist) signs in → 302 to callbackURL, new session. Each sign-in issues a new session token (rotation: token after ≠ token before).
5. Private route without a session → 401 `UNAUTHENTICATED` (06 shape). Session whose `expiresAt` passed (idle 7 d) → 401. Session with `createdAt` > 30 d ago → 401 **and** the session row is deleted, so `get-session` returns `null` afterwards.
6. `POST /api/auth/sign-out` → session row deleted; replaying the old cookie on a private route → 401.
7. `/api/auth/*` POST with foreign `Origin` → 403 from Better Auth (`{ code, message }` body per M0-09); `callbackURL`/`errorCallbackURL` on a foreign origin → rejected (no open redirect).
8. Rate limit on `/api/auth/*` is stored in Redis (keys under the app prefix); exceeding the `sign-in/social` rule → 429 with `X-Retry-After`.
9. Without Google vars the API boots, `/health/live` 200, `sign-in/social {provider:'google'}` → 4xx provider-not-found (exact code: verify at implementation), nothing logged at error.
10. `signInAs(app, 'A'|'B')` returns a working session via the real OAuth path; no direct DB session writes.

## Out of scope
Email + password, verification, reset, enumeration (R1, FR-AUTH-05..07) · account linking policy (R1, FR-AUTH-08; note only) · list/revoke sessions, `@RequireRecentAuth` (M3-09; `freshAge` is only configured here) · web `/sign-in` page (M0-12) · `/me` + `UserSettings` creation (M0-11) · auth metrics (`rate_limit_hits_total`, R1 observability) · trusted-proxy IP config for the hosted Caddy (M0-14).

## Design

### Auth config (`modules/auth/auth.config.ts`, `auth.options.ts`)
`AuthConfig` gains `webOrigin`, `google?: { clientId, clientSecret }`, `rateLimitStorage` (custom store, see below). `createAuth` sets:
- `socialProviders.google` only when `config.google` is present (`auth.options.ts` maps it from env only when both vars are set; env schema already enforces both-or-neither). Google provider requires a PKCE `codeVerifier` (source: throws without one) — PKCE is always on.
- `session: { expiresIn: 7d, updateAge: 1d, freshAge: 10 min }`, `cookieCache` left disabled (default) so revocation is immediate (AC 6).
- Cookies: Better Auth only knows a `__Secure-` auto-prefix (`useSecureCookies`), never `__Host-` (source: `cookies/index.mjs` `createCookieGetter`: name = `secureCookiePrefix + (cookies[x].name ?? cookiePrefix + '.' + x)`). Therefore: `useSecureCookies: false` (**must** stay false, or names become `__Secure-__Host-…`; comment it), `cookiePrefix: '__Host-applyra'` (state, dont_remember etc. → `__Host-applyra.<name>`), `cookies.session_token.name: '__Host-applyra.session'`, `defaultCookieAttributes: { secure: true }`. Defaults already give `httpOnly`, `sameSite: 'lax'`, `path: '/'`; `crossSubDomainCookies` stays off (no `Domain`, required by `__Host-`).
- **Secure always, also over http (decision).** Browsers accept `Secure`/`__Host-` cookies on `http://localhost` (secure context) — Chrome/Firefox; Safari on localhost is not supported for local dev (verify at implementation, note in CONTEXT). One cookie config for every env = no prod/dev drift; ADR 008 unchanged (it already mandates `__Host-`). Tests: superagent's cookie jar will not replay `Secure` cookies over http, so tests pass the cookie explicitly (`signInAs` returns `cookie` and an agent with `Cookie` preset).
- `advanced.disableOriginCheck: false` explicitly: Better Auth defaults it to `true` under `NODE_ENV=test` (`create-context.mjs`), which made trustedOrigins untestable (M0-04 gotcha). Same behaviour in every env now. Existing auth tests may need `Origin: WEB_ORIGIN` added (verify whether Better Auth skips the check for cookie-less requests).
- Redirect targets: SPA passes **absolute** `callbackURL`/`errorCallbackURL` (`${WEB_ORIGIN}/…`) — a relative `/sign-in` resolves on the API origin (verify at implementation; if confirmed, fix 06 §7.1 row and the M0-12 AC wording "`errorCallbackURL: '/sign-in'`"). Better Auth validates both against `trustedOrigins = [WEB_ORIGIN]`. Fallback `onAPIError.errorURL = ${WEB_ORIGIN}/sign-in` so state errors never land on Better Auth's own `/error` page. Callback rejection path (source `api/routes/callback.mjs`): hook throws `APIError` with `body.code` → `redirectOnError(code, message)` → 302 `errorURL?error=SIGNUP_CLOSED&error_description=…`.
- `account.encryptOAuthTokens: true` (09 §4.2; verify the option name in 1.7 types). OAuth state strategy = `database` (default with a DB adapter) + signed state cookie.

### Allowlist hook
`signup-allowlist.domain.ts`: `isSignupAllowed({ email, emailVerified }, allowlist)` → false unless `emailVerified === true` and email in list (case-fold as today). Doing the M0-02 "emailVerified before any non-Google provider" item now: Google sends `email_verified`, cost is zero, R1 cannot forget it. Hook stays in `databaseHooks.user.create.before` (runs on create only → existing users bypass, AC 4).

### Session lifetime guard (absolute 30 d)
Better Auth has only the sliding `expiresIn`; no absolute TTL. Decision: keep the thallesp global `AuthGuard` (it resolves `getSession`, honours `@Public`/`@Optional`/roles and sets `request.session`) and add our `SessionLifetimeGuard` (APP_GUARD in `AuthModule`, after the thallesp guard — registration order verify at implementation; if not guaranteed, set `disableGlobalAuthGuard: true` and register both in order ourselves). It reads `request.session.session`, calls pure `sessionLifetime.domain.ts` `isBeyondAbsoluteLifetime(createdAt, now, 30 d)`; if true → `internalAdapter.deleteSession(token)` and throw `UnauthorizedException` (→ 401 `UNAUTHENTICATED` via M0-09 filter). Why the guard, not a Better Auth hook: spec 09 §4.2 places it there, and Better Auth has no session-read hook; deleting the row makes `get-session` consistent on the next call. Public routes skip it. Clock = injected `Clock` (or `Date.now`) for unit tests.

### Rate limit on Redis
`rateLimit: { enabled: true, window: 60, max: 100, customRules: { '/sign-in/social': { window: 60, max: 10 }, '/callback/*': { window: 60, max: 20 } }, customStorage }` (09 §4.3 values are R1 password rules; these R0 values are mine — see open questions). Use `rateLimit.customStorage` (source: `getRateLimitStorage` prefers it; interface `{ consume(key, rule) → { allowed, retryAfter } }` — verify in `.d.mts`), **not** `secondaryStorage`: a global `secondaryStorage` would also move sessions into Redis. Store `auth-rate-limit.store.ts` on the `REDIS` client: Lua/`MULTI` `INCR` + `EXPIRE … NX` (key `rl:<key>`, under the app key prefix — verify `platform/redis` applies the prefix), `connect()` on first use (lazy, no offline queue). **Redis down → fail-open + warn log** (Google does the credential check in R0; revisit fail-closed with passwords in R1). IP: Better Auth reads `x-forwarded-for` by default; tests set it per request; trusted-proxy setup = M0-14.

### Module wiring
Files: `modules/auth/{auth.config.ts, auth.options.ts, auth.module.ts, signup-allowlist.domain.ts, session-lifetime.domain.ts, session-lifetime.guard.ts, auth-rate-limit.store.ts}`. `auth.options.ts` injects `REDIS` (check boundaries rule allows `platform/redis` index from modules). No DB migration (all auth tables exist since M0-08). No contracts change (`UNAUTHENTICATED` exists).

## Security notes
- Open redirect: only via trustedOrigins validation (AC 7 test with `https://evil.example`).
- Never log OAuth `code`, tokens, cookies (M0-09 redaction covers `oauth.code`, cookie headers — re-assert with one log capture in the flow test).
- `id_token` is decoded, not verified, by Better Auth's Google provider when it comes from the token endpoint over TLS (source `google.mjs` `getUserInfo` → `decodeJwt`) — acceptable per OIDC (direct back-channel); tests rely on it.
- Never copy test-only `emailAndPassword` into real config (unchanged).

## Test approach
- Google mock (`test/support/google-oauth-mock.ts`): `vi.spyOn(globalThis, 'fetch')` that answers `POST https://oauth2.googleapis.com/token` with `{ access_token, id_token, expires_in, token_type }` (unsigned JWT built by hand: header.payload.sig base64url, claims `sub,email,email_verified,name,iss,aud`) keyed by `code` (`code-A`, `code-B`, `code-denied`, `code-unverified`), and passes every other URL through. No new dependency. Verify that better-fetch resolves `globalThis.fetch` at call time; fallback = `undici` `MockAgent` + `setGlobalDispatcher` (new devDep, reason: intercept Node fetch).
- `signInAs(app, who)`: POST `sign-in/social` with `Origin: WEB_ORIGIN`, `callbackURL: WEB_ORIGIN + '/'` → read `state` from the returned URL + state cookie → GET `/api/auth/callback/google?code=code-<who>&state=…` with that cookie → take `__Host-applyra.session` from `Set-Cookie`. `testEnv()` gets fake Google creds and an allowlist with users A/B.
- Expiry: integration test updates `session.createdAt`/`expiresAt` via `testPrisma()` (test-only data setup, not a session write path); domain unit tests with fixed dates (boundaries 30 d − 1 ms / exactly / + 1 ms).
- Private route for 401 tests: test-only controller via `createHttpApp({ controllers })`.

## Steps (one commit each)
1. **test → feat(auth): allowlist requires verified email** — failing unit tests for `isSignupAllowed({email,emailVerified})`, then change domain + hook call site; update `config-bootstrap.test.ts` expectations.
2. **test → feat(auth): absolute session lifetime domain** — `session-lifetime.domain.ts` + spec (coverage gate ≥ 90 %).
3. **feat(auth): session, cookie, origin, Google provider config** — `AuthConfig` fields, `createAuth` options above, `auth.options.ts` mapping. In-process tests: built `$context.authCookies` names/attributes; `socialProviders` has google only with creds; `disableOriginCheck` false; boot without Google vars.
4. **feat(auth): Redis rate-limit store** — `auth-rate-limit.store.ts` + integration test on Valkey (allow ≤ max, 429 + retry after max, TTL set, fail-open when Redis is stopped/unreachable client).
5. **test(auth): Google mock + real `signInAs`** — mock helper, `signInAs`, integration flow tests AC 1–4, 7, 9, cookie attribute assertions, redaction check.
6. **test → feat(auth): SessionLifetimeGuard** — integration tests AC 5–6 first (fail), then guard + registration; IDOR-style A/B sanity (`get-session` with A's cookie returns A).
7. **docs: CONTEXT + spec touch-ups** — CONTEXT §3/§6 (cookie naming trick, Secure-over-http, disableOriginCheck, fail-open, mock approach); 06 §7.1 / M0-12 AC absolute `errorCallbackURL` if step 5 confirms; mark M0-10 done in mvp-tasks.

## Open questions
1. R0 rate-limit values: `sign-in/social` 10/min/IP, `callback/*` 20/min/IP, rest 100/min — OK, or reuse the 09 §4.3 shape (30/h per IP)?
2. Redis outage for the auth limiter: fail-open (proposed for R0, Google-only) vs fail-closed (429/503 on every sign-in while Redis is down)?
3. Safari cannot do local dev with `Secure` cookies over `http://localhost` — accept (Chrome/Firefox only for local), or add an `https` local proxy later?
