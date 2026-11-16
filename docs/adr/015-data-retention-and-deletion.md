# 015. Data retention and account deletion

- Status: Accepted
- Date: 2026-11-16

## Context
- Account deletion (R1) must remove all personal data and files within ≤ 24 h (soft delete → hard-delete job), covered by an E2E test.
- Review A-01: no FKs/`onDelete` were defined, so hard delete was undefined.
- Review S-12: deletion ignored backups, Sentry, logs, `AiRun`, Redis and export zips.
- Review S-13: recruiter contacts are personal data of third parties.
- Review S-14: `AuditLog` had no event list or retention.
- Full storage/retention table: `docs/spec/09-security-privacy.md`.

## Decision
Deletion is defined **per storage location** with explicit retention, driven by FK rules plus a deletion pipeline.
- Request: `user.deletedAt` set, sessions revoked, `UserDeletionRequested` event (ADR 006); hard delete completes ≤ 24 h and writes a `DeletedUserTombstone(id, deletedAt)`.
- Database: user-owned rows `onDelete: Cascade`; `Application.jobId` `SetNull`; `AuditLog.userId` `SetNull` with IP anonymised.
- Object storage: documents and export zips deleted; export links live 24 h.
- Redis: user keys (cache, rate limits) removed or expire; AI budget rows (`AiUsageDaily`) cascade with the user.
- AI runs (`AiRun`) deleted with the user; AI cache keys include `userId` (review A-14).
- Logs: redaction at write time; bounded retention.
- Sentry: PII scrubbing; bounded retention.
- Backups: not edited; deleted data ages out with backup retention (14 days); after any restore the users listed in `DeletedUserTombstone` (kept 30 days) are deleted again.
- Contacts (third-party PII): stored only for the owning user, deleted with the account, included in export.
- AuditLog: defined event list, append-only, 90-day retention.

## Alternatives considered
- Soft delete only — personal data kept indefinitely.
- Synchronous delete in the request — long-running, fragile with storage and Redis.
- Purging backups on every deletion — impractical; bounded backup retention used instead.

## Consequences
- Positive: deletion is verifiable per storage; privacy policy can state concrete retention periods.
- Negative / trade-offs: every new table/storage must be added to the retention table; backups retain deleted data until rotation.
- Follow-ups: deletion E2E test; privacy policy text before opening registration. Retention periods for logs, Sentry and backups are fixed in `docs/spec/09-security-privacy.md` §12.1.
