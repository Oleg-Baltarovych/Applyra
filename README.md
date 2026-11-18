# Applyra

Your job search, under control: job capture, application CRM, reminders, explainable match score and an AI assistant.

> Status: M0 scaffold — monorepo tooling in place; application code lands milestone by milestone ([MVP plan](docs/plans/mvp.md)).

## Requirements

- Node.js 26 LTS (`engines.node` in `package.json`)
- pnpm: `npm install -g pnpm` (any 11.x/12.x) — inside the repo it switches to the version pinned in `package.json#packageManager`. Node 25+ ships no corepack.

## Getting started

```sh
pnpm install
pnpm dev        # watch builds (web + api once scaffolded)
```

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
