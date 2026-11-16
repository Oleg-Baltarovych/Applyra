# 018. Deterministic matching v1

- Status: Accepted (implemented in R2)
- Amended: 2026-11-16 — job triggers go through the skills consumer (`matching:job`), not directly from the outbox; profile debounce 5 min (FR-PROF-06)
- Date: 2026-11-16

## Context
- Users need a job ↔ profile score with an explanation they can trust (see `docs/spec/08-ingestion-matching.md`).
- An LLM-based score is costly per job × user pair, non-deterministic and hard to unit-test (SPEC D4).
- Profiles and jobs are often incomplete; missing data must not look like a bad match.

## Decision
Matching v1 is a **deterministic weighted score** over components, each returning `{ score: 0..1 | null, weight, evidence[] }` (`null` = unknown).
- Weights: Skills 0.35, Seniority 0.20, Salary 0.15, Work mode / location 0.15, Language 0.10, Employment type 0.05.
- Skills: required match share (aliases, level ≥ 2) × 0.8 + nice-to-have × 0.2; AVOID skill in required → −0.15.
- Seniority by ordinal distance (0 → 1.0, 1 → 0.6, ≥ 2 → 0.1); salary in USD/month (ADR 019); language by CEFR.
- `score = round(100 · Σ(w·s over known) / Σ(w over known))`; `confidence = Σ(w over known) / Σ(w over all)`.
- Hard-filter violation → `excluded`, `score = null`, `excludedReasons`; `confidence < 0.4` → UI shows "Not enough data".
- Components are pure `*.domain.ts` functions; result stored in `MatchScore` (PK `userId, jobId`) with `algorithmVersion` and `inputsHash` (skip recalculation if unchanged).
- Triggers: `JobCreated/Updated` → skills consumer extracts `JobSkill`, then enqueues `matching:job` (so matching sees fresh skills; `docs/spec/04-architecture.md` §5.3); `ProfileUpdated` → `matching:profile`, debounced to at most once per 5 min per user. Events travel via the outbox (ADR 006).
- Skill extraction from jobs: `SkillAlias` dictionary + word-boundary regex; LLM refinement in R3.
- R3 adds a semantic component (pgvector cosine, weight 0.15 taken from Skills) under a new `algorithmVersion`.

## Alternatives considered
- LLM scoring per pair — cost, latency, non-reproducible, hard to explain.
- Embeddings-only similarity — opaque, no per-component evidence; planned as an additional component in R3.
- Unweighted filter-only matching — no ranking.

## Consequences
- Positive: reproducible, unit-testable, explainable without an LLM; cheap to recompute.
- Negative / trade-offs: weights are hand-tuned; quality depends on the skills dictionary.
- Follow-ups: tune weights using match feedback (R2); recalculation fan-out limits as users grow.
