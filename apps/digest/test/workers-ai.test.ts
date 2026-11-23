import { describe, expect, it } from 'vitest';
import { LlmError, type LlmRequest } from '../src/explain.ts';
import { readWorkersAiConfig, workersAi, WORKERS_AI_MODEL } from '../src/workers-ai.ts';

const config = { accountId: 'acc123456', token: 'secret-token-xyz' };
const request: LlmRequest = {
  system: 'sys',
  user: 'usr',
  schema: { type: 'object' },
  maxTokens: 300,
};
const signal = new AbortController().signal;

const reply = (status: number, body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

/** Records the call and returns `res`. */
function stubFetch(res: Response | (() => Promise<Response>)) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return typeof res === 'function' ? res() : res;
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

const failure = async (p: Promise<unknown>): Promise<LlmError> => {
  try {
    await p;
  } catch (err) {
    if (err instanceof LlmError) return err;
    throw err;
  }
  throw new Error('expected an LlmError');
};

describe('readWorkersAiConfig', () => {
  it('is off when neither variable is set, and needs both', () => {
    expect(readWorkersAiConfig({})).toBeUndefined();
    expect(
      readWorkersAiConfig({ CLOUDFLARE_ACCOUNT_ID: ' acc ', CLOUDFLARE_AI_TOKEN: ' tok ' }),
    ).toEqual({ accountId: 'acc', token: 'tok' });
    expect(() => readWorkersAiConfig({ CLOUDFLARE_ACCOUNT_ID: 'acc' })).toThrow(
      'Missing environment variables: CLOUDFLARE_AI_TOKEN',
    );
  });

  it('rejects an account id that would change the url path', () => {
    expect(() =>
      readWorkersAiConfig({ CLOUDFLARE_ACCOUNT_ID: '../x', CLOUDFLARE_AI_TOKEN: 't' }),
    ).toThrow(/CLOUDFLARE_ACCOUNT_ID/);
  });
});

describe('workersAi', () => {
  it('posts the chat messages with a json schema and the bearer token', async () => {
    const { fetch, calls } = stubFetch(
      reply(200, { success: true, result: { response: { fit: 'Node.js' } } }),
    );
    await workersAi(config, { fetch }).complete(request, signal);
    const [call] = calls;
    expect(call?.url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/acc123456/ai/run/${WORKERS_AI_MODEL}`,
    );
    expect(new Headers(call?.init.headers).get('authorization')).toBe('Bearer secret-token-xyz');
    expect(JSON.parse(String(call?.init.body))).toEqual({
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'usr' },
      ],
      response_format: { type: 'json_schema', json_schema: { type: 'object' } },
      max_tokens: 300,
      temperature: 0.2,
    });
    expect(call?.init.redirect).toBe('error');
  });

  it('returns the answer (object or JSON text) and the token usage', async () => {
    const obj = stubFetch(
      reply(200, {
        success: true,
        result: { response: { fit: 'a' }, usage: { prompt_tokens: 900, completion_tokens: 80 } },
      }),
    );
    expect(await workersAi(config, obj).complete(request, signal)).toEqual({
      value: { fit: 'a' },
      inputTokens: 900,
      outputTokens: 80,
    });
    const text = stubFetch(reply(200, { success: true, result: { response: '{"fit":"b"}' } }));
    expect(await workersAi(config, text).complete(request, signal)).toEqual({
      value: '{"fit":"b"}',
    });
  });

  it('classifies limit and auth errors, never leaking the token or account id', async () => {
    const limit = await failure(
      workersAi(
        config,
        stubFetch(reply(429, { errors: [{ code: 3036, message: 'quota' }] })),
      ).complete(request, signal),
    );
    expect(limit.kind).toBe('limit');
    const daily = await failure(
      workersAi(
        config,
        stubFetch(reply(400, { success: false, errors: [{ code: 3036, message: 'daily limit' }] })),
      ).complete(request, signal),
    );
    expect(daily.kind).toBe('limit');
    const auth = await failure(
      workersAi(
        config,
        stubFetch(reply(403, { errors: [{ code: 10000, message: 'no' }] })),
      ).complete(request, signal),
    );
    expect(auth.kind).toBe('auth');
    const other = await failure(
      workersAi(config, stubFetch(reply(500, 'oops'))).complete(request, signal),
    );
    expect(other.kind).toBe('other');
    expect(other.message).toBe('Workers AI failed with HTTP 500');
    for (const e of [limit, daily, auth, other]) {
      expect(e.message).not.toContain('secret-token-xyz');
      expect(e.message).not.toContain('acc123456');
    }
  });

  it('a network error keeps only its name', async () => {
    const e = await failure(
      workersAi(config, {
        fetch: async () => {
          throw new TypeError(
            'fetch failed https://api.cloudflare.com/client/v4/accounts/acc123456',
          );
        },
      }).complete(request, signal),
    );
    expect(e.message).toBe('Workers AI request failed (TypeError)');
  });

  it('an unsuccessful or malformed body is an error', async () => {
    const e = await failure(
      workersAi(config, stubFetch(reply(200, { success: false, result: null }))).complete(
        request,
        signal,
      ),
    );
    expect(e.kind).toBe('other');
    await failure(workersAi(config, stubFetch(reply(200, 'not json'))).complete(request, signal));
  });
});
