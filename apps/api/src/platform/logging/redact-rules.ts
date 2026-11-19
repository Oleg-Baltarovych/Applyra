// Pure redaction rules (09-security-privacy.md §10): the key list and value transforms shared by the pino logger
// (redact.ts) and the Sentry scrub (platform/sentry/scrub.ts). No pino, no Nest: src/instrument.ts loads this before
// Sentry.init, and anything it pulls in would escape Sentry's ESM instrumentation (guard: instrument-imports.test.ts).
import { isIPv4, isIPv6 } from 'node:net';

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

/** `o***@domain`: first character of the local part, the domain kept. */
export function maskEmail(value: string): string | undefined {
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
export function truncateIp(value: string): string | undefined {
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

const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

/** Every email-like substring → `o***@domain` (also used by the Sentry scrub, platform/sentry). */
export function maskEmailsIn(value: string): string {
  return value.replace(EMAIL, '$1***@$2');
}

/** Path segments that look like secrets (reset/invite tokens, keys): 24+ url-safe characters. */
const TOKEN_SEGMENT = /^[A-Za-z0-9_-]{24,}$/;
/** UUIDs are resource ids (not secrets) and stay readable for debugging. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** URL (absolute or path) without query string / fragment and with token-looking path segments → `:redacted`. */
export function redactUrl(url: string): string {
  const base = url.split(/[?#]/, 1)[0] ?? '';
  const authorityEnd = /^[a-z][a-z0-9+.-]*:\/\/[^/]*/i.exec(base)?.[0].length ?? 0;
  // Userinfo (`user:password@`) never leaves: connection strings in DB/Redis errors carry credentials.
  const authority = base
    .slice(0, authorityEnd)
    .replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/]*@/i, `$1${REDACTED}@`);
  const path = base
    .slice(authorityEnd)
    .split('/')
    .map((segment) => (TOKEN_SEGMENT.test(segment) && !UUID.test(segment) ? ':redacted' : segment))
    .join('/');
  return authority + path;
}

// Any scheme, not only http(s): postgresql://, redis://, s3:// … URLs appear in driver/client error messages.
const URL_IN_TEXT = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>`)\]]+/gi;

/** Every URL (any scheme) inside free text (error messages) through `redactUrl`. */
export function redactUrlsIn(text: string): string {
  return text.replace(URL_IN_TEXT, (url) => redactUrl(url));
}

const MAX_SUMMARY = 300;

/**
 * One line, at most 300 chars: multi-line messages (Prisma's invocation dumps quote the call — user data included)
 * keep only their last non-empty line, which carries the actual reason.
 */
export function summarizeText(text: string): string {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  const line = (lines.at(-1) ?? '').trim();
  return line.length > MAX_SUMMARY ? `${line.slice(0, MAX_SUMMARY - 1)}…` : line;
}
