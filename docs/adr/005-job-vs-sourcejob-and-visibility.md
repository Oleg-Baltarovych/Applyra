# 005. Job vs SourceJob, and job visibility

- Status: Accepted
- Date: 2026-11-16

## Context
- The same vacancy can appear in several sources (Greenhouse, Lever, Ashby, DOU) and can be captured manually by a user.
- Blueprint v1.0 had a many-to-many `job_source_links` table, although each publication belongs to exactly one vacancy (SPEC D8).
- It was unclear whether other users can see a manually captured job — a privacy problem (SPEC D9).
- Data model: `docs/spec/05-data-model.md`; dedup: `docs/spec/08-ingestion-matching.md`.

## Decision
Separate the **raw publication** (`SourceJob`) from the **canonical vacancy** (`Job`), and give `Job` an explicit **visibility**.
- `SourceJob`: one row per source record (`sourceId`, `externalId`, `canonicalUrl`, `rawPayload`, `contentHash`, seen/gone timestamps); `SourceJob.jobId` points to exactly one `Job` with `linkMethod` and `linkConfidence`. No link table.
- `Job.visibility ∈ {PUBLIC, PRIVATE}`; `ownerId` is NOT NULL ⇔ PRIVATE, enforced by CHECK constraint `job_visibility_owner_chk`.
- PUBLIC jobs come from ingestion (catalogue); PRIVATE jobs come from a user's manual/URL capture and are visible only to the owner.
- Per-user state lives in `UserJob(userId, jobId, savedAt, hiddenAt, viewedAt, …)` — independent flags (review A-21), separate from `Application.status` (SPEC D6).
- Capture dedup: if the canonical URL exists in the public catalogue, create a `UserJob` on the public job instead of a private copy.
- Private jobs are deduplicated only within the owner's data and against the public catalogue.
- Access to private jobs uses a dedicated ownership helper (by `ownerId`, not `userId`) with its own IDOR test (review A-09). Foreign resource → 404.

## Alternatives considered
- Many-to-many `job_source_links` — extra table for a one-to-many relation.
- One table for raw and canonical jobs — mixes source payload churn with user-facing data; dedup and "gone from feed" tracking become messy.
- All captured jobs public — leaks what a user is applying to.
- Per-user copies of public jobs — breaks dedup and matching across users.

## Consequences
- Positive: clear privacy boundary; dedup links are explicit and auditable; source health tracked per publication.
- Negative / trade-offs: every jobs query must combine visibility and ownership correctly; two access helpers (`userId`, `ownerId`).
- Follow-ups: add `Job.canonicalUrl` with a partial unique index (review A-08); make `SourceJob.externalId` NOT NULL (URL hash fallback) and add `missedRuns` (review A-11); dedup-levels ADR if the policy changes from the spec.
