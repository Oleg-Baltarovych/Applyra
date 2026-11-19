// `job` factory (M1-01): a PRIVATE job owned by `ownerId` (required override). Persists through the app-role client.
import type { AppPrisma, TxClient } from '../../src/platform/prisma/index.js';
import type { Job, WorkMode } from '../../src/platform/prisma/generated/client.js';
import { defineFactory } from './factory.js';
import { requireId } from './require-id.js';

export interface JobBuild {
  ownerId: string;
  companyNameRaw: string;
  title: string;
  normalizedTitle: string;
  descriptionText: string;
  workMode: WorkMode;
  canonicalUrl: string | null;
}

const WORK_MODES: readonly WorkMode[] = ['REMOTE', 'HYBRID', 'ONSITE'];

export const jobFactory = defineFactory<JobBuild, Job, AppPrisma | TxClient>({
  build: ({ seq, rng }) => {
    const title = `Backend Engineer ${String(seq)}`;
    return {
      ownerId: '',
      companyNameRaw: `Company ${String(seq)}`,
      title,
      normalizedTitle: title.toLowerCase(),
      descriptionText: `Description of job ${String(seq)}`,
      workMode: rng.pick(WORK_MODES),
      canonicalUrl: `https://jobs.example.test/${String(seq)}`,
    };
  },
  persist: (db, { ownerId, ...data }) =>
    db.job.create({
      data: {
        ...data,
        visibility: 'PRIVATE',
        ownerId: requireId(ownerId, 'ownerId', 'jobFactory'),
      },
    }),
});
