// Cloudflare Workers AI adapter for the fit explanations (ADR 005). The account id is in the url and the
// token in a header: errors carry only the status and Cloudflare's error code/message, never either.

import { LlmError, type LlmAnswer, type LlmClient, type Pricing } from './explain.ts';

export const WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
/** developers.cloudflare.com/workers-ai/platform/pricing (2026-11-18). */
const PRICING: Pricing = {
  neuronsPerMInput: 26_668,
  neuronsPerMOutput: 204_805,
  usdPerKNeurons: 0.011,
  freeNeuronsPerDay: 10_000,
};
/** Cloudflare error code for an exhausted daily allocation. */
const DAILY_LIMIT_CODE = 3036;
const MAX_ERROR = 200;

export interface WorkersAiConfig {
  accountId: string;
  token: string;
}

/** CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_TOKEN: both → on, neither → off (undefined), one → error naming the other. */
export function readWorkersAiConfig(
  env: Record<string, string | undefined>,
): WorkersAiConfig | undefined {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = env.CLOUDFLARE_AI_TOKEN?.trim();
  if (!accountId && !token) return undefined;
  if (!accountId || !token) {
    const missing = !accountId ? 'CLOUDFLARE_ACCOUNT_ID' : 'CLOUDFLARE_AI_TOKEN';
    throw new Error(`Missing environment variables: ${missing}`);
  }
  if (!/^[A-Za-z0-9]+$/.test(accountId))
    throw new Error('Invalid CLOUDFLARE_ACCOUNT_ID: letters and digits only');
  return { accountId, token };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const count = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;

/** First `{ code, message }` of Cloudflare's `errors` array. */
function firstError(body: unknown): { code?: number; message?: string } {
  const e = isRecord(body) && Array.isArray(body.errors) ? body.errors[0] : undefined;
  if (!isRecord(e)) return {};
  return {
    ...(typeof e.code === 'number' ? { code: e.code } : {}),
    ...(typeof e.message === 'string'
      ? { message: e.message.replace(/\s+/g, ' ').slice(0, MAX_ERROR) }
      : {}),
  };
}

export function workersAi(config: WorkersAiConfig, deps: { fetch?: typeof fetch } = {}): LlmClient {
  const doFetch = deps.fetch ?? fetch;
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${WORKERS_AI_MODEL}`;
  return {
    model: WORKERS_AI_MODEL,
    pricing: PRICING,
    async complete(request, signal): Promise<LlmAnswer> {
      const res = await doFetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
          response_format: { type: 'json_schema', json_schema: request.schema },
          max_tokens: request.maxTokens,
          temperature: 0.2,
        }),
        redirect: 'error',
        signal,
      }).catch((err: unknown) => {
        // The original message may embed the url (account id): keep only the error name.
        throw new LlmError(
          'other',
          `Workers AI request failed (${err instanceof Error ? err.name : 'error'})`,
        );
      });

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = undefined;
      }
      const error = firstError(body);
      // Defence in depth: Cloudflare's text should never echo the secrets, but mask them if it does.
      const detail = error.message
        ? `: ${error.message.replaceAll(config.token, '***').replaceAll(config.accountId, '***')}`
        : '';
      if (res.status === 429 || error.code === DAILY_LIMIT_CODE)
        throw new LlmError('limit', `Workers AI limit reached (HTTP ${res.status})${detail}`);
      if (res.status === 401 || res.status === 403)
        throw new LlmError('auth', `Workers AI rejected the token (HTTP ${res.status})${detail}`);
      if (!res.ok) throw new LlmError('other', `Workers AI failed with HTTP ${res.status}`);
      if (!isRecord(body) || body.success !== true || !isRecord(body.result))
        throw new LlmError('other', `Workers AI returned an unexpected body${detail}`);

      const { response, usage } = body.result;
      const inputTokens = isRecord(usage) ? count(usage.prompt_tokens) : undefined;
      const outputTokens = isRecord(usage) ? count(usage.completion_tokens) : undefined;
      return {
        value: response,
        ...(inputTokens === undefined ? {} : { inputTokens }),
        ...(outputTokens === undefined ? {} : { outputTokens }),
      };
    },
  };
}
