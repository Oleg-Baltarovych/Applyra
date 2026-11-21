// Minimal Bot API client for the worker. The token is part of the URL: errors carry the method and HTTP
// status only, never the URL or the response body.

export type BotApi = (method: string, body: Record<string, unknown>) => Promise<void>;

export function botApi(token: string, fetchImpl: typeof fetch = fetch): BotApi {
  return async (method, body) => {
    let res: Response;
    try {
      res = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      // No cause: a network error may embed the request URL, and so the token.
      // eslint-disable-next-line preserve-caught-error -- the cause would carry the token-bearing URL
      throw new Error(`Telegram ${method} failed (${err instanceof Error ? err.name : 'error'})`);
    }
    if (!res.ok) throw new Error(`Telegram ${method} failed with HTTP ${res.status}`);
  };
}
