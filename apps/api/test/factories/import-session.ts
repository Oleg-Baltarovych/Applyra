// `importSession` factory (M1-01): a PREVIEWED CSV import of `userId` (required override).
import type { AppPrisma, TxClient } from '../../src/platform/prisma/index.js';
import type { ImportSession } from '../../src/platform/prisma/generated/client.js';
import { defineFactory } from './factory.js';
import { requireId } from './require-id.js';

export interface ImportSessionBuild {
  userId: string;
  fileName: string;
  fileSha256: string;
  rowCount: number;
  mapping: { columns: Record<string, string> };
  expiresAt: Date;
}

const BASE_TIME = Date.UTC(2026, 0, 1);

export const importSessionFactory = defineFactory<
  ImportSessionBuild,
  ImportSession,
  AppPrisma | TxClient
>({
  build: ({ seq, rng }) => ({
    userId: '',
    fileName: `applications-${String(seq)}.csv`,
    fileSha256: String(seq).padStart(64, '0'),
    rowCount: rng.int(1, 200),
    mapping: { columns: { company: 'Company', role: 'Role' } },
    expiresAt: new Date(BASE_TIME + 86_400_000),
  }),
  persist: (db, { userId, ...data }) =>
    db.importSession.create({
      data: { ...data, userId: requireId(userId, 'userId', 'importSessionFactory') },
    }),
});
