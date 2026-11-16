---
name: feature
description: Full feature flow — plan (architect) → user approval → implement (lead-developer) → review → verify.
disable-model-invocation: true
argument-hint: "<feature or FR ID, e.g. 'applications kanban (FR-APP)'>"
---
# Feature: $ARGUMENTS

Run these stages in order. Keep the main thread small: delegate, then relay summaries.

1. **Plan** — launch the `architect` agent with the feature text. Show the user the plan path, the summary and the open questions.
   **Stop and wait for the user's approval** (or answers) before continuing. If they request changes, send them to the architect again.
2. **Implement** — launch `lead-developer` with the approved plan path. For domain logic it may use `test-writer` for test-first.
3. **Review** — run `/review` on the resulting changes. Send blocker/should-fix findings back to `lead-developer` in one batch; repeat review at most once more.
4. **Verify** — run `/verify`. If red, return to step 2 with the failure output.
5. **Accept** — launch `qa-lead` with the plan path and the review findings. If REJECTED, send the missing list to `lead-developer` and repeat from step 3 (max 2 loops, then stop and ask the user).
6. **Report** to the user: what was built, the checks with results, the review and QA verdicts, follow-ups. Suggest `/ship` — do not commit yourself.
