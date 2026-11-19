// `application` factory (M1-01): owned by `userId` (required override), optionally linked to a job.
import type { AppPrisma, TxClient } from '../../src/platform/prisma/index.js';
import type { Application, ApplicationStatus } from '../../src/platform/prisma/generated/client.js';
import { defineFactory } from './factory.js';
import { requireId } from './require-id.js';

export interface ApplicationBuild {
  userId: string;
  jobId: string | null;
  companyName: string;
  roleTitle: string;
  status: ApplicationStatus;
  archivedAt: Date | null;
}

const STATUSES: readonly ApplicationStatus[] = ['WISHLIST', 'APPLIED', 'SCREENING', 'INTERVIEW'];

export const applicationFactory = defineFactory<
  ApplicationBuild,
  Application,
  AppPrisma | TxClient
>({
  build: ({ seq, rng }) => ({
    userId: '',
    jobId: null,
    companyName: `Company ${String(seq)}`,
    roleTitle: `Engineer ${String(seq)}`,
    status: rng.pick(STATUSES),
    archivedAt: null,
  }),
  persist: (db, { userId, ...data }) =>
    db.application.create({
      data: { ...data, userId: requireId(userId, 'userId', 'applicationFactory') },
    }),
});
