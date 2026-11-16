# AI-assisted workflow

Applyra is built with Claude Code. The configuration is committed so the workflow is reproducible and reviewable.

## Context layers (cheapest first)
| Layer | Loaded | Purpose |
|---|---|---|
| `CLAUDE.md` | every session (~70 lines) | non-negotiable rules, commands, where to look |
| `docs/CONTEXT.md` | on demand, read first | status, repo map, module status, decisions, gotchas, SPEC index |
| `.claude/rules/*.md` | automatically when matching files are touched | area rules: backend, frontend, contracts, prisma, security, testing, ai |
| `docs/SPEC.md` | only the needed section | full product/engineering spec (source of truth) |
| `.claude/skills/*` | body loads only when invoked | repeatable procedures |

## Project agents (`.claude/agents/`)
| Agent | Access | When |
|---|---|---|
| `security-reviewer` | read-only | after changes to controllers, auth, capture, uploads, AI, config |
| `code-reviewer` | read-only | before a backend/contracts task is done |
| `ui-reviewer` | read-only | before a web UI task is done |
| `test-writer` | edits tests only, runs tests | test-first for domain logic, IDOR suites |

## Project skills (`.claude/skills/`)
`/new-endpoint` · `/prisma-migration` · `/adr` · `/ai-task`

## Guardrails (`.claude/settings.json`, `.claude/hooks/`)
- Hook blocks edits to `.env*` and to applied Prisma migrations.
- Hook runs Prettier on each edited file.
- Permissions: read-only/test commands allowed; dependency changes, migrations, commits, pushes ask; force-push, hard reset, volume deletion denied.

## External tooling
Plugins are enabled at project scope in `.claude/settings.json` (`enabledPlugins`, `extraKnownMarketplaces`). On a fresh clone, trust the folder and run
`claude plugin install <name>@<marketplace> --scope project` for each entry (enabling does not download). The shadcn skill is vendored in `.claude/skills/shadcn` (pinned in `skills-lock.json`).

| Tool | Area | Install | Note |
|---|---|---|---|
| superpowers | workflow: plan, TDD, debugging, verification | `/plugin marketplace add obra/superpowers-marketplace` → `/plugin install superpowers@superpowers-marketplace` | adds a small always-on SessionStart prompt |
| pr-review-toolkit | review: silent failures, type design, test coverage | `/plugin install pr-review-toolkit@claude-plugins-official` | |
| typescript-lsp | navigation/types across the monorepo | `/plugin install typescript-lsp@claude-plugins-official` | |
| frontend-design | UI quality | `/plugin install frontend-design@claude-plugins-official` | |
| shadcn skill | shadcn/ui usage | `npx skills add shadcn/ui` | runs `npx shadcn@latest` |
| Context7 | up-to-date library docs | `/plugin install context7@claude-plugins-official` (hosted MCP) | queries leave the machine |
| Playwright Test Agents | e2e planner/generator/healer | `npx playwright init-agents --loop=claude` | **pending**: run once `@playwright/test` is in the repo |
| Trail of Bits `insecure-defaults`, `differential-review` | security | `/plugin marketplace add trailofbits/skills` | install only these two |
| Built-in `/security-review`, `/code-review`, `/simplify` | review | built in | run on every PR |

Later: `security-guidance` (always-on security hooks, costly) once auth/capture/uploads land; `claude-security` scans before releases; `prisma/skills` if on Prisma 7.

Evaluated and adopted selectively: [unclebob/ub-mode](https://github.com/unclebob/ub-mode) — its principles are folded into `CLAUDE.md` (test-first for domain logic, boundary validation, no silenced compiler, root-cause fixes). Not installed as-is: it allows the agent to push to main and delete files without asking.
