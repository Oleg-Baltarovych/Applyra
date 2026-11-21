// Telegram Bot API client. The token is part of the request URL, so it must never reach a log line
// or an error message: errors below carry only the HTTP status and Telegram's `description`.

import type { InlineKeyboard } from './status.ts';

export interface TelegramConfig {
  token: string;
  chatId: string;
}

export type Fetch = typeof fetch;

/** Telegram answered with an error status (message never carries the token). */
export class TelegramApiError extends Error {
  readonly status: number;
  /** Telegram's `description`, e.g. "Bad Request: message is too long". */
  readonly description: string;

  constructor(status: number, description = '') {
    super(
      `Telegram sendMessage failed with HTTP ${status}${description ? `: ${description}` : ''}`,
    );
    this.name = 'TelegramApiError';
    this.status = status;
    this.description = description;
  }
}

const MESSAGE_FAULT =
  /message is too long|can't parse entities|text must be non-empty|message text is empty/i;

/**
 * Telegram rejected THIS message's content (400 + a content error): resending it can never succeed.
 * Other 400s ("chat not found") are configuration errors and must fail the run, not quarantine vacancies.
 */
export const isRejectedMessage = (err: unknown): boolean =>
  err instanceof TelegramApiError && err.status === 400 && MESSAGE_FAULT.test(err.description);

/** Reads TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID; the error names missing variables, never values. */
export function readTelegramConfig(env: Record<string, string | undefined>): TelegramConfig {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  const missing = [!token && 'TELEGRAM_BOT_TOKEN', !chatId && 'TELEGRAM_CHAT_ID'].filter(Boolean);
  if (!token || !chatId) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  return { token, chatId };
}

const MAX_RETRY_AFTER_S = 30;
const TIMEOUT_MS = 15_000;

const readBody = async (res: Response): Promise<{ description?: string; retryAfter?: number }> => {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {};
  }
  if (typeof body !== 'object' || body === null) return {};
  const params = 'parameters' in body ? body.parameters : undefined;
  const retryAfter =
    typeof params === 'object' && params !== null && 'retry_after' in params
      ? params.retry_after
      : undefined;
  return {
    ...('description' in body && typeof body.description === 'string'
      ? { description: body.description }
      : {}),
    ...(typeof retryAfter === 'number' ? { retryAfter } : {}),
  };
};

/** sendMessage with parse_mode HTML (+ optional inline keyboard); retries once on 429 (retry_after ≤ 30 s). */
export async function sendMessage(
  config: TelegramConfig,
  html: string,
  deps: {
    fetch?: Fetch;
    sleep?: (ms: number) => Promise<void>;
    replyMarkup?: InlineKeyboard | undefined;
    /** disable_notification: delivered without a sound. */
    silent?: boolean | undefined;
  } = {},
): Promise<void> {
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const request = () =>
    doFetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: html,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(deps.replyMarkup ? { reply_markup: deps.replyMarkup } : {}),
        ...(deps.silent ? { disable_notification: true } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch((err: unknown) => {
      // Network errors may embed the request URL (and so the token): keep only the error name.
      throw new Error(`Telegram request failed (${err instanceof Error ? err.name : 'error'})`);
    });

  for (let attempt = 0; ; attempt++) {
    const res = await request();
    if (res.ok) return;
    const { retryAfter, description } = await readBody(res);
    if (res.status === 429 && attempt === 0 && retryAfter !== undefined) {
      await sleep(Math.min(retryAfter, MAX_RETRY_AFTER_S) * 1000);
      continue;
    }
    throw new TelegramApiError(res.status, description);
  }
}
