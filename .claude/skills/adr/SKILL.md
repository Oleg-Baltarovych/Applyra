---
name: adr
description: Write an Architecture Decision Record in docs/adr for Applyra. Use when a technical decision is made or changed (stack choice, data model, security policy, hosting).
argument-hint: "<short-kebab-title>"
---
# ADR: $ARGUMENTS

1. Next number: list `docs/adr/` and take max + 1 (3 digits). Check SPEC §21 for the planned ADR list and reuse its number/title if it matches.
2. Create `docs/adr/NNN-<title>.md` in English:

```markdown
# NNN. <Title>

- Status: Proposed | Accepted | Superseded by NNN
- Date: YYYY-MM-DD

## Context
<forces, constraints, what problem; link SPEC §>

## Decision
<the choice, stated in one or two sentences, then specifics>

## Alternatives considered
- <option> — <why not>

## Consequences
- Positive: …
- Negative / trade-offs: …
- Follow-ups: …
```

3. Keep it under ~60 lines; facts over prose.
4. If the decision changes behaviour described in SPEC, update that SPEC section in the same change.
5. Add a one-line entry to "Key decisions" in `docs/CONTEXT.md`.
