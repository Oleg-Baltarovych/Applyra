---
name: verify
description: Definition-of-Done gate — run checks for affected packages and walk the Definition-of-Done checklist from docs/spec/02-releases.md.
---
1. Find the affected workspace packages from the changed files (`git diff --name-only main...HEAD` + uncommitted).
2. Run `pnpm turbo run lint typecheck test --filter=...[main]` (fallback: `pnpm --filter <pkg> lint typecheck test` for each package). Quote failures verbatim. Do not "fix" by weakening or skipping tests.
3. If `prisma/` changed: `prisma validate` and `prisma migrate diff` (no drift).
4. DoD checklist (answer each yes / no / n.a. with evidence, `file:line` or test name):
   - AC from the plan met · input validated at the boundary · authz + IDOR test for private resources
   - loading / empty / error states · keyboard + responsive (UI)
   - domain logic tested · no `any` / `@ts-ignore` without comment · no PII in logs
   - spec/ADR updated if behaviour changed · `docs/CONTEXT.md` updated
5. Output: a table of checks + a DoD table + verdict **DONE** or **NOT DONE** (with what is missing).
