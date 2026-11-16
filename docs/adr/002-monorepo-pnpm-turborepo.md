# 002. Monorepo with pnpm workspaces and Turborepo

- Status: Accepted
- Date: 2026-11-16

## Context
- Frontend (`apps/web`) and backend (`apps/api`) share Zod contracts (ADR 004); a change to a contract must update both sides atomically.
- Solo developer: one repo, one CI pipeline, one PR per logical change.
- CI time matters (GitHub Actions minutes, fast feedback for agents).
- See `docs/spec/04-architecture.md` and `docs/spec/12-infra-ops.md`.

## Decision
One repository using **pnpm workspaces** for packages and **Turborepo** as task runner with caching.
- Layout: `apps/web`, `apps/api` (HTTP + worker), `packages/contracts` (Zod schemas, shared types).
- Root scripts run through turbo: `pnpm dev` (web + api + worker), `pnpm lint`, `pnpm typecheck`, `pnpm test`, scoped with `--filter <pkg>`.
- TypeScript strict with `noUncheckedIndexedAccess: true` across all packages.
- Turborepo cache is used in CI to skip unchanged tasks.

## Alternatives considered
- Polyrepo (web, api, contracts separately) — contracts need publishing/versioning; cross-repo changes for every API change.
- npm/yarn workspaces without a task runner — no task graph or caching; slower CI.
- Nx — more features (generators, project graph plugins) than needed; heavier configuration and lock-in.

## Consequences
- Positive: atomic FE/BE/contract changes; cached builds and tests; single dependency lockfile.
- Negative / trade-offs: workspace tooling quirks (hoisting, Prisma client output paths, CJS/ESM interop for Nest — see ADR 016); remote cache needs configuration.
- Follow-ups: decide whether to enable Turborepo remote cache in CI; pin Node LTS version in `.nvmrc`/`engines` (review §5).
