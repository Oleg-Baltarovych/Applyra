// Private jobs: POST/GET/PATCH/DELETE /jobs (06-api.md §7.2, FR-JOB-01..06). R0 = manual form + pasted text.
import { z } from 'zod';
import {
  CountryCode,
  CurrencyCode,
  FIELD_LIMITS,
  IsoDateTime,
  MoneyAmount,
  optionalText,
  requiredText,
} from './common.js';
import {
  CefrLevel,
  EmploymentType,
  ExtractionMethod,
  JobStatus,
  JobVisibility,
  SalaryPeriod,
  Seniority,
  WorkMode,
} from './enums.js';

/**
 * Salary range input (06 §1 money: `{ min, max, currency, period }`). Manual-form rule (M1-04; no DB CHECK —
 * 05 §7.4) is structural: currency + period required, at least one amount, min ≤ max (= job_salary_chk).
 * Repositories map it to the flat `Job.salary*` columns.
 */
export const JobSalaryInput = z
  .strictObject({
    min: MoneyAmount.optional(),
    max: MoneyAmount.optional(),
    currency: CurrencyCode,
    period: SalaryPeriod,
    isGross: z.boolean().nullish(),
  })
  .superRefine((salary, ctx) => {
    if (salary.min === undefined && salary.max === undefined) {
      ctx.addIssue({ code: 'custom', path: [], message: 'Enter a minimum or a maximum' });
    }
    if (salary.min !== undefined && salary.max !== undefined && salary.min > salary.max) {
      ctx.addIssue({ code: 'custom', path: ['max'], message: 'Must be ≥ the minimum salary' });
    }
  });
export type JobSalaryInput = z.infer<typeof JobSalaryInput>;

/** Optional fields: omitted or `null` = not set; in PATCH `null` clears. */
const createJobObject = z.strictObject({
  title: requiredText(FIELD_LIMITS.title),
  /** Stored as `Job.companyNameRaw`. */
  companyName: requiredText(FIELD_LIMITS.title),
  /** Pasted text, kept as plain text (FR-JOB-02); never rendered as HTML. Omitted = ''. */
  descriptionText: z.string().max(FIELD_LIMITS.longText).optional(),
  locationText: optionalText(FIELD_LIMITS.locationText).nullish(),
  countryCode: CountryCode.nullish(),
  workMode: WorkMode.nullish(),
  employmentType: EmploymentType.nullish(),
  seniority: Seniority.nullish(),
  englishLevel: CefrLevel.nullish(),
  /** `null` = no salary; in PATCH `null` clears and an object replaces the whole range. */
  salary: JobSalaryInput.nullish(),
  /** As entered; the API derives `canonicalUrl` (FR-JOB-03). */
  originalUrl: z
    .url({ protocol: /^https?$/, error: 'Expected an http(s) URL' })
    .max(FIELD_LIMITS.url)
    .nullish(),
});

/** POST /jobs body (manual form / paste text). Server sets visibility PRIVATE, owner, MANUAL, canonicalUrl. */
export const CreateJob = createJobObject;
export type CreateJob = z.infer<typeof CreateJob>;

/** PATCH /jobs/:id: non-empty subset; `null` clears an optional field. */
export const UpdateJob = createJobObject
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'At least one field is required' });
export type UpdateJob = z.infer<typeof UpdateJob>;

/**
 * Salary in responses: every key present, absent = null (06 §1). Mapper rule: `salary` is null unless an amount
 * exists. R1/R2 ingestion (parseSalary, 08 §7.1) may yield an unknown currency/period → relax to nullable then.
 */
export const JobSalary = z.object({
  min: MoneyAmount.nullable(),
  max: MoneyAmount.nullable(),
  currency: z.string(),
  period: SalaryPeriod,
  isGross: z.boolean().nullable(),
});
export type JobSalary = z.infer<typeof JobSalary>;

/** Job response (wire schema: no transforms; absent = null). */
export const Job = z.object({
  id: z.uuid(),
  visibility: JobVisibility,
  companyName: z.string(),
  title: z.string(),
  descriptionText: z.string(),
  locationText: z.string().nullable(),
  countryCode: z.string().nullable(),
  workMode: WorkMode.nullable(),
  employmentType: EmploymentType.nullable(),
  seniority: Seniority.nullable(),
  englishLevel: CefrLevel.nullable(),
  /** null when the job has no amount (R0 writes currency/period only together with an amount). */
  salary: JobSalary.nullable(),
  originalUrl: z.string().nullable(),
  canonicalUrl: z.string().nullable(),
  status: JobStatus,
  extractionMethod: ExtractionMethod,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Job = z.infer<typeof Job>;

/** `details` of `409 CONFLICT_DUPLICATE_JOB` (FR-JOB-04). */
export const DuplicateJobDetails = z.object({ existingJobId: z.uuid() });
export type DuplicateJobDetails = z.infer<typeof DuplicateJobDetails>;
