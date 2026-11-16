# 020. Documentation language and structure

- Status: Accepted
- Date: 2026-11-16

## Context
- `docs/SPEC.md` v2.0 is a single ~1350-line Ukrainian document; agents must read only relevant ranges, and every edit risks conflicts.
- Open question Q2: language of spec, README and code. The repo is public from day one (Q5) and targets international employers.
- Review decisions §4.8 and §4.10.

## Decision
Split the spec into topic files under `docs/spec/` (v2.1); keep the spec in **Ukrainian** with an **English overview**; write code, README and ADRs in **English**.
- Files: `00-overview` (English summary for the public repo), `01-product`, `02-releases`, `03-functional`, `04-architecture`, `05-data-model`, `06-api`, `07-ai`, `08-ingestion-matching`, `09-security-privacy`, `10-frontend-ux`, `11-testing`, `12-infra-ops`.
- `docs/SPEC.md` v2.0 is superseded by `docs/spec/`; it remains available in git history.
- ADRs in `docs/adr/` (ADR 000), English, referencing spec files by name.
- `docs/CONTEXT.md` stays the entry point for agents (status, repo map, key decisions).
- Code identifiers, comments, commit messages and README: English.

## Alternatives considered
- Keep one SPEC file — large reads for agents, merge conflicts, hard navigation.
- Translate the whole spec to English now — significant effort before any code; the author works faster in Ukrainian.
- Everything in Ukrainian — weaker for international reviewers of a public portfolio repo.

## Consequences
- Positive: agents load only the needed file; public readers get an English overview and English ADRs.
- Negative / trade-offs: two languages in `docs/`; the English overview can drift from Ukrainian detail files.
- Follow-ups: update `CLAUDE.md` and `docs/CONTEXT.md` references from `docs/SPEC.md` sections to `docs/spec/*.md`; decide whether to translate the full spec before wider publication.
