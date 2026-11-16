## Summary

<!-- What and why, 1–3 lines. -->

Closes #
FR IDs / spec: <!-- e.g. FR-APP-03 · docs/spec/03-functional.md -->
Plan: <!-- docs/plans/... (if any) -->

## How it was verified

- [ ] `pnpm lint && pnpm typecheck && pnpm test` green for affected packages
- [ ] New/changed behaviour covered by tests (domain logic test-first)
- [ ] Screenshots / recording attached (UI changes)

## Security checklist

- [ ] Private endpoints scope data by `userId` (`findOwned*`); foreign resource → 404; IDOR test added
- [ ] Input validated at the boundary with schemas from `@applyra/contracts`; size/rate limits respected
- [ ] No secrets, tokens or PII in code, logs, errors or fixtures (synthetic data only)
- [ ] Untrusted content (HTML, recruiter text, URLs, files) handled per `docs/spec/09-security-privacy.md`
- [ ] New dependency? Reason stated here: <!-- or "none" -->

## Definition of Done

- [ ] Loading / empty / error states; keyboard accessible (UI)
- [ ] No `any` / `@ts-ignore` without a justification comment
- [ ] Migrations backward compatible; applied migrations untouched
- [ ] Spec / ADR updated if behaviour changed; `docs/CONTEXT.md` updated if structure/modules/commands changed
