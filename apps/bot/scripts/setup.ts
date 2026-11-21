// One-time setup after `pnpm --filter @applyra/bot deploy` (run from apps/bot):
//   node --env-file=../../.env scripts/setup.ts https://applyra-bot.<your-subdomain>.workers.dev
// Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from the env file, generates a webhook secret, stores the three
// as Worker secrets (piped to `wrangler secret put`, never printed) and points the bot's webhook at the Worker.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const workerUrl = process.argv[2];
const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
if (!workerUrl || !/^https:\/\/[\w.-]+\.workers\.dev\/?$/.test(workerUrl)) {
  console.error(
    'Usage: node --env-file=../../.env scripts/setup.ts https://<name>.<subdomain>.workers.dev',
  );
  process.exit(1);
}
if (!token || !chatId) {
  console.error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set (see .env.example).');
  process.exit(1);
}

const webhookSecret = randomBytes(32).toString('hex');
const secrets: [string, string][] = [
  ['TELEGRAM_BOT_TOKEN', token],
  ['OWNER_CHAT_ID', chatId],
  ['WEBHOOK_SECRET', webhookSecret],
];
for (const [name, value] of secrets) {
  // Value goes through stdin only; the command line holds just the (constant) name.
  const r = spawnSync(`pnpm exec wrangler secret put ${name}`, {
    input: value,
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: true,
  });
  if (r.status !== 0) {
    console.error(`Setting ${name} failed.`);
    process.exit(1);
  }
}

// The Worker already holds the new secret: until setWebhook succeeds, Telegram's updates are refused (403).
const rerun = ' The Worker has a new secret now — rerun this setup.';
const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    url: `${workerUrl.replace(/\/$/, '')}/telegram`,
    secret_token: webhookSecret,
    allowed_updates: ['message', 'callback_query'],
  }),
  signal: AbortSignal.timeout(15_000),
}).catch((err: unknown) => {
  // The error (and its cause) may contain the token-bearing URL: print only its class.
  console.error(
    `setWebhook request failed (${err instanceof Error ? err.name : 'error'}).${rerun}`,
  );
  process.exit(1);
});
const body: unknown = await res.json().catch(() => ({}));
const description =
  typeof body === 'object' && body !== null && 'description' in body
    ? String(body.description)
    : '';
if (!res.ok) {
  console.error(
    `setWebhook failed with HTTP ${res.status}${description ? `: ${description}` : ''}.${rerun}`,
  );
  process.exit(1);
}
console.log(`Webhook set (${description || 'ok'}). Send /status to the bot to check.`);
