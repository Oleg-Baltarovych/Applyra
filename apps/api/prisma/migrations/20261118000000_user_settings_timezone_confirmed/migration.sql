-- M0-11 (FR-PROF-01): UserSettings.timezoneConfirmed — false until a PATCH /me/settings sets `timezone`; the web pushes
-- the browser zone only while it is false (tells the DB default `UTC` from a chosen `UTC`).

-- Migration timeouts (12-infra-ops.md §6): fail fast instead of queueing behind a lock.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

-- AlterTable — constant default: metadata-only on PG 18 (no table rewrite).
ALTER TABLE "UserSettings" ADD COLUMN     "timezoneConfirmed" BOOLEAN NOT NULL DEFAULT false;
