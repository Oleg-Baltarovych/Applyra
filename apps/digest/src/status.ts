/**
 * Status buttons under each vacancy message (ADR 003). Shared by the digest (sends the keyboard) and the
 * bot worker (apps/bot: handles presses). Callback data: `s:<code>:<vacancy id>`, ≤ 64 bytes (Telegram limit).
 */
export const STATUS_CODES = ['a', 'p', 'r', 'x'] as const;
export type StatusCode = (typeof STATUS_CODES)[number];

export const STATUS_LABEL: Record<StatusCode, string> = {
  a: '✅ Відгукнувся',
  p: '🔄 В процесі',
  r: '❌ Відмова',
  x: '🚫 Не цікаво',
};

/** The no-op button that shows the current status (pressing it does nothing). */
export const NOOP = 'noop';
const MAX_CALLBACK_BYTES = 64;

export interface InlineButton {
  text: string;
  callback_data: string;
}
export interface InlineKeyboard {
  inline_keyboard: InlineButton[][];
}

const isStatusCode = (s: string): s is StatusCode =>
  (STATUS_CODES as readonly string[]).includes(s);

export const callbackData = (code: StatusCode, vacancyId: string): string =>
  `s:${code}:${vacancyId}`;

/** Callback data → status + vacancy id; undefined for anything else (incl. NOOP and forged data). */
export function parseCallback(data: string): { code: StatusCode; vacancyId: string } | undefined {
  const m = /^s:([a-z]):([a-z0-9]{1,20}:[\w.-]{1,40})$/.exec(data);
  return m?.[1] && m[2] && isStatusCode(m[1]) ? { code: m[1], vacancyId: m[2] } : undefined;
}

/** dd.mm in Kyiv time. */
export const shortDate = (d: Date): string =>
  d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Kyiv' });

/**
 * Keyboard for a vacancy: an optional status row ("Статус: 🔄 В процесі · 20.11") and the four choices.
 * Undefined when the id cannot fit the callback data limit (the message is then sent without buttons).
 */
export function statusKeyboard(
  vacancyId: string,
  current?: { code: StatusCode; at: Date },
): InlineKeyboard | undefined {
  const button = (code: StatusCode): InlineButton => ({
    text: STATUS_LABEL[code],
    callback_data: callbackData(code, vacancyId),
  });
  // TextEncoder, not Buffer: this module also runs in the Workers runtime.
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  if (STATUS_CODES.some((c) => bytes(callbackData(c, vacancyId)) > MAX_CALLBACK_BYTES))
    return undefined;
  if (!parseCallback(callbackData('a', vacancyId))) return undefined;
  const rows: InlineButton[][] = [
    [button('a'), button('p')],
    [button('r'), button('x')],
  ];
  if (current)
    rows.unshift([
      {
        text: `Статус: ${STATUS_LABEL[current.code]} · ${shortDate(current.at)}`,
        callback_data: NOOP,
      },
    ]);
  return { inline_keyboard: rows };
}
