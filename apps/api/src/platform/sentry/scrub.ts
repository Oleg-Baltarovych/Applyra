// Sentry `beforeSend` scrub (09-security-privacy.md §10, §12: Sentry keeps `user.id` only, no email/IP), on top of
// the SDK's `dataCollection` switches (sentry-options.ts). The key list is the pino redaction list
// (platform/logging/redact-rules.ts), so logs and Sentry hide the same fields; unlike pino paths this walk is recursive
// (bounded by MAX_DEPTH). Pure and unit-tested (scrub.spec.ts), but not a *.domain.ts: it imports platform code.
import type { Breadcrumb, ErrorEvent, Exception, RequestEventData } from '@sentry/nestjs';
// The pino-free rules file, not ../logging/index.js or redact.ts: this module is loaded by instrument.ts before
// Sentry.init, and anything imported earlier escapes its instrumentation (test/instrument-imports.test.ts).
import {
  REDACTED,
  REDACTED_KEYS,
  censor,
  maskEmailsIn,
  redactUrl,
  redactUrlsIn,
  summarizeText,
} from '../logging/redact-rules.js';

/** Request headers that may reach Sentry (lower-case); everything else — auth, cookies, client IPs — is dropped. */
export const HEADER_ALLOWLIST: ReadonlySet<string> = new Set([
  'accept',
  'content-length',
  'content-type',
  'origin',
  'user-agent',
  'x-request-id',
]);
/**
 * The logging list + query/fragment attributes the SDK attaches to spans and breadcrumbs (@sentry/core 11:
 * `url.query`/`url.fragment`; older integrations: `http.query`/`http.fragment`; `query_string` on requests).
 */
const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  ...REDACTED_KEYS,
  'url.query',
  'url.fragment',
  'http.query',
  'http.fragment',
  'query_string',
]);
/** Breadcrumb categories kept (outgoing requests); console and everything else may carry user content. */
const BREADCRUMB_CATEGORIES: ReadonlySet<string> = new Set(['http', 'fetch']);
/** Data fields kept on http/fetch breadcrumbs; `url` additionally goes through redactUrl. */
const BREADCRUMB_DATA_KEYS: ReadonlySet<string> = new Set([
  'url',
  'method',
  'http.request.method',
  'status_code',
  'http.response.status_code',
]);
/** Objects nested deeper than this are replaced wholesale: never forward what was not inspected. */
const MAX_DEPTH = 8;

/** Free text: emails masked, URLs without queries/tokens. */
const scrubString = (value: string): string => redactUrlsIn(maskEmailsIn(value));
/** Messages: as scrubString, then one line of at most 300 chars (Prisma dumps quote user data). */
const scrubMessage = (value: string): string => summarizeText(scrubString(value));

function scrubValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (typeof value !== 'object' || value === null) return value;
  if (depth >= MAX_DEPTH) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === 'url' && typeof item === 'string'
        ? redactUrl(item)
        : SENSITIVE_KEYS.has(key)
          ? censor(item, [key])
          : scrubValue(item, depth + 1),
    ]),
  );
}

/** Keeps the key structure: only leaf values change (to masked or `[REDACTED]` strings), so `T` still describes it. */
const scrubRecord = <T extends object>(value: T): T => scrubValue(value, 0) as T;

function scrubRequest(request: RequestEventData): RequestEventData {
  // Bodies, cookies, query strings and the server env never leave the process.
  const { url, headers, method } = request;
  const scrubbed: RequestEventData = {};
  if (method !== undefined) scrubbed.method = method;
  if (url !== undefined) scrubbed.url = redactUrl(url);
  if (headers !== undefined) {
    scrubbed.headers = Object.fromEntries(
      Object.entries(headers).filter(([name]) => HEADER_ALLOWLIST.has(name.toLowerCase())),
    );
  }
  return scrubbed;
}

function scrubException(exception: Exception): Exception {
  const scrubbed: Exception = { ...exception };
  if (exception.value !== undefined) scrubbed.value = scrubMessage(exception.value);
  if (exception.stacktrace?.frames) {
    scrubbed.stacktrace = {
      ...exception.stacktrace,
      // Local variables (localVariablesIntegration) can hold anything: frames go without them.
      frames: exception.stacktrace.frames.map((frame) => {
        const copy = { ...frame };
        delete copy.vars;
        return copy;
      }),
    };
  }
  return scrubbed;
}

/** Returns a scrubbed copy of a Sentry error event; the input is not mutated. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const { user, request, message, logentry, exception, breadcrumbs, extra, contexts, tags } = event;
  const scrubbed: ErrorEvent = { ...event };
  // Host name of the container/VM: not needed to debug, may identify infrastructure.
  delete scrubbed.server_name;

  if (user !== undefined) {
    delete scrubbed.user;
    if (typeof user.id === 'string' || typeof user.id === 'number') scrubbed.user = { id: user.id };
  }
  if (request !== undefined) scrubbed.request = scrubRequest(request);
  if (message !== undefined) scrubbed.message = scrubMessage(message);
  if (logentry !== undefined) {
    scrubbed.logentry = scrubRecord(logentry);
    if (logentry.message !== undefined) scrubbed.logentry.message = scrubMessage(logentry.message);
  }
  if (exception?.values) scrubbed.exception = { values: exception.values.map(scrubException) };
  if (breadcrumbs !== undefined) {
    scrubbed.breadcrumbs = breadcrumbs.map((crumb) => {
      const copy = scrubRecord(crumb);
      if (crumb.message !== undefined) copy.message = scrubMessage(crumb.message);
      return copy;
    });
  }
  if (extra !== undefined) scrubbed.extra = scrubRecord(extra);
  if (contexts !== undefined) scrubbed.contexts = scrubRecord(contexts);
  if (tags !== undefined) scrubbed.tags = scrubRecord(tags);
  return scrubbed;
}

/**
 * Sentry `beforeBreadcrumb`: keeps only outgoing-request breadcrumbs (http/fetch), reduced to method, status and a
 * redacted url — no message, no query/fragment, no other data. Console and any other category is dropped: in a
 * server they mostly echo log lines or queries that may carry user content.
 */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === undefined || !BREADCRUMB_CATEGORIES.has(breadcrumb.category))
    return null;
  const { data, ...rest } = breadcrumb;
  delete rest.message;
  if (data === undefined) return rest;
  const kept = Object.entries(data).filter(([key]) => BREADCRUMB_DATA_KEYS.has(key));
  return {
    ...rest,
    data: Object.fromEntries(
      kept.map(([key, value]) => [
        key,
        key === 'url' && typeof value === 'string' ? redactUrl(value) : value,
      ]),
    ),
  };
}
