# 017. AI provider abstraction and task registry

- Status: Accepted
- Date: 2026-11-16

## Context
- AI features: `extract-job` in capture (R1), then analyze-job, tailor CV, cover letter, recruiter reply, interview prep (R3) (see `docs/spec/07-ai.md`).
- Open question Q4: LLM provider — any with structured output; must be changeable.
- Untrusted job/recruiter text is passed to the model → prompt-injection risk.
- Review A-13/A-14/A-15: budget check-then-call races, cache without `userId`/model, "AI disabled" checked only at route level.

## Decision
All LLM calls go through an **`AIProvider` interface** and a **task registry**; the concrete provider is chosen in **M4 by running the golden set** against candidates.
- `AIProvider.generateStructured(...)` returns raw JSON + usage (exact signature in `docs/spec/07-ai.md` §3); embeddings via a separate `EmbeddingProvider` (R3).
- `ModelTier = 'fast' | 'smart'`; tier → concrete model mapping lives in config, not in task code.
- Each task is `ai/tasks/<task>.task.ts` via `defineTask` (name, `promptVersion`, tier, Zod input/output with evidence fields, `buildContext`, system prompt, limits).
- Executor: policy (`AI_MODE`, global cap, AI-enabled, allowed fields) → cache lookup (key includes `userId`, model, task, `promptVersion`, context hash) → **atomic budget reservation** (conditional `UPDATE` of `AiUsageDaily` / `AiGlobalUsageDaily` in PostgreSQL) → call → Zod validation (1 repair attempt, then `AI_INVALID_OUTPUT`) → settle + `AiRun` record.
- The "AI disabled" setting is enforced in the executor, so internal callers (capture) respect it.
- Minimal context; PII stripped unless required; untrusted text in delimited "treat as data" blocks; R3 tasks have no tools; schemas forbid URL/HTML fields where not needed.
- LLM-extracted fields are never saved without user confirmation.
- One route per AI task (review A-17).

## Alternatives considered
- Calling a provider SDK directly from modules — lock-in, no central budget/caching/logging.
- Framework (LangChain, etc.) — large dependency for structured single-shot calls.
- Choosing the provider now — no data yet; the golden set gives an evidence-based choice.

## Consequences
- Positive: provider swap is a config change; every call is budgeted, cached, validated and logged.
- Negative / trade-offs: abstraction lowest-common-denominator over provider-specific features.
- Follow-ups: provider selection in M4 using `ai/evals/` (≥ 20 jobs for `extract-job`, ≥ 10 for `analyze-job`); **provider data retention** (no-training API, zero/limited retention) is part of the M4 choice and must be recorded in `docs/spec/09-security-privacy.md` §12.1. Resolved: per-user/demo limits as env defaults (`docs/spec/07-ai.md` §4), `AiUsageDaily` + `AiGlobalUsageDaily` models (`docs/spec/05-data-model.md`), AI output without remote images (AI-01).
