// Reminders, in-app, computed on read: /reminders/* (06-api.md §7.4, FR-REM-01..03).
import { z } from 'zod';
import { FIELD_LIMITS, IsoDateTime, page, requiredText } from './common.js';
import { ReminderKind, ReminderSource, ReminderStatus } from './enums.js';

/**
 * POST /reminders (IK). R0 = next action only: `applicationId` required and `asNextAction: true`
 * (replaces the open NEXT_ACTION + cache in one transaction). R1 (FR-REM-04) relaxes both for MANUAL reminders.
 */
export const CreateReminder = z.strictObject({
  applicationId: z.uuid(),
  kind: ReminderKind,
  title: requiredText(FIELD_LIMITS.title),
  dueAt: IsoDateTime,
  asNextAction: z.literal(true),
});
export type CreateReminder = z.infer<typeof CreateReminder>;

/** PATCH /reminders/:id. `followedUp` (only with DONE) also logs FOLLOW_UP_SENT (FR-REM-03). */
export const UpdateReminder = z
  .strictObject({
    title: requiredText(FIELD_LIMITS.title).optional(),
    dueAt: IsoDateTime.optional(),
    status: ReminderStatus.exclude(['PENDING']).optional(),
    followedUp: z.boolean().optional(),
  })
  .superRefine((patch, ctx) => {
    if (Object.keys(patch).length === 0) {
      ctx.addIssue({ code: 'custom', path: [], message: 'At least one field is required' });
    }
    if (patch.followedUp !== undefined && patch.status !== 'DONE') {
      ctx.addIssue({ code: 'custom', path: ['followedUp'], message: 'Only with status DONE' });
    }
  });
export type UpdateReminder = z.infer<typeof UpdateReminder>;

/** POST /reminders/:id/snooze: a preset or an explicit `until` (future check in the domain). */
export const SnoozeReminder = z.union(
  [z.strictObject({ preset: z.enum(['1d', '3d']) }), z.strictObject({ until: IsoDateTime })],
  { error: 'Pass either preset ("1d" | "3d") or until, not both' },
);
export type SnoozeReminder = z.infer<typeof SnoozeReminder>;

/** GET /reminders query; day bounds use `UserSettings.timezone`, upcoming = next 7 days (FR-REM-02). */
export const ReminderListQuery = z.strictObject({
  range: z.enum(['today', 'overdue', 'upcoming']),
});
export type ReminderListQuery = z.infer<typeof ReminderListQuery>;

export const Reminder = z.object({
  id: z.uuid(),
  applicationId: z.uuid().nullable(),
  source: ReminderSource,
  kind: ReminderKind,
  title: z.string(),
  dueAt: IsoDateTime,
  status: ReminderStatus,
  snoozeCount: z.int().min(0),
  completedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Reminder = z.infer<typeof Reminder>;

/** Minimal application reference for reminder lists (Today screen: label + link, M1-18). */
export const ApplicationRef = z.object({
  id: z.uuid(),
  companyName: z.string(),
  roleTitle: z.string(),
});
export type ApplicationRef = z.infer<typeof ApplicationRef>;

export const ReminderListItem = Reminder.extend({ application: ApplicationRef.nullable() });
export type ReminderListItem = z.infer<typeof ReminderListItem>;

/** GET /reminders response; not paginated in R0 (`nextCursor` always null). */
export const ReminderList = page(ReminderListItem);
export type ReminderList = z.infer<typeof ReminderList>;
