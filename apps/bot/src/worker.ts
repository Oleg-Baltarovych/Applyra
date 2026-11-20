import { handleUpdate } from './handler.ts';
import { d1Store, type D1Like } from './store.ts';
import { botApi } from './telegram.ts';

export interface Env {
  DB: D1Like;
  TELEGRAM_BOT_TOKEN: string;
  /** Owner's chat id (= TELEGRAM_CHAT_ID of the digest). */
  OWNER_CHAT_ID: string;
  /** Sent by Telegram in X-Telegram-Bot-Api-Secret-Token (setWebhook secret_token). */
  WEBHOOK_SECRET: string;
}

const MAX_BODY = 1_000_000;

/** Length-independent comparison of the webhook secret. */
function sameSecret(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function handleRequest(
  request: Request,
  env: Env,
  now = new Date(),
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== '/telegram')
    return new Response('Not found', { status: 404 });
  const secret = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!env.WEBHOOK_SECRET || !sameSecret(secret, env.WEBHOOK_SECRET))
    return new Response('Forbidden', { status: 403 });
  const owner = Number(env.OWNER_CHAT_ID);
  if (!env.TELEGRAM_BOT_TOKEN || !Number.isSafeInteger(owner) || owner === 0)
    return new Response('Not configured', { status: 500 });

  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY)
    return new Response('Too large', { status: 413 });
  const body = await request.text();
  if (body.length > MAX_BODY) return new Response('Too large', { status: 413 });
  let update: unknown;
  try {
    update = JSON.parse(body);
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  try {
    await handleUpdate(update, {
      store: d1Store(env.DB),
      api: botApi(env.TELEGRAM_BOT_TOKEN),
      ownerChatId: owner,
      now,
    });
  } catch (err) {
    // 200 anyway: Telegram would otherwise redeliver the same update for hours. Message only (no secrets).
    console.error(`update failed: ${err instanceof Error ? err.message : 'error'}`);
  }
  return new Response('ok');
}

export default {
  fetch: (request: Request, env: Env): Promise<Response> => handleRequest(request, env),
};
