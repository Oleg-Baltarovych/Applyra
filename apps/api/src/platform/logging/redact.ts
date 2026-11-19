// The single log redaction list (09-security-privacy.md §10), used by the pino logger (logging.module.ts).
// pino redact paths do not recurse: each key is matched at the top level, one and two levels deep (`k`, `*.k`,
// `*.*.k`). Deeper values are NOT redacted — log flat context objects, never whole entities or request bodies.
import { type redactOptions as PinoRedactOptions, stdSerializers } from 'pino';
import { REDACTED_KEYS, censor, maskEmailsIn, redactUrlsIn } from './redact-rules.js';

export { REDACTED, REDACTED_KEYS, censor } from './redact-rules.js';

/**
 * Exact paths: `code` (OAuth) and `message` (user content) are sensitive only under a request body/query, never as
 * error fields — so they are not wildcard keys (a logged `err.message` / `errorCode` stays readable).
 */
const EXACT_PATHS = [
  'body.text',
  'body.message',
  'body.code',
  'query.code',
  'oauth.code',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
];

const paths = [
  ...REDACTED_KEYS.flatMap((k) => [k, `*.${k}`, `*.*.${k}`]),
  ...EXACT_PATHS.flatMap((p) => [p, `*.${p}`]),
];

export const redactOptions: PinoRedactOptions = { paths, censor };

function maskEmails(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return redactUrlsIn(maskEmailsIn(value));
  if (depth >= 6 || typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value.map((v) => maskEmails(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskEmails(v, depth + 1)]));
}

/**
 * pino's err serializer + email masking and URL redaction (no query, no token segments; redact-rules.ts) in every string of the result (message, stack, cause, pg `detail` such as
 * `Key (email)=(a@b.com) already exists` carried by driver errors / Prisma `meta`). Redact paths cannot see inside
 * strings; Prisma's own P2002 message names fields only, but the adapter's cause can carry the value.
 */
export function errSerializer(err: Error): unknown {
  return maskEmails(stdSerializers.err(err), 0);
}
