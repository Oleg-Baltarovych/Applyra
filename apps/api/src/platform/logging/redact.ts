// The single log redaction list (09-security-privacy.md §10), used by the pino logger (logging.module.ts).
// pino redact paths do not recurse: each key is matched at the top level, one and two levels deep (`k`, `*.k`,
// `*.*.k`). Deeper values are NOT redacted — log flat context objects, never whole entities or request bodies.
import { isIPv4, isIPv6 } from 'node:net';
import { type redactOptions as PinoRedactOptions, stdSerializers } from 'pino';

export const REDACTED = '[REDACTED]';

/** Keys whose value is replaced (email/ip/remoteAddress/url are transformed by `censor` instead). */
export const REDACTED_KEYS = [
  // Secrets
  'password',
  'newPassword',
  'currentPassword',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'secret',
  'totp',
  // User content (prompts and AI output are never logged at all)
  'parsedText',
  'notes',
  'note',
  'description',
  'coverLetter',
  'prompt',
  // PII
  'email',
  'phone',
  'contact',
  'telegramChatId',
  'ip',
  'remoteAddress',
  // Presigned URLs: query string dropped
  'url',
] as const;

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

/** `o***@domain`: first character of the local part, the domain kept. */
function maskEmail(value: string): string | undefined {
  const at = value.lastIndexOf('@');
  if (at < 1 || at === value.length - 1) return undefined;
  return `${value[0] ?? ''}***@${value.slice(at + 1)}`;
}

function expandIPv6(value: string): string[] {
  const [head = '', tail] = value.split('::');
  const left = head === '' ? [] : head.split(':');
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  const fill = tail === undefined ? [] : Array<string>(8 - left.length - right.length).fill('0');
  return [...left, ...fill, ...right];
}

/** IPv4 → /24, IPv6 → /48 (IPv4-mapped IPv6 is treated as IPv4). */
function truncateIp(value: string): string | undefined {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(value)?.[1];
  const v4 = mapped ?? value;
  if (isIPv4(v4)) return `${v4.split('.').slice(0, 3).join('.')}.0/24`;
  if (!isIPv6(value)) return undefined;
  const groups = expandIPv6(value)
    .slice(0, 3)
    .map((g) => Number.parseInt(g, 16).toString(16));
  return `${groups.join(':')}::/48`;
}

/** pino 10 `redact.censor(value, path)`: transform PII that stays useful, replace everything else. */
export function censor(value: unknown, path: string[]): unknown {
  const key = path.at(-1);
  if (typeof value !== 'string') return REDACTED;
  const transformed =
    key === 'email'
      ? maskEmail(value)
      : key === 'ip' || key === 'remoteAddress'
        ? truncateIp(value)
        : key === 'url'
          ? value.split('?')[0]
          : undefined;
  return transformed ?? REDACTED;
}

export const redactOptions: PinoRedactOptions = { paths, censor };

const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

function maskEmails(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return value.replace(EMAIL, '$1***@$2');
  if (depth >= 6 || typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value.map((v) => maskEmails(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskEmails(v, depth + 1)]));
}

/**
 * pino's err serializer + email masking in every string of the result (message, stack, cause, pg `detail` such as
 * `Key (email)=(a@b.com) already exists` carried by driver errors / Prisma `meta`). Redact paths cannot see inside
 * strings; Prisma's own P2002 message names fields only, but the adapter's cause can carry the value.
 */
export function errSerializer(err: Error): unknown {
  return maskEmails(stdSerializers.err(err), 0);
}
