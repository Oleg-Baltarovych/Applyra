# 000. Record architecture decisions

- Status: Accepted
- Date: 2026-11-16

## Context
- Applyra is a solo, portfolio-grade project developed together with AI coding agents (see `docs/AI-WORKFLOW.md`).
- Agents and future readers (reviewers, interviewers) need the "why" behind stack, data and security choices; the spec describes "what".
- SPEC v2.0 §21 planned a minimal ADR set; the SPEC review (`docs/SPEC-REVIEW.md` §4) added decisions that also need a durable record.

## Decision
We record every significant architecture decision as a Markdown ADR in `docs/adr/`.
- File name: `NNN-kebab-title.md`, 3-digit zero-padded number, assigned sequentially (max + 1). Numbers are never reused.
- Template (from `.claude/skills/adr/SKILL.md`): title, Status, Date, Context, Decision, Alternatives considered, Consequences (Positive / Negative / Follow-ups).
- Status values: `Proposed` → `Accepted`; a replaced ADR becomes `Superseded by NNN` and is not edited otherwise.
- Superseding: write a new ADR that references the old one; update the old one's Status line only.
- Language: English (see ADR 020). Length: ~60 lines, facts over prose.
- If an ADR changes behaviour described in the spec, the relevant `docs/spec/*.md` file is updated in the same change, and a one-line entry is added to "Key decisions" in `docs/CONTEXT.md`.
- `docs/adr/README.md` holds the index (number, title, status, one-line decision).
- New ADRs are written with the `/adr` procedure.

## Alternatives considered
- Decisions only inside the spec — mixes "what" and "why"; history of reversals is lost.
- Wiki / external tool — not versioned with code, invisible to agents working in the repo.
- Heavier templates (MADR full, Y-statements) — overhead for a solo project.

## Consequences
- Positive: decisions are reviewable in PRs, discoverable by agents, and usable as portfolio material.
- Negative / trade-offs: extra writing per decision; risk of drift between ADRs and spec if the update rule is skipped.
- Follow-ups: numbering here differs from the SPEC v2.0 §21 planned list (new decisions from the review were inserted; dedup levels are covered in `docs/spec/08-ingestion-matching.md`, not a separate ADR yet).
