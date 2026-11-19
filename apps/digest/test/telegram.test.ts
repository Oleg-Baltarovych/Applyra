import { describe, expect, it, vi } from 'vitest';
import { readTelegramConfig, sendMessage, type Fetch } from '../src/telegram.ts';

const config = { token: '123:SECRET-TOKEN', chatId: '42' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('readTelegramConfig', () => {
  it('names the missing variables without echoing values', () => {
    expect(() => readTelegramConfig({ TELEGRAM_BOT_TOKEN: 'x' })).toThrow(
      'Missing environment variables: TELEGRAM_CHAT_ID',
    );
    expect(readTelegramConfig({ TELEGRAM_BOT_TOKEN: ' t ', TELEGRAM_CHAT_ID: '1' })).toEqual({
      token: 't',
      chatId: '1',
    });
  });
});

describe('sendMessage', () => {
  it('posts HTML to the Bot API', async () => {
    const fetch = vi.fn<Fetch>(async () => json(200, { ok: true }));
    await sendMessage(config, '<b>hi</b>', { fetch });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://api.telegram.org/bot123:SECRET-TOKEN/sendMessage');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      chat_id: '42',
      text: '<b>hi</b>',
      parse_mode: 'HTML',
    });
  });

  it('never puts the token into an error', async () => {
    const apiError = vi.fn<Fetch>(async () =>
      json(400, { ok: false, description: "Bad Request: can't parse entities" }),
    );
    const err = await sendMessage(config, 'x', { fetch: apiError }).catch((e: unknown) => e);
    expect(String(err)).toContain("HTTP 400: Bad Request: can't parse entities");
    expect(String(err)).not.toContain('SECRET-TOKEN');

    const network = vi.fn<Fetch>(async () => {
      throw new TypeError(`fetch failed for https://api.telegram.org/bot${config.token}/x`);
    });
    const netErr = await sendMessage(config, 'x', { fetch: network }).catch((e: unknown) => e);
    expect(String(netErr)).not.toContain('SECRET-TOKEN');
  });

  it('retries once after a 429 with retry_after', async () => {
    const fetch = vi
      .fn<Fetch>()
      .mockResolvedValueOnce(json(429, { ok: false, parameters: { retry_after: 2 } }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    const sleep = vi.fn(async () => {});
    await sendMessage(config, 'x', { fetch, sleep });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });
});
