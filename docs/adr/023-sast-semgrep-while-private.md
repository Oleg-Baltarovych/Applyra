# 023. SAST: Semgrep CE while the repository is private

- Status: Accepted
- Date: 2026-11-17
- Amends: `docs/spec/09-security-privacy.md` §14 (SAST row), `11-testing.md` §9, `12-infra-ops.md` §8.1.

## Context
- The spec planned CodeQL (`javascript-typescript`, PR + weekly) as the R0 SAST gate.
- The repository stays private (author decision 2026-11-17; branch protection is deferred for the same reason, see M0-05).
- CodeQL code scanning is free only for public repositories; private repositories need GitHub Team/Enterprise plus GitHub Code Security. The CodeQL CLI licence also covers only public repositories or licensed customers ([GitHub docs: "Cannot enable CodeQL in a private repository"](https://docs.github.com/en/code-security/how-tos/scan-code-for-vulnerabilities/troubleshooting/troubleshooting-analysis-errors/cannot-enable-codeql-in-a-private-repository)).

## Decision
- SAST in CI = **Semgrep CE** (open-source CLI, community rulesets, no login / no Semgrep AppSec Platform, `--metrics=off`). Any finding fails the job; suppressions are inline `nosemgrep` with a reason.
- Runs on PR and weekly; part of the R0 supply-chain gate together with osv-scanner, `pnpm audit` and gitleaks; a required check once branch protection is enabled.
- When the repository becomes public, add CodeQL (`javascript-typescript`, PR + weekly, `security-events: write` per job) and decide whether it replaces Semgrep or runs alongside.

## Alternatives considered
- Pay for GitHub Team + Code Security to run CodeQL privately — recurring cost for a solo portfolio project (conflicts with ADR 022 €0 goal).
- Defer SAST until the repository is public — leaves R0 without any static analysis gate; Semgrep CE costs nothing to add now.

## Consequences
- Positive: €0, no account or token, runs locally the same as in CI, keeps the R0 gate complete.
- Negative / trade-offs: rule coverage differs from CodeQL (pattern-based, no CodeQL-grade interprocedural dataflow/taint in CE); results are not shown in GitHub code scanning UI (job log / SARIF artifact only); registry rule packs are fetched unpinned at runtime — accepted (rules are declarative YAML, no autofix; a semgrep.dev outage fails closed; results may change week to week, which the weekly run intends). If reproducibility becomes a problem, vendor the packs into `.semgrep/rules/` and refresh them via a scheduled PR.
- Follow-ups: revisit when the repo goes public (add CodeQL, compare findings, keep or drop Semgrep).
