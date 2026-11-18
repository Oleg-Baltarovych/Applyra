// Any thrown value → the 06-api.md §3 error body. Pure: no Nest/library imports, so every check is a duck type on
// `err` (rule 2). Order matters: the first matching branch wins.
import { type ApiError, ErrorCode, type ValidationIssue, errorStatus } from '@applyra/contracts';

export type ErrorLogLevel = 'none' | 'warn' | 'error';

export interface MappedError {
  status: number;
  body: ApiError;
  log: ErrorLogLevel;
}

type NonValidationCode = Exclude<ErrorCode, 'VALIDATION_ERROR'>;

/**
 * Status table for bare HttpExceptions / foreign Better Auth codes, with fixed client messages (thrown messages are
 * never echoed). 403: no catalogue code for a role/permission denial (06 §3.1) → 404 like a foreign resource (09 §2),
 * logged as warn; the specific 403 codes (CSRF_ORIGIN, FRESH_SESSION_REQUIRED, …) come only via AppException.
 * 409/422/502 have several catalogue codes each and no generic one → deliberately NOT here: 500 + warn, so the
 * thrower must use AppException with the right code.
 */
const BY_STATUS: Readonly<
  Partial<Record<number, { code: NonValidationCode; message: string; log?: ErrorLogLevel }>>
> = {
  401: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
  403: { code: 'NOT_FOUND', message: 'Not found', log: 'warn' },
  404: { code: 'NOT_FOUND', message: 'Not found' },
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' },
  415: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported media type' },
  429: { code: 'RATE_LIMITED', message: 'Too many requests' },
  503: { code: 'UNAVAILABLE', message: 'Service unavailable' },
};
const INTERNAL_MESSAGE = 'Internal server error';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null;
const isFn = (v: unknown): v is (...args: unknown[]) => unknown => typeof v === 'function';

const logFor = (status: number): ErrorLogLevel => (status >= 500 ? 'error' : 'none');

function other(
  code: NonValidationCode,
  message: string,
  details: Record<string, unknown> | null,
  requestId: string,
  log: ErrorLogLevel = logFor(errorStatus[code]),
): MappedError {
  const status = errorStatus[code];
  return { status, body: { statusCode: status, code, message, details, requestId }, log };
}

function validation(
  details: ValidationIssue[],
  requestId: string,
  message = 'Invalid request',
): MappedError {
  return {
    status: 400,
    body: { statusCode: 400, code: 'VALIDATION_ERROR', message, details, requestId },
    log: 'none',
  };
}

const internal = (requestId: string, log: ErrorLogLevel = 'error') =>
  other('INTERNAL_ERROR', INTERNAL_MESSAGE, null, requestId, log);

/** Status table (06 §3.1 subset); an unmapped status is a 500 + warn so every new case gets an explicit code. */
function byStatus(status: number, requestId: string): MappedError {
  if (status === 400) return validation([], requestId);
  const mapped = BY_STATUS[status];
  if (mapped === undefined) return internal(requestId, 'warn');
  return other(mapped.code, mapped.message, null, requestId, mapped.log);
}

const pathOf = (path: unknown): string =>
  Array.isArray(path) ? path.map((p) => String(p)).join('.') : '';

function zodIssues(zodError: unknown): ValidationIssue[] {
  const issues = isObj(zodError) && Array.isArray(zodError.issues) ? zodError.issues : [];
  return issues.filter(isObj).flatMap((issue) => {
    // A strict object reports all unknown keys in one issue on the object: one detail per key, so the path names it.
    if (issue.code === 'unrecognized_keys' && Array.isArray(issue.keys)) {
      const parent = Array.isArray(issue.path) ? issue.path.map(String) : [];
      return issue.keys.map((key) => ({
        path: [...parent, String(key)].join('.'),
        message: 'Unknown field',
      }));
    }
    return [
      {
        path: pathOf(issue.path),
        message: typeof issue.message === 'string' ? issue.message : 'Invalid value',
      },
    ];
  });
}

const BODY_PARSER: Readonly<Record<string, (requestId: string) => MappedError>> = {
  'entity.too.large': (id) => byStatus(413, id),
  'entity.parse.failed': (id) =>
    validation([{ path: '', message: 'Malformed JSON' }], id, 'Malformed JSON'),
  'charset.unsupported': (id) => byStatus(415, id),
  'encoding.unsupported': (id) => byStatus(415, id),
};

const isErrorCode = (v: unknown): v is ErrorCode => ErrorCode.safeParse(v).success;

export function toApiError(err: unknown, requestId: string): MappedError {
  if (!(err instanceof Error)) return internal(requestId);
  const e = err as Error & Obj; // duck-typed below; every field is checked before use

  // 1. AppException (app-exception.ts).
  if (e.name === 'AppException' && isErrorCode(e.code) && e.code !== 'VALIDATION_ERROR') {
    return other(e.code, e.message, isObj(e.details) ? e.details : null, requestId);
  }

  // 2–3. nestjs-zod: ZodValidationException (400) / ZodSerializationException (500), both expose getZodError().
  if (isFn(e.getZodError) && isFn(e.getStatus)) {
    if (e.getStatus() === 400)
      return validation(zodIssues(e.getZodError()), requestId, 'Validation failed');
    return internal(requestId);
  }

  // 4. body-parser (http-errors): `type` + numeric `status`.
  if (typeof e.type === 'string' && typeof e.status === 'number') {
    const mapBodyParser = BODY_PARSER[e.type];
    return mapBodyParser ? mapBodyParser(requestId) : byStatus(e.status, requestId);
  }

  // 5. Nest HttpException.
  if (isFn(e.getStatus) && isFn(e.getResponse)) {
    return byStatus(Number(e.getStatus()), requestId);
  }

  // 6. Better Auth APIError: numeric `statusCode` + `body.code`.
  if (e.name === 'APIError' && typeof e.statusCode === 'number') {
    const code = isObj(e.body) ? e.body.code : undefined;
    const message =
      isObj(e.body) && typeof e.body.message === 'string' ? e.body.message : undefined;
    if (isErrorCode(code) && code !== 'VALIDATION_ERROR') {
      return other(code, message ?? code, null, requestId);
    }
    return byStatus(e.statusCode, requestId);
  }

  // 7. Anything else.
  return internal(requestId);
}
