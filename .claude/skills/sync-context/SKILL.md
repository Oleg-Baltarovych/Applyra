---
name: sync-context
description: Refresh docs/CONTEXT.md from the actual repo state (cheap, structural only).
disable-model-invocation: true
---
1. Gather facts cheaply — no full file reads: `git log --oneline -15`, the top-level tree (`apps/*`, `packages/*`, `apps/api/src/modules/*`), the `scripts` from root and package `package.json` files, the list of `docs/adr/` and `docs/plans/`.
2. Update `docs/CONTEXT.md`: Status, Repo map (mark ✅ what exists), Module status, Commands (also sync them into the CLAUDE.md "Commands" section), Key decisions (one line per ADR). Keep Gotchas; drop the ones that are no longer true.
3. Keep the file under ~150 lines. Update "Last updated". Show the user a short diff summary.
