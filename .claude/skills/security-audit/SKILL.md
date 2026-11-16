---
name: security-audit
description: Deep, costly security audit — run before a release (R0/R1/...) or after auth, capture, upload, or AI changes land. Not for every task.
disable-model-invocation: true
argument-hint: "[scope: module path or 'release'; default: changes since last tag]"
---
Scope: ${ARGUMENTS:-changes since the last git tag}. Warn the user up front that this uses many tokens, and confirm before starting.

1. Determine files: for a release, `git diff --name-only $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)...HEAD`; for a module, that path.
2. In parallel (one message):
   - `security-reviewer` on the scope with the full `docs/spec/09-security-privacy.md` checklist (incl. the OWASP mapping).
   - Trail of Bits `differential-review` skill on the same diff (blast radius, git history).
   - Trail of Bits `insecure-defaults` skill on config, env loading, auth and CORS/cookie setup.
3. Then run the built-in `/security-review` on the branch.
4. Check automated guards exist and pass: IDOR route-coverage test, SSRF negative tests, upload negative fixtures, security headers test, `pnpm audit` / dependency review.
5. Produce `docs/security/audit-<yyyy-mm-dd>.md`: findings (severity, `file:line`, exploit, fix, status), deduplicated across tools, plus a pass/fail of step 4. Summarize the criticals and highs to the user.
