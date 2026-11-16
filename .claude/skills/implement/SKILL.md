---
name: implement
description: Implement an approved plan with the lead-developer agent, then review and verify.
disable-model-invocation: true
argument-hint: "<docs/plans/....md> [step range]"
---
1. Check that `$ARGUMENTS` points to an existing plan in `docs/plans/`. If not, list the plans and ask which one.
2. Launch `lead-developer` with the plan path (and step range if given).
3. Run `/review`, then `/verify`. Send any blockers back to `lead-developer` once.
4. Launch `qa-lead` with the plan path and review findings; on REJECTED send the list back to `lead-developer` once.
5. Report the result and suggest `/ship`.
