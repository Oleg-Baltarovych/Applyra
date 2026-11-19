---
paths:
  - "**/test/**"
  - "**/*.test.ts"
---
# Testing rules

- Vitest unit tests for everything with logic: source parsers, normalize (salary/remote/experience), filter/score, dedup, format (escaping, 4096 split), state, telegram (stubbed `fetch`).
- Test-first for parsers, filters and dedup: write the failing test, see it fail for the expected reason, then implement.
- Pipeline: `run()` with `FakeSource`, a temp state file and a fake `send` — never the network.
- Source adapters: recorded feed fixtures in `apps/digest/test/fixtures/`, trimmed to a few items and free of personal data.
- A test must fail when the behaviour breaks. Assert outputs and side effects, not implementation calls. Delete tests that pass against an empty implementation.
- Builders for test data (`test/support/vacancy.ts`); fixed dates (`now` passed in), no real clock.
