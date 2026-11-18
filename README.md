# Applyra

Your job search, under control: job capture, application CRM, reminders, explainable match score and an AI assistant.

> Status: M0 scaffold — monorepo tooling in place; application code lands milestone by milestone ([MVP plan](docs/plans/mvp.md)).

## Requirements

- Node.js 26 LTS (`engines.node` in `package.json`)
- pnpm: `npm install -g pnpm` (any 11.x/12.x) — inside the repo it switches to the version pinned in `package.json#packageManager`. Node 25+ ships no corepack.

## Getting started

```sh
pnpm install
cp .env.example .env    # local-only placeholder values
docker compose up -d    # postgres, redis (Valkey), minio, mailpit on 127.0.0.1
pnpm db:migrate
pnpm dev                # contracts watch + api on http://localhost:3000 + web on http://localhost:5173
```

Open http://localhost:5173 in Chrome or Firefox — not `127.0.0.1` (the API accepts only the `localhost` origin).
Safari does not send the `Secure` session cookie over plain http, so it is unsupported for local dev.

### Google sign-in (local)

R0 signs in with Google only. Without credentials `/sign-in` says that no sign-in method is configured.

1. Create an OAuth client (type _Web application_) in Google Cloud Console with the redirect URI
   `http://localhost:3000/api/auth/callback/google`.
2. In your local env file set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `VITE_AUTH_GOOGLE_ENABLED=true`, and add
   your Google email to `AUTH_SIGNUP_ALLOWLIST` (any other email gets "Access is invite-only").
3. Restart `pnpm dev`.

## Commands

| Command                          | What it does                                          |
| -------------------------------- | ----------------------------------------------------- |
| `pnpm dev`                       | persistent dev tasks via Turborepo                    |
| `pnpm build`                     | build all packages (`@applyra/contracts` first)       |
| `pnpm lint`                      | ESLint incl. module-boundary rules                    |
| `pnpm typecheck`                 | `tsc --noEmit` per package                            |
| `pnpm test`                      | Vitest unit tests                                     |
| `pnpm format`                    | Prettier write (`format:check` to verify)             |
| `pnpm --filter @applyra/e2e e2e` | Playwright end-to-end tests (not part of `pnpm test`) |

Scope any task to one package with `pnpm --filter <name> <task>`.

## Repository layout

```
apps/web            React SPA (Vite)
apps/api            NestJS API + worker — src/modules/<name>/, src/platform/
packages/contracts  Zod schemas shared by web and api
packages/config     shared tsconfig base + ESLint flat config (boundary rules)
e2e                 Playwright tests and test plans
docs                spec, ADRs, plans, working context
```

## Documentation

- Overview: [docs/spec/00-overview.md](docs/spec/00-overview.md)
- Architecture decisions: [docs/adr/](docs/adr/README.md)
- MVP plan: [docs/plans/mvp.md](docs/plans/mvp.md)
- Working context: [docs/CONTEXT.md](docs/CONTEXT.md)
- AI-assisted workflow: [docs/AI-WORKFLOW.md](docs/AI-WORKFLOW.md)
