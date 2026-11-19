// Applications CRM: /applications/* (06-api.md §7.3, FR-APP-01..13).
import { z } from 'zod';
import {
  CurrencyCode,
  FIELD_LIMITS,
  IsoDateTime,
  MoneyAmount,
  optionalText,
  paginationShape,
  page,
  requiredText,
} from './common.js';
import {
  ApplicationChannel,
  ApplicationEventType,
  ApplicationOrigin,
  ApplicationStatus,
  EventActor,
  Priority,
  SalaryPeriod,
} from './enums.js';
import { CreateJob } from './jobs.js';

/**
 * Application salary input (06 §1 money object). Mirrors the DB exactly: an amount needs a currency
 * (application_salary_currency_chk), `period` is optional (no CHECK). Not a range: expected vs offered.
 * Repositories map it to the flat `Application.salary*` columns.
 */
export const ApplicationSalaryInput = z
  .strictObject({
    expected: MoneyAmount.optional(),
    offered: MoneyAmount.optional(),
    currency: CurrencyCode,
    period: SalaryPeriod.nullish(),
  })
  .refine((salary) => salary.expected !== undefined || salary.offered !== undefined, {
    path: [],
    message: 'Enter an expected or an offered amount',
  });
export type ApplicationSalaryInput = z.infer<typeof ApplicationSalaryInput>;

export const ApplicationSalary = z.object({
  expected: MoneyAmount.nullable(),
  offered: MoneyAmount.nullable(),
  currency: z.string(),
  period: SalaryPeriod.nullable(),
});
export type ApplicationSalary = z.infer<typeof ApplicationSalary>;

/** Editable fields (create + PATCH). Never: userId, status (→ transitions), nextAction* (→ reminders), archivedAt. */
const editable = {
  /** Snapshot; the only source of truth when `jobId` is null. */
  companyName: requiredText(FIELD_LIMITS.title),
  roleTitle: requiredText(FIELD_LIMITS.title),
  origin: ApplicationOrigin,
  channel: ApplicationChannel.nullable(),
  priority: Priority,
  appliedAt: IsoDateTime.nullable(),
  /** `null` = none; in PATCH `null` clears and an object replaces all salary columns. */
  salary: ApplicationSalaryInput.nullable(),
  /** Markdown source, rendered as plain text (untrusted). */
  notes: optionalText(FIELD_LIMITS.longText).nullable(),
};

/**
 * POST /applications (IK). One of: `jobId` (existing accessible job), inline `job` (new PRIVATE job, same
 * transaction), or neither — then `companyName` + `roleTitle` are required. With a job the snapshot defaults to it.
 */
export const CreateApplication = z
  .strictObject({
    jobId: z.uuid().optional(),
    job: CreateJob.optional(),
    companyName: editable.companyName.optional(),
    roleTitle: editable.roleTitle.optional(),
    origin: editable.origin.optional(),
    channel: editable.channel.optional(),
    priority: editable.priority.optional(),
    appliedAt: editable.appliedAt.optional(),
    salary: editable.salary.optional(),
    notes: editable.notes.optional(),
  })
  .superRefine((body, ctx) => {
    if (body.jobId !== undefined && body.job !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['job'],
        message: 'Pass either jobId or job, not both',
      });
    }
    if (body.jobId === undefined && body.job === undefined) {
      for (const key of ['companyName', 'roleTitle'] as const) {
        if (body[key] === undefined) {
          ctx.addIssue({ code: 'custom', path: [key], message: 'Required when no job is linked' });
        }
      }
    }
  });
export type CreateApplication = z.infer<typeof CreateApplication>;

/** PATCH /applications/:id: non-empty subset; `jobId` may change or be cleared. */
export const UpdateApplication = z
  .strictObject({ jobId: z.uuid().nullable(), ...editable })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'At least one field is required' });
export type UpdateApplication = z.infer<typeof UpdateApplication>;

/** POST /applications/:id/transitions (IK). Future `occurredAt` (> now + 5 min) is rejected by the domain (M1-05). */
export const TransitionApplication = z.strictObject({
  toStatus: ApplicationStatus,
  occurredAt: IsoDateTime.optional(),
  note: optionalText(FIELD_LIMITS.longText).optional(),
});
export type TransitionApplication = z.infer<typeof TransitionApplication>;

/** Event types a user may add by hand (FR-APP-10). `extract` ties the values to `ApplicationEventType` at compile time. */
export const ManualEventType = ApplicationEventType.extract([
  'NOTE',
  'MESSAGE_LOGGED',
  'FOLLOW_UP_SENT',
]);
export type ManualEventType = z.infer<typeof ManualEventType>;

/** POST /applications/:id/events. `text` is required for NOTE. */
export const CreateApplicationEvent = z
  .strictObject({
    type: ManualEventType,
    text: optionalText(FIELD_LIMITS.longText).optional(),
    occurredAt: IsoDateTime.optional(),
  })
  .refine((body) => body.type !== 'NOTE' || body.text != null, {
    path: ['text'],
    message: 'A note needs text',
  });
export type CreateApplicationEvent = z.infer<typeof CreateApplicationEvent>;

/** POST /applications/bulk/archive (IK; ≤ 100 ids, 06 §5). */
export const BulkArchiveApplications = z.strictObject({ ids: z.array(z.uuid()).min(1).max(100) });
export type BulkArchiveApplications = z.infer<typeof BulkArchiveApplications>;

/** Foreign and missing ids both land in `notFound` (no existence leak). */
export const BulkArchiveResult = z.object({
  archived: z.int().min(0),
  notFound: z.array(z.uuid()),
});
export type BulkArchiveResult = z.infer<typeof BulkArchiveResult>;

export const ApplicationSort = z.enum(['updatedAt', 'appliedAt', 'createdAt']);
export type ApplicationSort = z.infer<typeof ApplicationSort>;

/** Query values arrive as a string or, when repeated (`?status=A&status=B`), as an array. */
const oneOrMany = <T extends z.ZodType>(item: T) =>
  z.union([item.transform((v) => [v]), z.array(item)]).optional();

/** GET /applications query. `view=kanban` is uncursored (≤ 500 cards). */
export const ApplicationListQuery = z
  .strictObject({
    view: z.enum(['list', 'kanban']).default('list'),
    status: oneOrMany(ApplicationStatus),
    /** `?q=` (empty) = no search. */
    q: z
      .string()
      .max(FIELD_LIMITS.query)
      .transform((value) => value.trim() || undefined)
      .optional(),
    archived: z.stringbool().default(false),
    channel: ApplicationChannel.optional(),
    origin: ApplicationOrigin.optional(),
    sort: ApplicationSort.default('updatedAt'),
    dir: z.enum(['asc', 'desc']).default('desc'),
    ...paginationShape,
  })
  .refine((query) => query.view === 'list' || query.cursor === undefined, {
    path: ['cursor'],
    message: 'The kanban view is not paginated',
  });
export type ApplicationListQuery = z.infer<typeof ApplicationListQuery>;

/** Read-model of the open NEXT_ACTION reminder (cache `Application.nextAction*`, P-05). */
export const NextAction = z.object({ text: z.string(), dueAt: IsoDateTime });
export type NextAction = z.infer<typeof NextAction>;

/** Application in lists, Kanban and mutation responses. `daysSinceActivity`/`isStale` are computed on read (P-04). */
export const Application = z.object({
  id: z.uuid(),
  jobId: z.uuid().nullable(),
  companyName: z.string(),
  roleTitle: z.string(),
  origin: ApplicationOrigin,
  channel: ApplicationChannel.nullable(),
  status: ApplicationStatus,
  priority: Priority,
  appliedAt: IsoDateTime.nullable(),
  lastActivityAt: IsoDateTime,
  nextAction: NextAction.nullable(),
  salary: ApplicationSalary.nullable(),
  notes: z.string().nullable(),
  archivedAt: IsoDateTime.nullable(),
  daysSinceActivity: z.int().min(0),
  isStale: z.boolean(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Application = z.infer<typeof Application>;

/** GET /applications/:id — adds the open NEXT_ACTION reminder id (clear/done/snooze from the detail, M1-17). */
export const ApplicationDetail = Application.extend({ nextActionReminderId: z.uuid().nullable() });
export type ApplicationDetail = z.infer<typeof ApplicationDetail>;

export const ApplicationList = page(Application);
export type ApplicationList = z.infer<typeof ApplicationList>;

/** GET /applications?view=kanban: one column per status in pipeline order; `truncated` = the 500-card cap was hit. */
export const ApplicationKanban = z.object({
  columns: z.array(z.object({ status: ApplicationStatus, items: z.array(Application) })),
  truncated: z.boolean(),
});
export type ApplicationKanban = z.infer<typeof ApplicationKanban>;

/** `details` of `409 CONFLICT_ACTIVE_APPLICATION` (FR-APP-02). */
export const ActiveApplicationDetails = z.object({ existingApplicationId: z.uuid() });
export type ActiveApplicationDetails = z.infer<typeof ActiveApplicationDetails>;

/** JSONB `ApplicationEvent.payload` per type (05 D-5). R0 types only; R1 adds interview/offer variants. */
export const StatusChangedPayload = z.object({ note: z.string() });
export const TextEventPayload = z.object({ text: z.string() });

const eventBase = {
  id: z.uuid(),
  applicationId: z.uuid(),
  actor: EventActor,
  occurredAt: IsoDateTime,
  editedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
};

/** Timeline event (GET /applications/:id/events items), discriminated by `type`. */
export const ApplicationEvent = z.discriminatedUnion('type', [
  z.object({
    ...eventBase,
    type: z.literal('STATUS_CHANGED'),
    fromStatus: ApplicationStatus,
    toStatus: ApplicationStatus,
    payload: StatusChangedPayload.nullable(),
  }),
  z.object({
    ...eventBase,
    type: z.literal('NOTE'),
    fromStatus: z.null(),
    toStatus: z.null(),
    payload: TextEventPayload,
  }),
  z.object({
    ...eventBase,
    /** May be logged without text (e.g. reminder Done + "I followed up", FR-REM-03). */
    type: ApplicationEventType.extract(['MESSAGE_LOGGED', 'FOLLOW_UP_SENT']),
    fromStatus: z.null(),
    toStatus: z.null(),
    payload: TextEventPayload.nullable(),
  }),
  z.object({
    ...eventBase,
    type: ApplicationEventType.extract(['CREATED', 'ARCHIVED', 'UNARCHIVED']),
    fromStatus: z.null(),
    toStatus: z.null(),
    payload: z.null(),
  }),
]);
export type ApplicationEvent = z.infer<typeof ApplicationEvent>;

export const ApplicationEventList = page(ApplicationEvent);
export type ApplicationEventList = z.infer<typeof ApplicationEventList>;

/** POST /applications/:id/transitions response: `event.id` is what undo deletes (M1-08). */
export const TransitionResult = z.object({
  application: Application,
  event: ApplicationEvent,
});
export type TransitionResult = z.infer<typeof TransitionResult>;
