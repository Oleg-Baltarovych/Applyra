# M0-12 · Web foundation + sign-in + Settings

FR-AUTH-01, FR-AUTH-02, FR-PROF-01 · GitHub #15 · spec `10-frontend-ux.md` §1–§10 · `06-api.md` §3, §7.1 · `09-security-privacy.md` §3, §4.1, §4.4, §9.1 · `11-testing.md` §2 · `04-architecture.md` §6–§7 · branch `feat/M0-12-web-foundation` · depends M0-11 (done).

## Scope and split (Est 3h is too low: ~7h)
- **M0-12a (this branch, ~4.5h, FR-AUTH-01/02):** toolchain, tokens + contrast test, env accessor, API client, QueryClient, router + shell + auth gate + 404 + loading/error, `/sign-in` with error messages, sign-out, ESLint web rules, `pnpm dev` = contracts + api + web.
- **M0-12b (`feat/M0-12b-settings`, ~2.5h, FR-PROF-01):** first-sign-in timezone push, `/settings/preferences` (timezone, thresholds, hotkeys, theme), `/settings/account`, `lib/format` (Intl).
- Out of scope: `_headers` (M0-14), Sentry web (R1, M5), demo button (M2-12), Applications/Today content (M1), hotkey registry (M1), `SafeHtml` + `react/no-danger` (R1), toasts (first need M1), Cmd+K.

## Acceptance criteria → test
1. `pnpm --filter @applyra/web build` → `dist/` via Vite 8; `dist/index.html` has no inline `<script>` (only `src=`), no `on*=` attrs, no `javascript:` → `test/index-html.test.ts` (source) + `scripts/check-dist-html.mjs` run in `build`.
2. Tokens of 10 §8 in `src/styles/globals.css` (`:root` / `.dark`, `@theme inline`); `test/contrast.test.ts`: fg/bg, muted-fg/muted, primary-fg/primary, destructive/bg, every status/bg ≥ 4.5:1; ring/bg ≥ 3:1, both themes; regression case: slate-500 on slate-100 < 4.5 (the spec's own note).
3. Typed client: `request()` parses responses with contracts schemas; non-2xx → `ApiRequestError {status, code, message, details, requestId}` parsed by contracts `ApiError`; non-JSON/garbled error body → `INTERNAL_ERROR`; network failure → `NetworkError`; `credentials: 'include'` (MSW asserts) → `src/lib/api/client.test.ts`.
4. `/sign-in`: Google button only when `VITE_AUTH_GOOGLE_ENABLED=true`, else "no sign-in method" message + README link (10 §2.1); click → `POST /api/auth/sign-in/social` body `{ provider:'google', callbackURL: origin+next, errorCallbackURL: origin+'/sign-in', disableRedirect: true }` (absolute, MSW asserts) → `window.location.assign(url)` via a `lib/browser.ts` seam.
5. `?error=SIGNUP_CLOSED` → "Access is invite-only"; `?error=account_not_linked` → "Verify your email address in your Google account, then try again"; other `?error=` → "Sign-in failed, try again" without the raw code; `error` removed from the URL (replace) after display → component test, all three + removal.
6. Protected routes: no session (`GET /api/v1/me` 401) → `/sign-in?next=<relative path>`; `next` accepted only as a same-origin relative path (`safeNext` unit tests: `//evil`, `/\evil`, `https://…`, `javascript:`, `/sign-in` → default `/applications`).
7. Shell: nav `Applications · Today · Settings` (landmark `navigation`, `aria-current`), sign-out button → `POST /api/auth/sign-out` → cache cleared → `/sign-in`; `/` → `/applications` (FR-AUTH-01 Today branch needs reminders → M1, see Q2); `*` → 404 screen.
8. Loading = skeleton shown after 150 ms; route `errorElement` → `ErrorState` (message by `code`, Retry, `requestId`); API 404 → "Not found" → component tests.
9. (b) First sign-in: `settings.timezoneConfirmed === false` → one `PATCH /me/settings {timezone: Intl zone}` without asking; skipped when `true` or when the browser zone fails `IanaTimeZone.safeParse` → MSW test counts requests.
10. (b) `/settings/preferences`: RHF + `zodResolver(UpdateUserSettings)`, sends dirty fields only, limits from `STALE_DAYS_LIMITS`, server `VALIDATION_ERROR.details[].path` → `setError`, submit disabled while submitting / not dirty, inline `role="status"` result → component test.
11. (b) Dates/numbers via `Intl` with the user's timezone (`lib/format.ts` unit tests with fixed zone + locale).
12. a11y: axe on sign-in, shell, 404, preferences — zero violations; queries by role/label only.

## Decisions (recommendations)
- **Local dev = CORS, no Vite proxy.** `localhost:5173` and `localhost:3000` are same-site (ports ignored) → `__Host-` Lax cookies flow with `credentials:'include'`; Chrome/Firefox treat `http://localhost` as secure (Safari unsupported, CONTEXT §6 M0-10). Mirrors prod `app.`/`api.` topology, so CORS/CSRF bugs surface locally; a proxy would need `BETTER_AUTH_URL` = web origin and hide them. Vite `server: { host: 'localhost', port: 5173, strictPort: true }` — Origin must equal `WEB_ORIGIN` exactly; never `127.0.0.1` (different site).
- **Auth client:** `better-auth/client` `createAuthClient({ baseURL: new URL(VITE_API_URL).origin + '/api/auth', fetchOptions: { credentials: 'include' } })` in `src/lib/auth/` — same pin as api (1.7.25), typed, ready for R1 email/2FA. Session source = `GET /api/v1/me` (`meQuery`), not `get-session` (one request, also lazily creates settings). WEB_ORIGIN at runtime = `window.location.origin` (no new var).
- **Placeholders:** `/applications` and `/today` render a static `EmptyState` ("Arrives with M1") — no data, no CTAs to missing endpoints, replaced by M1 tasks (Q1).
- **Response mismatch** rejects in every env (spec: dev/test `parse`, prod `safeParse` + report): never hand unvalidated data to UI; prod reporting hook is a no-op until Sentry web.
- **a11y in tests:** `axe-core` directly + 10-line `expectNoAxeViolations(container)` helper; `vitest-axe` is 0.1.0 (2022, unmaintained) → update 11 §2.
- **Contrast check** = Vitest test (unit CI job) instead of a separate `scripts/check-contrast.ts`: parses `globals.css`, resolves `var(--color-*)` from `tailwindcss/theme.css` (oklch), oklch→sRGB (clipped) → WCAG ratio; pure helpers in `test/support/contrast.ts` with known-value tests (white/black = 21).
- **Status tokens** (10 §8 leaves values open), proposal: active blue, interview violet, offer green, rejected red, ghosted amber, archived slate; light `-700`, dark `-300`; the contrast test is the arbiter.
- **Timezone picker** = native `<select>` from `Intl.supportedValuesOf('timeZone')` + `UTC` + current value if missing (V8 omits UTC/links, CONTEXT M0-11); accessible type-ahead, no combobox dep.
- **Theme:** `public/theme-init.js` (sync `<script src>` in `<head>`): `localStorage['applyra.theme']` ∈ system|light|dark → `.dark`; selector in preferences (b), client-only.
- **shadcn:** `pnpm dlx shadcn@4.23.0 init -t vite -b radix` in `apps/web` (Radix per 04 §7.1); commit generated `components.json`, `src/lib/utils.ts`, primitives used now only: button, input, label, switch, card, skeleton. TS 6 deprecates `baseUrl` → `paths` only (`@/*` → `./src/*`) + Vite `resolve.alias`.

## Dependencies (apps/web; exact pins; latest checked on npm 2026-11-18)
Runtime: `react`/`react-dom` 19.3.1 (UI; already in lockfile) · `react-router` 8.5.1 (data mode; peers react ≥ 19.2.7, Node ≥ 22.22) · `@tanstack/react-query` 5.108.0 (server state) · `better-auth` 1.7.25 (client `signIn.social`/`signOut`; = api pin; all peers optional) · `react-hook-form` 7.92.0 + `@hookform/resolvers` 7.0.7 (forms, peers zod ^4 — 04 says 5.x → update) · `radix-ui` 1.8.1, `class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 3.7.0, `lucide-react` 1.75.0 (shadcn primitives/icons) · `@fontsource-variable/inter` 5.3.0 (self-hosted font, CSP `font-src 'self'`).
Build/dev: `vite` 8.3.8 (lockfile) · `@vitejs/plugin-react` 6.3.0 (peers vite ^8; babel/compiler peers optional — do not add) · `tailwindcss` + `@tailwindcss/vite` 4.3.5 · `tw-animate-css` 1.4.0 + `shadcn` 4.23.0 (only if `init` emits `@import "shadcn/tailwind.css"` / animations) · `@types/react` 19.3.0, `@types/react-dom` 19.3.0 · `eslint-plugin-react-hooks` 7.1.1 (in `@applyra/config`; peers eslint ^10).
Test: `jsdom` 31.0.1 (Node ≥ 26 ok) · `@testing-library/react` 16.3.3 + `@testing-library/dom` 10.4.2 + `@testing-library/user-event` 14.6.12 + `@testing-library/jest-dom` 7.0.1 (`/vitest` entry) · `msw` 3.0.7 (3.0.0 released 2026-09-28: ESM-only, Node ≥ 22, `onUnhandledRequest` → `onUnhandledFrame`; 04 says 2.x → update) · `axe-core` 4.14.1.
**Verify during implementation:** `pnpm add` fails on any version < 24 h old (minimumReleaseAge strict) → pin the previous patch; `pnpm peers check` clean; `pnpm view msw@3.0.7 exports` has `./node` with `setupServer`; better-auth `signIn.social` accepts `errorCallbackURL` + `disableRedirect` (check `node_modules/better-auth/dist/api/routes/sign-in.d.mts`); new `allowBuilds` prompts (expect `@tailwindcss/oxide` none — it uses optional platform packages; deny anything else with a reason); `pnpm audit` / osv green.

## Files (a = M0-12a, b = M0-12b)
- `apps/web/`: `package.json` (scripts `dev: vite`, `build: vite build && node scripts/check-dist-html.mjs`, `preview`, `typecheck`, `test: vitest run`), `index.html`, `vite.config.ts` (react, tailwind, `envDir: '../..'`, alias, server), `vitest.config.ts` (jsdom, setupFiles, `env` VITE_* test values), `tsconfig.json` (`jsx: react-jsx`, `types: ["vite/client", "@testing-library/jest-dom/vitest"]`, paths), `components.json`, `public/theme-init.js`, `scripts/check-dist-html.mjs`.
- `src/main.tsx`, `src/app/{router.tsx,providers.tsx,query-client.ts,root-layout.tsx,protected-layout.tsx,route-error.tsx,not-found.tsx}`, `src/styles/globals.css`, `src/lib/env.ts` (Zod over `import.meta.env`), `src/lib/api/{client.ts,errors.ts}`, `src/lib/auth/{auth-client.ts,safe-next.ts}`, `src/lib/browser.ts`, `src/components/{EmptyState,ErrorState,DelayedSkeleton}.tsx`, `src/components/ui/*`, `src/features/auth/{index.ts,api/me.ts,routes/sign-in.tsx,components/sign-in-error.ts}`, `src/features/shell/{index.ts,components/AppShell.tsx}`, `src/features/applications/routes/placeholder.tsx`, `src/features/today/routes/placeholder.tsx` (a).
- (b) `src/features/settings/{index.ts,api/{keys.ts,settings.ts},hooks/useBrowserTimezoneSync.ts,routes/{preferences.tsx,account.tsx},components/PreferencesForm.tsx}`, `src/lib/format.ts`, `src/lib/theme.ts`.
- `test/`: `setup.ts` (jest-dom, MSW server, `onUnhandled* : 'error'`, cleanup), `msw/handlers.ts` (factories built from contracts types — tests only), `support/{render.tsx,axe.ts,contrast.ts}`, `contrast.test.ts`, `index-html.test.ts`; component tests colocated `*.test.tsx`.
- `packages/config/eslint.base.js` (+ fixtures): `globals.browser` for apps/web; react-hooks recommended; `no-restricted-globals: fetch` outside `apps/web/src/lib/api/**`; hex-colour literal ban in `apps/web/src/**/*.tsx`; web boundaries: `features/*` imports another feature only via its `index.ts`, `lib`/`components` never import `features`.
- Root: `turbo.json` web `build` `env: ["VITE_*"]`; `.env.example` += `VITE_AUTH_GOOGLE_ENABLED=false` (comment: set `true` with GOOGLE_* creds).

## Steps (one commit each; test-first for logic)
1. (a) Toolchain: deps, vite/vitest/tsconfig, `index.html` + `main.tsx` rendering an empty root; test: `index-html.test.ts` (fails on an inline script fixture string first) + `check-dist-html.mjs`; `pnpm build/typecheck/test` green.
2. (a) Tailwind 4 + shadcn init + tokens + Inter + `theme-init.js`; test-first: `contrast.ts` helpers (known values), then `contrast.test.ts` over globals.css.
3. (a) ESLint web rules + boundaries fixtures (one per rule, messages asserted) in `@applyra/config` test.
4. (a) `lib/env.ts` (test: missing/invalid `VITE_API_URL` throws listing the key; flag defaults false) and `lib/api/client.ts` + errors (MSW tests: AC 3).
5. (a) `query-client.ts` defaults (staleTime 30 s, gcTime 5 min, retry ≤ 2 network/5xx only — unit test of the retry predicate); `meQuery`; `safeNext` (unit tests AC 6).
6. (a) Router: root + protected layout loader (`ensureQueryData(meQuery)`, 401 → redirect), shell nav, placeholders, `*` 404, `errorElement`, `DelayedSkeleton`; tests: AC 6–8 + axe (`createMemoryRouter` with the same route objects).
7. (a) `/sign-in`: `signInErrorMessage(code)` (unit), page + Google button + "no method" message + redirect-if-signed-in; tests AC 4–5 + axe; sign-out in shell (MSW asserts POST, then `/sign-in`).
8. (a) `pnpm dev`: web `dev` script; README/CONTEXT run instructions; manual smoke (compose up, `pnpm db:migrate`, `pnpm dev`, Google sign-in in Chrome with an allowlisted email → `/applications`; non-listed email → invite-only banner).
9. (b) `useBrowserTimezoneSync` (MSW request-count test AC 9; StrictMode double effect is harmless — PATCH is idempotent, guard with a ref anyway).
10. (b) `PreferencesForm` + route (AC 10, axe), theme selector; `account` route (email, name, member since via `lib/format`, sign-out); `lib/format` unit tests (AC 11).

## Security notes
No secrets in `VITE_*` (bundle-public). Redirect targets: `next` relative-only (open redirect), OAuth URLs absolute on own origin (server also checks trustedOrigins). Never render `?error=` raw. `credentials:'include'` only towards `VITE_API_URL`. No inline scripts / `eval` (CSP 09 §9.1). MSW + fixtures only under `test/` (ESLint: `msw` import banned in `src/**`).

## Docs to update
`CONTEXT.md` (status, repo map web, `pnpm dev`, gotchas: localhost-only, Safari, CORS dev); `04-architecture.md` §7.1 (MSW 3.x, `@hookform/resolvers` 7.x, versions ✓); `10-frontend-ux.md` §8 (contrast = Vitest test, status token values), §4.2 (session query = `/me`); `11-testing.md` §2 (`axe-core` helper instead of `vitest-axe`); `mvp-tasks.md` (split M0-12a/b, est). No ADR: no stack/policy change beyond test-lib majors.

## Open questions — resolved by the user 2026-11-18 (all recommendations approved)
- **Q1 → A:** placeholders. `/applications`, `/today` = static "Arrives with M1" EmptyState, no data, no buttons to missing endpoints — a deliberate, user-approved exception to the CLAUDE.md "no UI without backend" rule (also in CONTEXT §6).
- **Q2 → accepted:** post-sign-in landing is always `/applications` (`DEFAULT_LANDING`); the M1 Today task adds the reminders-due branch of FR-AUTH-01.
- **Q3 → split:** this PR = M0-12a; M0-12b on `feat/M0-12b-settings`.
- **Q4 → M0-12b:** theme selector ships with preferences (theme-init.js already in a).

### Implementation notes (M0-12a)
- Pinned msw 3.0.6 / lucide-react 1.74.0 (3.0.7 / 1.75.0 were < 24 h old). shadcn primitives (button, card, skeleton) + `components.json` written by hand from the new-york templates instead of `shadcn init` (the CLI would `pnpm add` unpinned latest deps); `tw-animate-css`/`shadcn` packages not needed; RHF/resolvers/input/label/switch move to b.
- `/settings` in a shows the account (name, email) from `GET /me` — real data, no placeholder; b turns it into `/settings/account` + `/settings/preferences`.
- Review fixes (2026-11-18): no nested `<main>` for child-route errors (`standalone` prop), mid-session 401 → cache cleared + `/sign-in?next=` (QueryCache/MutationCache, `app/create-app.ts`), per-route `document.title` + h1 focus on client navigation (`app/root-layout.tsx`), `--destructive-foreground`, sign-in alert focused on arrival + `aria-busy`, `redirectIfSignedIn` shows the form only for 401/network (5xx → error page), PROD build rejects non-localhost `http:` `VITE_API_URL`.

### Follow-ups
- Route modules are not `lazy` yet (single ~520 kB chunk, Vite warns) — split per feature when M1 adds real screens.
- 404 for a signed-in user renders without the shell (top-level `*`) — accepted for M0.
- Route pending indicator (`useNavigation`, 10 §7.1 background refetch) — M1.

### Original questions (recommendation first)
- **Q1** Placeholder `/applications` + `/today` (static "Arrives with M1" EmptyState, no data/CTAs) vs hiding the nav items until M1. Rec: placeholders — AC requires the nav and FR-AUTH-01 lands on `/applications`.
- **Q2** Landing `/today`-if-due (FR-AUTH-01) needs the reminders API → always `/applications` now; M1 Today task adds the branch. Rec: accept.
- **Q3** Split into M0-12a/b (two PRs). Rec: yes.
- **Q4** Theme selector in M0-12b (spec 10 §2.1 lists it, AC does not). Rec: include — client-only, ~20 min.
