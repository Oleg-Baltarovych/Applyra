// R0 domain enums = Prisma enums in apps/api/prisma/schema.prisma (same values, same order).
// Drift guard: apps/api/test/contracts-enum-drift.test.ts.
import { z } from 'zod';

export const WorkMode = z.enum(['REMOTE', 'HYBRID', 'ONSITE']);
export type WorkMode = z.infer<typeof WorkMode>;

export const EmploymentType = z.enum([
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'FREELANCE',
  'INTERNSHIP',
]);
export type EmploymentType = z.infer<typeof EmploymentType>;

export const Seniority = z.enum(['INTERN', 'JUNIOR', 'MIDDLE', 'SENIOR', 'LEAD', 'PRINCIPAL']);
export type Seniority = z.infer<typeof Seniority>;

export const SalaryPeriod = z.enum(['HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR']);
export type SalaryPeriod = z.infer<typeof SalaryPeriod>;

export const CefrLevel = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'NATIVE']);
export type CefrLevel = z.infer<typeof CefrLevel>;

export const JobVisibility = z.enum(['PUBLIC', 'PRIVATE']);
export type JobVisibility = z.infer<typeof JobVisibility>;

export const JobStatus = z.enum(['OPEN', 'CLOSED', 'UNKNOWN']);
export type JobStatus = z.infer<typeof JobStatus>;

export const ExtractionMethod = z.enum(['ADAPTER', 'JSON_LD', 'LLM', 'MANUAL']);
export type ExtractionMethod = z.infer<typeof ExtractionMethod>;

/** Pipeline order (FR-APP-03) = Kanban column order; any transition is allowed. */
export const ApplicationStatus = z.enum([
  'WISHLIST',
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'TEST_TASK',
  'OFFER',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'GHOSTED',
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatus>;

/** Terminal statuses (collapsed Kanban columns; reopen allowed). */
export const TERMINAL_STATUSES = [
  'REJECTED',
  'WITHDRAWN',
  'GHOSTED',
] as const satisfies readonly ApplicationStatus[];

export const ApplicationOrigin = z.enum([
  'SELF_APPLIED',
  'RECRUITER_OUTREACH',
  'REFERRAL',
  'OTHER',
]);
export type ApplicationOrigin = z.infer<typeof ApplicationOrigin>;

export const ApplicationChannel = z.enum([
  'DJINNI',
  'DOU',
  'LINKEDIN',
  'EMAIL',
  'TELEGRAM',
  'COMPANY_SITE',
  'OTHER',
]);
export type ApplicationChannel = z.infer<typeof ApplicationChannel>;

export const Priority = z.enum(['HIGH', 'NORMAL', 'LOW']);
export type Priority = z.infer<typeof Priority>;

export const ApplicationEventType = z.enum([
  'CREATED',
  'STATUS_CHANGED',
  'NOTE',
  'MESSAGE_LOGGED',
  'FOLLOW_UP_SENT',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_COMPLETED',
  'OFFER_RECEIVED',
  'ARCHIVED',
  'UNARCHIVED',
]);
export type ApplicationEventType = z.infer<typeof ApplicationEventType>;

export const EventActor = z.enum(['USER', 'IMPORT', 'SYSTEM']);
export type EventActor = z.infer<typeof EventActor>;

export const ReminderKind = z.enum(['FOLLOW_UP', 'INTERVIEW', 'DEADLINE', 'CUSTOM']);
export type ReminderKind = z.infer<typeof ReminderKind>;

export const ReminderSource = z.enum(['NEXT_ACTION', 'INTERVIEW_AUTO', 'MANUAL']);
export type ReminderSource = z.infer<typeof ReminderSource>;

export const ReminderStatus = z.enum(['PENDING', 'DONE', 'CANCELLED']);
export type ReminderStatus = z.infer<typeof ReminderStatus>;
