// `idempotencyRecord` factory (M1-01): a completed record (201 + response) of `userId` (required override).
import type { AppPrisma, TxClient } from '../../src/platform/prisma/index.js';
import type { IdempotencyRecord } from '../../src/platform/prisma/generated/client.js';
import { defineFactory } from './factory.js';
import { requireId } from './require-id.js';

export interface IdempotencyRecordBuild {
  userId: string;
  key: string;
  route: string;
  requestHash: string;
  statusCode: number;
  responseJson: { id: string };
  expiresAt: Date;
}

const BASE_TIME = Date.UTC(2026, 0, 1);

export const idempotencyRecordFactory = defineFactory<
  IdempotencyRecordBuild,
  IdempotencyRecord,
  AppPrisma | TxClient
>({
  build: ({ seq }) => ({
    userId: '',
    key: `idem-key-${String(seq).padStart(4, '0')}`,
    route: 'POST /api/v1/applications',
    requestHash: String(seq).padStart(64, 'f'),
    statusCode: 201,
    responseJson: { id: `response-${String(seq)}` },
    expiresAt: new Date(BASE_TIME + 86_400_000),
  }),
  persist: (db, { userId, ...data }) =>
    db.idempotencyRecord.create({
      data: { ...data, userId: requireId(userId, 'userId', 'idempotencyRecordFactory') },
    }),
});
