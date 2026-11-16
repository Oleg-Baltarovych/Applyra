---
name: bugfix
description: Fix a bug test-first — reproduce with a failing test, fix the root cause, review, verify.
disable-model-invocation: true
argument-hint: "<bug description / issue / error output>"
---
Bug: $ARGUMENTS

1. Locate: use `docs/CONTEXT.md` to find the module; read only the relevant files. State the hypothesis of the root cause.
2. Reproduce: write the smallest test that fails because of this bug (use `test-writer` if it is a larger setup). Run it; confirm it fails for the expected reason. If you cannot reproduce, stop and report what you tried.
3. Fix the cause, not the symptom — no guards that only hide the crash. Smallest change.
4. Run the test + the affected package's suite. Then `/review` on the changed files.
5. Add a line to `docs/CONTEXT.md` → Gotchas if the bug reveals a non-obvious trap.
6. Report: root cause, fix, test name, checks. Suggest `/ship`.
