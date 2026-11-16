# AI-assisted workflow

Applyra is built with Claude Code. The configuration is committed so the workflow is reproducible and reviewable.

## Context layers (cheapest first)
| Layer | Loaded | Purpose |
|---|---|---|
| `CLAUDE.md` | every session (~70 lines) | non-negotiable rules, commands, where to look |
| `docs/CONTEXT.md` | on demand, read first | status, repo map, module status, decisions, gotchas, SPEC index |
| `.claude/rules/*.md` | automatically when matching files are touched | area rules: backend, frontend, contracts, prisma, security, testing, ai |
| `docs/spec/NN-*.md` | only the file (and section) needed | split product/engineering spec v2.1 (source of truth) + `docs/adr/` |
| `docs/plans/*.md` | per task | architect's implementation plan for one feature |
| `.claude/skills/*` | body loads only when invoked | flow commands and procedures |

Token budget rules: agent descriptions are always in context, so they are one short sentence each; flow commands use
`disable-model-invocation: true` (zero cost until you type them); heavy tools run only on explicit triggers (see Guardrails).

## Team — who owns what
| Agent | Model | Access | Owns | Never does |
|---|---|---|---|---|
| `architect` | opus | read + write `docs/` only | plans, ADRs, SPEC/CONTEXT consistency, module & data design | application code |
| `lead-developer` | inherit | full (no git commit/push) | implementing approved plans: contracts, api, worker, web, CI/infra | redesign without the architect, commits |
| `test-writer` | sonnet | edits tests only, runs tests | test-first for domain logic, IDOR suites, integration tests | production code |
| `code-reviewer` | sonnet | read-only | boundaries, layering, transactions/outbox, types, test quality | edits |
| `security-reviewer` | sonnet | read-only | IDOR, SSRF, auth/CSRF, uploads, injection, secrets/PII | edits |
| `ui-reviewer` | sonnet | read-only | UX states, WCAG 2.2 AA, data-fetching patterns, tokens | edits |
| `playwright-test-planner/generator/healer` | sonnet | browser via MCP | e2e plans, e2e tests, fixing flaky e2e | unit/integration tests |
| `qa-lead` | sonnet | read-only + runs checks | final acceptance: every AC has code + a failing-without-it test, review findings resolved, scope respected | fixes |

The main session is the orchestrator (subagents cannot spawn subagents): it routes work, enforces the gates (`/verify` → `qa-lead`) and stops for user approval at plan and ship.

## Flow commands (`/name`)
| Command | When | Agents involved |
|---|---|---|
| `/feature <task>` | any non-trivial feature | architect → **you approve** → lead-developer (+ test-writer) → reviewers → verify → qa-lead |
| `/plan <task>` | design only | architect |
| `/implement <plan>` | plan already approved | lead-developer → reviewers → verify |
| `/review [base]` | before verify/ship | only the reviewers matching the touched paths, in parallel |
| `/verify` | Definition-of-Done gate | none (runs lint/typecheck/test + DoD checklist) |
| `/ship [issue]` | commit + PR | verify → drafts → **you approve** → commit/push/PR |
| `/bugfix <bug>` | bugs | failing test first → fix → review |
| `/e2e <flow>` | critical flows only (SPEC §14) | Playwright planner → generator → healer |
| `/security-audit [scope]` | before each release, after auth/capture/upload/AI land | security-reviewer + Trail of Bits + built-in `/security-review` |
| `/sync-context` | after structural changes | none (refreshes `docs/CONTEXT.md`) |

Procedures used inside flows (model-invocable): `/new-endpoint`, `/prisma-migration`, `/adr`, `/ai-task`, `shadcn`.

## Guardrails (`.claude/settings.json`, `.claude/hooks/`)
- Hook blocks edits to `.env*` and applied Prisma migrations; hook runs Prettier on each edited file.
- Permissions: read-only/test commands allowed; dependency changes, migrations, commits, pushes ask; force-push, hard reset, volume deletion denied.
- `security-guidance` plugin: free local regex warnings on edits; LLM review **only on `git commit` / `git push`** (`ENABLE_STOP_REVIEW=0` turns off the per-turn review).

## Plugins & external tools
Enabled at project scope (`enabledPlugins`, `extraKnownMarketplaces` in `.claude/settings.json`). On a fresh clone: trust the folder, then
`claude plugin install <name>@<marketplace> --scope project` for each entry (enabling does not download).

| Tool | Area |
|---|---|
| superpowers | planning, TDD, systematic debugging, verification |
| pr-review-toolkit | silent-failure hunter, type-design and test-coverage analyzers |
| typescript-lsp | type-aware navigation across the monorepo |
| frontend-design | UI quality |
| context7 | current library docs (hosted MCP; queries leave the machine) |
| Trail of Bits `insecure-defaults`, `differential-review` | security (used by `/security-audit`) |
| security-guidance | commit/push security review (see Guardrails) |
| shadcn skill | vendored in `.claude/skills/shadcn`, pinned in `skills-lock.json` |
| Playwright Test Agents | `.claude/agents/playwright-test-*`, `.mcp.json`; regenerate with `npx playwright init-agents --loop=claude` after a Playwright upgrade |

Evaluated and adopted selectively: [unclebob/ub-mode](https://github.com/unclebob/ub-mode) — its principles are folded into `CLAUDE.md`. Not installed as-is: it lets the agent push to main and delete files without asking.
