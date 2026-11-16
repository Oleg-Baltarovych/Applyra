# 003. PostgreSQL FTS + trigram instead of a search engine

- Status: Accepted
- Date: 2026-11-16

## Context
- Jobs search (R1) covers title, company, skills, description, with partial matches and typos (see `docs/spec/03-functional.md`, Jobs / Discover).
- Data volume at MVP scale is small (thousands to tens of thousands of jobs).
- Job texts mix English, Ukrainian and Russian; PostgreSQL has no built-in Ukrainian dictionary.
- NFR target: p95 search ≤ 600 ms (see `docs/spec/12-infra-ops.md`).
- Every additional stateful service costs money and ops time on a single VPS (ADR 011).

## Decision
Search is implemented in PostgreSQL with **full-text search** plus **`pg_trgm`** and **`unaccent`**.
- `Job.search_vector` is a `tsvector GENERATED ALWAYS AS (...) STORED` column using the `simple` config, weighted A (title), B (company), C (description), with an IMMUTABLE `f_unaccent` wrapper.
- GIN indexes: `search_vector`, `normalizedTitle gin_trgm_ops`, `Company.normalizedName gin_trgm_ops`.
- Created via raw SQL migrations and queried via typed `$queryRaw` helpers (ADR 016).
- The same `pg_trgm` extension can later back similarity dedup (deferred to Later by A-23, `docs/spec/08-ingestion-matching.md` §6).
- Details: `docs/spec/05-data-model.md`.

## Alternatives considered
- Elasticsearch / OpenSearch — heavy memory footprint, separate sync pipeline, overkill at this scale.
- Meilisearch / Typesense — good typo tolerance, but an extra service plus index synchronisation and consistency problems with visibility/ownership filters.
- `ILIKE` only — no ranking, poor performance without trigram indexes.

## Consequences
- Positive: one datastore; search results are transactionally consistent with visibility and `userId` scoping; no sync jobs.
- Negative / trade-offs: no stemming (`simple` config); relevance tuning is manual; Prisma cannot model `tsvector` natively (`Unsupported`, drift handling in ADR 016).
- Follow-ups (keyset/bounded-offset pagination for relevance and salary sort is fixed in `docs/spec/06-api.md` §2, A-18): revisit if p95 search exceeds the NFR at real volume.
