// `reminder` factory (M1-01): a PENDING MANUAL reminder of `userId` (required override), optionally on an
// application. NEXT_ACTION rows need `applicationId` (reminder_source_link_chk).
import type { AppPrisma, TxClient } from '../../src/platform/prisma/index.js';
import type {
  Reminder,
  ReminderKind,
  ReminderSource,
} from '../../src/platform/prisma/generated/client.js';
import { defineFactory } from './factory.js';
import { requireId } from './require-id.js';

export interface ReminderBuild {
  userId: string;
  applicationId: string | null;
  source: ReminderSource;
  kind: ReminderKind;
  title: string;
  dueAt: Date;
}

const BASE_TIME = Date.UTC(2026, 0, 1);

export const reminderFactory = defineFactory<ReminderBuild, Reminder, AppPrisma | TxClient>({
  build: ({ seq, rng }) => ({
    userId: '',
    applicationId: null,
    source: 'MANUAL',
    kind: 'CUSTOM',
    title: `Reminder ${String(seq)}`,
    dueAt: new Date(BASE_TIME + rng.int(1, 30) * 86_400_000),
  }),
  persist: (db, { userId, ...data }) =>
    db.reminder.create({
      data: { ...data, userId: requireId(userId, 'userId', 'reminderFactory') },
    }),
});
