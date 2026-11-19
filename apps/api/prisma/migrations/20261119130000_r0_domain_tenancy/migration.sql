-- r0_domain_tenancy (M1-01 review): Reminder → Application becomes a composite FK (applicationId, userId) →
-- (id, userId) like ApplicationEvent, so a reminder can never point at another tenant's application (MATCH SIMPLE:
-- a NULL applicationId skips the check); index for that FK; Reminder.channels NOT NULL as a CHECK. Same PR as
-- r0_domain — the tables are still empty everywhere, so the in-transaction FK/index/CHECK cost nothing.

-- Migration timeouts (12-infra-ops.md §6): fail fast instead of queueing behind a lock.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

-- squawk: Reminder was created by r0_domain in the same release and holds no rows anywhere yet (never deployed),
-- so the scan/lock warnings below do not apply; the dropped FK is replaced by a stricter one in this file.

-- DropForeignKey
-- squawk-ignore ban-drop-constraint
ALTER TABLE "Reminder" DROP CONSTRAINT "Reminder_applicationId_fkey";

-- CreateIndex
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX "Reminder_applicationId_userId_idx" ON "Reminder"("applicationId", "userId");

-- AddForeignKey
-- squawk-ignore adding-foreign-key-constraint, constraint-missing-not-valid
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_applicationId_userId_fkey" FOREIGN KEY ("applicationId", "userId") REFERENCES "Application"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- 05 §7.4 · R0 · Reminder.channels is never NULL. A CHECK, not SET NOT NULL: Prisma models a scalar list as a
-- nullable column, so NOT NULL would show up as drift.
-- squawk-ignore constraint-missing-not-valid
ALTER TABLE "Reminder" ADD CONSTRAINT reminder_channels_chk CHECK ("channels" IS NOT NULL);
