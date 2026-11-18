# 024. Node.js 26 LTS runtime; pnpm provisioned without corepack

- Status: Accepted (2026-11-18)
- Date: 2026-11-18
- Amends: `docs/spec/04-architecture.md` §7.1 (Runtime, Package manager rows); ADR 002 follow-up "pin Node LTS in `engines`". Supersedes the uncommitted `engines.node ^24.16.0` fix for #145.
- Plan: `docs/plans/2026-11-18-node-26-lts.md`

## Context
- The spec pins Node 24 LTS "until the ecosystem catches up with 26". Node 24 ("Krypton") moved to **Maintenance** on 2026-10-20; Node 26 ("Lithium") is **Active LTS** since 26.13.0 (2026-10-28), maintenance from 2027-10-20, EOL 2029-04-30 ([nodejs/Release schedule.json](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json)). Latest: 26.13.1 (2026-11-11) ([CHANGELOG_V26](https://raw.githubusercontent.com/nodejs/node/main/doc/changelogs/CHANGELOG_V26.md)).
- The author's machine already runs 26.13.1 (user decision 2026-11-18: "adapt to the current Node version").
- Issue #145 (Windows Vitest worker exit 0xC0000409) is a libuv bug in Node 24.0–24.15 ([nodejs/node#63620](https://github.com/nodejs/node/issues/63620), fixed by 24.16.0's libuv 1.52.1). Node 26 does not need the 24.16 floor; the fix must be confirmed on 26 by a local loop.
- Node 25+ no longer ships corepack ([Node docs: corepack](https://nodejs.org/download/release/latest-v25.x/docs/api/corepack.json), [TSC vote](https://socket.dev/blog/node-js-tsc-votes-to-stop-distributing-corepack)). Our README / mvp-tasks / spec say "pnpm via corepack"; the stale corepack shim under `C:\Program Files\nodejs` is broken on 26.
- pnpm 11 has `pmOnFail` (default `download`, replaces `managePackageManagerVersions`): a pnpm whose version differs from `packageManager` downloads and runs the declared one ([pnpm settings](https://pnpm.io/settings/cli)). Verified on the author's machine: global npm pnpm 12.21.0 → `pnpm -v` in the repo = 11.28.12 on Node 26.13.1. CI's `pnpm/action-setup@v6` reads `packageManager` itself and does not use corepack ([action README](https://raw.githubusercontent.com/pnpm/action-setup/master/README.md)).
- Dependency engines in the lockfile all admit 26 (NestJS 11.2 `>=20`, Prisma 7.10 `>=24.0`, Vitest 4.1 `>=24`, Vite 8.3/rolldown `>=22.12`, testcontainers 12.2 `>=22.22`, tsup 9 `>=26.0.0`, ESLint 10 `>=24`, pnpm 11.28 `>=22.13`, pg 8 `>=16`). Prisma 7's docs list only `^20.19 / ^22.12 / ^24.0` as tested; Node 26 is officially listed for Prisma 8 ([Prisma supported versions](https://www.prisma.io/docs/orm/supported-versions)).

## Decision
- **Runtime = Node.js 26 LTS only.** Root `engines.node = "^26.13.1"`; no dual 24/26 range, no CI matrix. CI keeps resolving Node from `engines` (`actions/setup-node` `node-version-file: package.json`), so engines stay the single source of truth.
- `@types/node` follows the runtime major (`^26`).
- **pnpm is provisioned without corepack**: locally `npm install -g pnpm` (any 11.x/12.x), the repo's `packageManager` (`pnpm@11.28.12`) is the only version pin, and `pmOnFail: download` is set explicitly in `pnpm-workspace.yaml` so the self-switch does not depend on a default. CI keeps `pnpm/action-setup` (installs exactly `packageManager`). Both ends execute the same pinned pnpm.
- Production images (M0-14): Node 26 LTS base, pinned by digest — intended `node:26-trixie-slim@sha256:…` (user decision 2026-11-18; a distroless Node 26 image may still be evaluated, final choice in M0-14); images do not rely on corepack (build stage installs pnpm via npm at the `packageManager` version; runtime has no package manager).
- Prisma 7 on Node 26 is accepted on evidence (engines + our unit/integration/migration suites green), not on vendor listing; revisit at the Prisma 8 decision.

## Alternatives considered
- Stay on Node 24.16+ (the #145 branch as is) — works, but 24 is already in Maintenance and the author runs 26; would diverge local from CI or force a downgrade.
- Dual range `^24.16.0 || ^26.13.1` — doubles the support surface for a solo project; setup-node would pick 26 anyway, so 24 would be untested.
- Reinstall corepack from npm (`npm i -g corepack@0.36`, engines `>=26.0.0`) — keeps the old docs, but corepack is now a userland add-on on its way out, and on the author's machine `npm i -g corepack` collided (EEXIST) with the pnpm bin.
- pnpm standalone script (`get.pnpm.io/install.ps1`) — pnpm docs recommend npm on Windows (Defender may block the exe).

## Consequences
- Positive: Active LTS until 2027-10, EOL 2029-04; #145 class of crash gone (to be confirmed by the loop); one pnpm mechanism everywhere, no corepack shims; Temporal and newer V8 (14.6) available.
- Negative / trade-offs: Prisma 7 is not vendor-listed for 26 (risk covered by tests); `pmOnFail: download` fetches pnpm from the npm registry at first use (same trust as `action-setup`; `packageManager` pins the version); contributors on Node 24 get an engines warning (pnpm `engineStrict` is off) — the README states 26.
- Follow-ups: TS `target`/`lib` es2024 → es2025 (separate change); check whether Node 26 `crypto.randomUUIDv7()` can replace the `uuid` dep (04 §7.2 note 5 says Node has none — re-verify); M0-14 picks the exact image tag/digest; M2-14 devcontainer uses Node 26 + npm-global pnpm.
