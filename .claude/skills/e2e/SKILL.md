---
name: e2e
description: Create or repair Playwright e2e tests for a user flow with the Playwright planner → generator → healer agents.
disable-model-invocation: true
argument-hint: "<flow, e.g. 'drag application to INTERVIEW' | heal>"
---
Flow: $ARGUMENTS

Preconditions: the app runs locally (`docker compose up -d`, `pnpm dev`) and `@playwright/test` is installed. If not, tell the user what to start and stop.
Only the critical flows listed in `docs/spec/11-testing.md` deserve e2e; for anything else suggest a component/integration test instead.

- New flow: `playwright-test-planner` → plan saved in `e2e/specs/`; show it to the user. Then `playwright-test-generator` for each scenario of the approved plan → tests in `e2e/`.
- `heal` (or failing e2e): `playwright-test-healer` on the failing tests.
- Then run `pnpm exec playwright test <files>` and report results. Tests must use role/label locators and no fixed timeouts.
