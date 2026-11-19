// `applicationEvent` factory (M1-01): a NOTE on `applicationId` by `userId` (both required overrides; same tenant —
// the composite FK rejects anything else).
import type { AppPrisma, TxClient } from '../../src/platform/prisma/index.js';
import type { ApplicationEvent } from '../../src/platform/prisma/generated/client.js';
import { defineFactory } from './factory.js';
import { requireId } from './require-id.js';

export interface ApplicationEventBuild {
  userId: string;
  applicationId: string;
  type: 'CREATED' | 'NOTE';
  payload: { text: string };
  occurredAt: Date;
}

const BASE_TIME = Date.UTC(2026, 0, 1);

export const applicationEventFactory = defineFactory<
  ApplicationEventBuild,
  ApplicationEvent,
  AppPrisma | TxClient
>({
  build: ({ seq }) => ({
    userId: '',
    applicationId: '',
    type: 'NOTE',
    payload: { text: `Note ${String(seq)}` },
    occurredAt: new Date(BASE_TIME + seq * 60_000),
  }),
  persist: (db, { userId, applicationId, ...data }) =>
    db.applicationEvent.create({
      data: {
        ...data,
        userId: requireId(userId, 'userId', 'applicationEventFactory'),
        applicationId: requireId(applicationId, 'applicationId', 'applicationEventFactory'),
      },
    }),
});
