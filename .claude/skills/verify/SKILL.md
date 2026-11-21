---
name: verify
description: Definition-of-Done gate — run the checks and a dry run, walk the short DoD checklist.
---
1. Run `pnpm check` (lint, format:check, typecheck, test). Quote failures verbatim. Do not "fix" by weakening or skipping tests.
2. If the pipeline, a source or the format changed: `pnpm --filter @applyra/digest dry-run` and check the output.
3. If `.github/workflows/**` changed: actionlint (command in `docs/CONTEXT.md`).
4. DoD (yes / no / n.a. with evidence, `file:line` or test name):
   - task criteria met · parsers/filters/dedup tested (test-first) · no `any` / `@ts-ignore` without comment
   - no secrets/personal data in code, logs, fixtures · sources respect ToS (public feeds only)
   - `docs/spec.md` / ADR updated if behaviour changed · `docs/CONTEXT.md` updated
5. Output: a checks table + a DoD table + verdict **DONE** or **NOT DONE** (with what is missing).
