Lint fixtures for `test/boundaries.test.ts`. The tree mirrors the repo layout so the real element
patterns match it; it is excluded from `pnpm lint` (root ESLint `ignores`) and from `tsc`.
Files named `*-ok`/without a violation must stay clean; every other file carries exactly one violation.
