# M0-09 · HTTP platform hardening — plan

- Task: `mvp-tasks.md` M0-09 · FR-AUTH-03 · GitHub #12 · branch `feat/M0-09-http-platform-hardening`
- Spec: 06 §3, §3.1, §5 · 09 §3, §9.2, §10 · 04 §4.1, §7 · 12 §9 (health) · ADR 008
- Status: approved (2026-11-17; open questions: 1 = A, 2 = `WEB_ORIGIN` only)

## Goal
Every API response follows one platform policy: the 06 error shape with the `ErrorCode` catalogue, `X-Request-Id`, redacted pino logs, API security headers, exact-origin CORS, CSRF Origin check, JSON-only mutations with a 1 MB limit, and `/health/ready`.

## Acceptance criteria (testable)
1. `@applyra/contracts` exports `ErrorCode` (the full 06 §3.1 catalogue), `errorStatus: Record<ErrorCode, number>`, `ApiError` (strict). A test fails if the enum and the 06 §3.1 table drift apart.
2. Every non-`/api/auth` error body passes `ApiError.parse`. Unknown route → 404 `NOT_FOUND`. Zod body → 400 `VALIDATION_ERROR` with `details: [{ path, message }]`. Malformed JSON → 400 `VALIDATION_ERROR`. No session → 401 `UNAUTHENTICATED`. Thrown `Error` → 500 `INTERNAL_ERROR` with a fixed message and no stack or message leak. Better Auth `APIError` thrown on our routes → mapped by status/code.
3. `requestId` in the body equals the `X-Request-Id` response header. A valid incoming id is echoed. An invalid or missing one is replaced by a new UUID v7. The id appears in every log line for that request.
4. Logging unit test: a record containing every 09 §10 field (top level and nested) yields no sentinel value in the output. Email is masked as `o***@domain` and the IP is truncated to /24 (/48 for IPv6). Request logs contain no bodies, no query strings and no headers.
5. Every response, including `/api/auth/*` and errors, carries exact 09 §9.2 values: CSP `default-src 'none'; frame-ancestors 'none'`, HSTS, `nosniff`, `Referrer-Policy: no-referrer`, CORP `same-site`, `Cache-Control: no-store`, and no `X-Powered-By`.
6. CORS: a preflight from `WEB_ORIGIN` → ACAO = that origin, credentials true, methods `GET,POST,PUT,PATCH,DELETE`, headers `Content-Type, Idempotency-Key`, max-age 600. A preflight from any other origin gets no ACAO header. The adapter's own CORS is off.
7. A `POST/PUT/PATCH/DELETE` on a non-auth route with no `Origin`, or with `Origin ≠ WEB_ORIGIN` → 403 `CSRF_ORIGIN`. It is rejected before auth (unauthenticated + bad Origin → 403).
8. A mutation with a body whose type is not `application/json` → 415 `UNSUPPORTED_MEDIA_TYPE` (unless the handler has `@AcceptsMultipart()`). A JSON body over 1 MB → 413 `PAYLOAD_TOO_LARGE`. urlencoded is not parsed on non-auth routes.
9. `GET /health/ready` → 200 `{ status: 'ok' }` when PG `SELECT 1` (app role) and Redis `PING` both succeed within 1 s each. Otherwise → 503 `UNAVAILABLE` with no dependency names in the body (the failure is logged). Integration test on Testcontainers covers PG down and Redis down.

## Design
**Contracts** (`packages/contracts/src/errors.ts`, re-exported from the index):
- `ErrorCode = z.enum([...all 31 codes of 06 §3.1])`. Decision: ship the full catalogue now, because 06 §3.1 says "catalogue = enum". A partial enum would need churn in every task and invite drift. Codes from later releases are inert strings. M1-02 only adds codes that are missing.
- `errorStatus` is a `satisfies Record<ErrorCode, number>` constant, shared with FE/MSW.
- `ApiError = z.discriminatedUnion('code', [ strictObject({ statusCode, code: z.literal('VALIDATION_ERROR'), message, details: z.array(strictObject({ path: z.string(), message })), requestId }), strictObject({ statusCode, code: ErrorCode.exclude(['VALIDATION_ERROR']), message, details: z.record(z.string(), z.unknown()).nullable(), requestId }) ])`.
- `details` is always present (`null` when empty) per the 06 §1 null rule.
- `path` is the Zod path joined with `.` (`items.0.title`), matching RHF field names. Clarify this in 06 §3.

**platform/http** (`apps/api/src/platform/http/`, `index.ts` = public API):
- `request-id.domain.ts`: `resolveRequestId(header: string | string[] | undefined, gen) → string`. Accepts one value matching `^[A-Za-z0-9-]{8,64}$` (covers UUIDs and Caddy/Cloudflare ids). Anything else is replaced by `newId()` (`platform/ids/uuid-v7.ts`). The middleware sets `req.id` and the response header.
- `app-exception.ts`: `AppException(code, message, details?)`. Status comes from `errorStatus`. Services throw this, never a bare `HttpException`.
- `error-mapping.domain.ts`: `toApiError(err, requestId) → { body: ApiError, log: 'none'|'warn'|'error' }`. It is pure. Duck types are checked only on `err`. Order:
  1. `AppException`.
  2. nestjs-zod `ZodValidationException` → issues mapped to details.
  3. `ZodSerializationException` → 500 `INTERNAL_ERROR`, log error.
  4. body-parser errors by `type`: `entity.too.large` → 413, `entity.parse.failed` → 400 `VALIDATION_ERROR` with `[{ path: '', message: 'Malformed JSON' }]`, `charset.unsupported` / `encoding.unsupported` → 415.
  5. `HttpException` by status: 400 `VALIDATION_ERROR`, 401 `UNAUTHENTICATED`, 404 `NOT_FOUND`, 413, 415, 429 `RATE_LIMITED`, 503 `UNAVAILABLE`. Any other status → 500 `INTERNAL_ERROR` plus a warn log, which forces explicit codes.
  6. Better Auth `APIError` (`statusCode` + `body.code`): the code is used if it is in `ErrorCode`, else the status table in step 5 applies.
  7. Anything else → 500 with the fixed message `Internal server error`.
- `all-exceptions.filter.ts`: `@Catch()` registered as `APP_FILTER`. It calls `toApiError`, logs the error and stack with `requestId` via pino (never in the body), and writes the status and body. Verify at implementation that body-parser errors from the adapter's module middleware reach Nest filters. If they do not, map them in an Express error middleware inside `configureHttp`.
- `configure-http.ts`: `configureHttp(app, config)` is the single place for app-level middleware, used by `main.ts` and by every Supertest app. Order:
  1. request-id
  2. `helmet` (below)
  3. `Cache-Control: no-store` on all responses (the API has nothing publicly cacheable)
  4. `app.enableCors({ origin: [WEB_ORIGIN], credentials: true, methods, allowedHeaders, maxAge: 600 })`

  `app.use` runs before module middleware, so all of this also covers `/api/auth/*`.
- helmet 8: `contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }`, `referrerPolicy: { policy: 'no-referrer' }`, `crossOriginResourcePolicy: { policy: 'same-site' }`, `strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true }`. `X-Powered-By` is removed. Option names: verify at implementation against helmet 8 docs.
- `origin-policy.domain.ts`: `checkMutation({ method, origin, hasBody, contentType, acceptsMultipart }, webOrigin) → 'ok' | 'CSRF_ORIGIN' | 'UNSUPPORTED_MEDIA_TYPE'`.
  - Only `POST/PUT/PATCH/DELETE` are checked.
  - The Origin is compared exactly with `WEB_ORIGIN` (no normalisation).
  - The Origin check runs first.
  - JSON is required only when there is a body (`type-is` `hasBody` semantics): `application/json`, optionally with a charset.
- `HttpPolicyGuard` (the `OriginGuard` of 09 §3; one guard for both checks) is `APP_GUARD` in `HttpModule`. `HttpModule` is imported before `AuthModule`, so CSRF beats 401. Verify at implementation that Nest runs global guards in module order; AC 7 asserts it. `@AcceptsMultipart()` is a metadata decorator read by the guard.
- Guards never run on `/api/auth/*` (middleware). There, Better Auth's own `trustedOrigins = [WEB_ORIGIN]` check applies. It is skipped when `NODE_ENV=test`, and M0-10 tests it with the skip overridden.

**AuthModule**: pass `disableTrustedOriginsCors: true` and `bodyParser: { json: { limit: '1mb' }, urlencoded: { enabled: false } }` to `BetterAuthModule.forRootAsync` (option shape read from the adapter README, 2.8.0). The adapter restores `express.json` with that limit for non-auth routes only.

**`/api/auth/*` error bodies**: decision A. Better Auth's `{ code, message }` is kept as is, per 06 §3 (the line after the table: "`/api/auth/*` returns Better Auth codes"). `SIGNUP_CLOSED` is already a catalogue code. These responses still get `X-Request-Id`, the headers and CORS from `configureHttp`. Rewriting them would need an `after` hook or response interception: `onAPIError.onError` is documented only as a "custom error handler" and nothing says it can change the body. See open question 1.

**Logging** (`platform/logging/`):
- `nestjs-pino` 5 (Nest ≥ 11.0.8, pino 10, pino-http 11, Node ≥ 22.12, all verified). `LoggerModule.forRootAsync` with ConfigService:
  - level `silent` in test, `debug` in development, `info` in production
  - `genReqId: req => req.id` (set by the request-id middleware)
  - `customAttributeKeys: { reqId: 'requestId' }`
  - serializers: req = `{ id, method, path }` (no query, no headers, no body); res = `{ statusCode }`
  - `autoLogging.ignore` for `/health/*`
- `main.ts`: `bufferLogs: true` + `app.useLogger(app.get(Logger))`.
- `redact.ts`: the single 09 §10 list, expanded to `k` and `*.k` for each key (pino paths do not recurse; the depth limit is documented in the file), plus `req.headers.authorization|cookie|x-api-key` and `res.headers["set-cookie"]`. The `censor(value, path)` function masks `email`, truncates `ip`/`remoteAddress`, and returns `[REDACTED]` for everything else. Verify the pino 10 `redact.censor` signature at implementation.

**Redis + readiness**:
- `platform/redis/` (`RedisModule` @Global, `REDIS` token, `ioredis` 6 `new Redis(REDIS_URL, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 })`, `quit` on shutdown). M0-10 reuses it for the Better Auth rate-limit store.
- `modules/health/health.repository.ts`: `$queryRaw\`SELECT 1\`` (Prisma stays in the repository; raw SQL bypasses the user-scope check by design).
- `HealthService.ready()` runs both checks in parallel, each with a 1 s timeout, and throws `AppException('UNAVAILABLE', 'Not ready')`.
- Boundaries: register `platform/redis` and `platform/http` with the right policies, plus fixtures (verify against `eslint.base.js` rules).

## Security notes
- The 500 body never echoes `err.message`. Logs carry the stack and `requestId` (Sentry in M0-15).
- An incoming `X-Request-Id` is length- and charset-limited, which prevents log injection and header bloat.
- Missing `Origin` on a mutation → 403, even for non-browser clients (09 §3). Origins are compared exactly, with no wildcard or suffix matching.
- urlencoded is disabled outside `/api/auth`, which closes the form-POST CSRF route on top of the Origin check.
- `/api/auth/*` body size is controlled by Better Auth's own reader. Verify at implementation whether it enforces a limit. If it does not, add a `Content-Length > 1 MB → 413` pre-check for that prefix and note it in 09.

## Steps (one commit each)
0. `docs:` 04 §7 nestjs-pino 4.x → 5.x, helmet 8 and ioredis 6 as R0 api runtime deps. 06 §3: `path` = dot-joined, `details` is `null` when empty.
1. `feat(contracts)`: `ErrorCode`, `errorStatus`, `ApiError`. Tests: strict rejection of extra keys, `VALIDATION_ERROR` requires array details, the drift test that parses the 06 §3.1 table.
2. `feat(api)`: request-id domain (test first: valid, invalid charset, too long, array header, missing) + middleware + `configureHttp` skeleton, used in `main.ts` and in a shared `test/support/http-app.ts` (`createHttpApp({ extraModules })`). The probe module adds `POST /__probe` routes (Zod DTO, AppException, throw, Better Auth APIError, `@Public` vs. private).
3. `feat(api)`: `toApiError` (test first: one case per branch) + `AppException` + `APP_FILTER`. Supertest: 404 unknown route, Zod 400, malformed JSON 400, 401 from the guard, a mapped Better Auth APIError, a 500 without a leak; every body passes `ApiError.parse` and matches the header id.
4. `feat(api)`: logging (test first for redaction and censor: every field, nested, email mask, IPv4/IPv6 truncation, a line has `requestId`) + LoggerModule + `bufferLogs`.
5. `feat(api)`: helmet + `no-store` + CORS + adapter `disableTrustedOriginsCors`/`bodyParser`. Supertest: exact header values on a 200, a 404 and `/api/auth/get-session`; CORS preflight allowed vs. foreign.
6. `feat(api)`: `checkMutation` domain (test first) + `HttpPolicyGuard` + `@AcceptsMultipart`. Supertest: 403 missing/foreign Origin, 403 beats 401, 415 `text/plain` and urlencoded, 413 at 1 MB + 1 byte, 200 at the limit, DELETE without a body passes.
7. `feat(api)`: `platform/redis` + `/health/ready`. Integration: 200; 503 with the Redis client pointed at a closed port; 503 with a bad DB URL. Check that the body has no host/dependency names.
8. `docs:` CONTEXT (repo map: platform/http, logging, redis; gotchas found).

## New dependencies (apps/api; check `minimumReleaseAge`)
- `helmet` 8: the 09 §9.2 headers.
- `nestjs-pino` 5 + `pino` 10 + `pino-http` 11: the logging stack fixed in 04 §7.
- `ioredis` 6 as a runtime dependency: Redis PING now, Better Auth's store in M0-10, BullMQ in R1.
- `supertest` + `@types/supertest` (dev), if not already present (verify).

## Out of scope
- M0-10: `__Host-` cookies, sessions, Google OAuth, the Better Auth rate limit on Redis, Origin tests on `/api/auth`.
- The general 300/min throttle (M1).
- `trust proxy` for Caddy (M0-14).
- Sentry (M0-15).
- An `Access-Control-Expose-Headers: X-Request-Id` header (not in 09 §3; add it if the SPA needs it).
- A `LOG_LEVEL` env var.
- Per-route body limits (CSV, M1).

## Open questions
1. `/api/auth/*` error bodies: keep Better Auth's `{ code, message }` as 06 §3 says (A, planned), or rewrite them to the full shape through a Better Auth `hooks.after` (B, +~1 h, depends on Better Auth internals)? The M0-02 hand-off note said "map both". The spec says A.
2. Should there be extra allowed Origins for local dev (ADR 008 "local-dev origin list"), or only `WEB_ORIGIN`? Planned: `WEB_ORIGIN` only. Dev already sets it to the Vite origin.
