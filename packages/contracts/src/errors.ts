import { z } from 'zod';

/** Error code catalogue = 06-api.md §3.1 (a new code goes into the spec table first, then here). */
export const ErrorCode = z.enum([
  'VALIDATION_ERROR',
  'INVALID_CURSOR',
  'IDEMPOTENCY_KEY_REQUIRED',
  'UNAUTHENTICATED',
  'FRESH_SESSION_REQUIRED',
  'CSRF_ORIGIN',
  'DEMO_FEATURE_DISABLED',
  'SIGNUP_CLOSED',
  'NOT_FOUND',
  'CONFLICT_ACTIVE_APPLICATION',
  'INVALID_TRANSITION',
  'ACCOUNT_LINK_REQUIRES_VERIFICATION',
  'CONFLICT_DUPLICATE_JOB',
  'CONFLICT_STATE',
  'IDEMPOTENCY_IN_PROGRESS',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'IDEMPOTENCY_KEY_REUSED',
  'CAPTURE_UNAVAILABLE',
  'IMPORT_INVALID',
  'AI_DISABLED',
  'AI_TASK_UNAVAILABLE',
  'AI_INVALID_OUTPUT',
  'RATE_LIMITED',
  'AI_BUDGET_EXCEEDED',
  'INTERNAL_ERROR',
  'AI_PROVIDER_ERROR',
  'UPSTREAM_ERROR',
  'AI_TIMEOUT',
  'CAPTURE_TIMEOUT',
  'UNAVAILABLE',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** HTTP status per code (06-api.md §3.1). Shared by the API filter, the web client and MSW handlers. */
export const errorStatus = {
  VALIDATION_ERROR: 400,
  INVALID_CURSOR: 400,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  UNAUTHENTICATED: 401,
  FRESH_SESSION_REQUIRED: 403,
  CSRF_ORIGIN: 403,
  DEMO_FEATURE_DISABLED: 403,
  SIGNUP_CLOSED: 403,
  NOT_FOUND: 404,
  CONFLICT_ACTIVE_APPLICATION: 409,
  INVALID_TRANSITION: 409,
  ACCOUNT_LINK_REQUIRES_VERIFICATION: 409,
  CONFLICT_DUPLICATE_JOB: 409,
  CONFLICT_STATE: 409,
  IDEMPOTENCY_IN_PROGRESS: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  IDEMPOTENCY_KEY_REUSED: 422,
  CAPTURE_UNAVAILABLE: 422,
  IMPORT_INVALID: 422,
  AI_DISABLED: 422,
  AI_TASK_UNAVAILABLE: 422,
  AI_INVALID_OUTPUT: 422,
  RATE_LIMITED: 429,
  AI_BUDGET_EXCEEDED: 429,
  INTERNAL_ERROR: 500,
  AI_PROVIDER_ERROR: 502,
  UPSTREAM_ERROR: 502,
  AI_TIMEOUT: 504,
  CAPTURE_TIMEOUT: 504,
  UNAVAILABLE: 503,
} as const satisfies Record<ErrorCode, number>;

/** One Zod issue: `path` is the issue path joined with `.` (`items.0.title`, = RHF field name); '' = the whole body. */
export const ValidationIssue = z.strictObject({ path: z.string(), message: z.string() });
export type ValidationIssue = z.infer<typeof ValidationIssue>;

const base = { statusCode: z.number().int(), message: z.string(), requestId: z.string() };

/** Error body of every API response outside /api/auth/* (06-api.md §3). `details` is always present (null = none). */
export const ApiError = z.discriminatedUnion('code', [
  z.strictObject({
    ...base,
    code: z.literal('VALIDATION_ERROR'),
    details: z.array(ValidationIssue),
  }),
  z.strictObject({
    ...base,
    code: ErrorCode.exclude(['VALIDATION_ERROR']),
    details: z.record(z.string(), z.unknown()).nullable(),
  }),
]);
export type ApiError = z.infer<typeof ApiError>;
