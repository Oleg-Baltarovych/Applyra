## Summary

<!-- What and why, 1–3 lines. -->

## How it was verified

- [ ] `pnpm lint && pnpm typecheck && pnpm test` green
- [ ] Parser / filter / dedup changes covered by tests (test-first)
- [ ] `pnpm --filter @applyra/digest dry-run` output looks right (if pipeline/format changed)

## Checklist

- [ ] No secrets, tokens, chat ids or personal data in code, logs, fixtures or the profile
- [ ] New source: public feed/API only, no ToS/auth/CAPTCHA bypass, ≤ 1 request per feed per run
- [ ] New dependency? Reason: <!-- or "none" -->
- [ ] `docs/spec.md` / ADR updated if behaviour changed; `docs/CONTEXT.md` if structure/commands changed
