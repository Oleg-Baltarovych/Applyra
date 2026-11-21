import { describe, expect, it, vi } from 'vitest';
import { handleUpdate, statusReport, type Deps } from '../src/handler.ts';
import type { StatusRecord, StatusStore } from '../src/store.ts';
import { handleRequest, type Env } from '../src/worker.ts';

const OWNER = 42;
const now = new Date('2026-11-20T10:00:00Z');

function memoryStore(
  initial: StatusRecord[] = [],
): StatusStore & { rows: Map<string, StatusRecord> } {
  const rows = new Map(initial.map((r) => [r.vacancyId, r]));
  return {
    rows,
    get: async (id) => rows.get(id),
    put: async (r) => void rows.set(r.vacancyId, r),
    remove: async (id) => void rows.delete(id),
    list: async () => [...rows.values()].sort((a, b) => +b.updatedAt - +a.updatedAt),
  };
}

const setup = (initial: StatusRecord[] = []) => {
  const store = memoryStore(initial);
  const api = vi.fn<Deps['api']>(async () => {});
  const deps: Deps = { store, api, ownerChatId: OWNER, now };
  return { store, api, deps };
};

/** A digest vacancy message as Telegram echoes it back in callback_query.message. */
const vacancyMessage = {
  message_id: 7,
  chat: { id: OWNER, type: 'private' },
  text: 'Senior Backend Developer (Node.js)\nZeely AI · remote\nbackend · node.js · senior',
  entities: [
    { type: 'bold', offset: 0, length: 34 },
    {
      type: 'text_link',
      offset: 0,
      length: 34,
      url: 'https://jobs.dou.ua/companies/zeely/vacancies/1',
    },
  ],
};
const press = (data: string, over: Record<string, unknown> = {}) => ({
  callback_query: { id: 'cq1', from: { id: OWNER }, data, message: vacancyMessage, ...over },
});

describe('status buttons', () => {
  it('stores the status, redraws the keyboard with a status row and confirms', async () => {
    const { store, api, deps } = setup();
    await handleUpdate(press('s:a:dou:1'), deps);
    expect(store.rows.get('dou:1')).toEqual({
      vacancyId: 'dou:1',
      status: 'a',
      title: 'Senior Backend Developer (Node.js)',
      meta: 'Zeely AI · remote',
      url: 'https://jobs.dou.ua/companies/zeely/vacancies/1',
      updatedAt: now,
    });
    const [method, body] = api.mock.calls[0] ?? [];
    expect(method).toBe('editMessageReplyMarkup');
    expect(body).toMatchObject({ chat_id: OWNER, message_id: 7 });
    expect(JSON.stringify(body)).toContain('Статус: ✅ Відгукнувся · 20.11');
    expect(api.mock.calls[1]).toEqual([
      'answerCallbackQuery',
      { callback_query_id: 'cq1', text: 'Статус: ✅ Відгукнувся' },
    ]);
  });

  it('changes the status, and pressing the current one clears it', async () => {
    const { store, api, deps } = setup();
    await handleUpdate(press('s:a:dou:1'), deps);
    await handleUpdate(press('s:p:dou:1'), deps);
    expect(store.rows.get('dou:1')?.status).toBe('p');
    await handleUpdate(press('s:p:dou:1'), deps);
    expect(store.rows.has('dou:1')).toBe(false);
    const lastEdit = api.mock.calls.filter(([m]) => m === 'editMessageReplyMarkup').at(-1)?.[1];
    expect(JSON.stringify(lastEdit)).not.toContain('Статус:');
    expect(api.mock.calls.at(-1)?.[1]).toMatchObject({ text: 'Статус знято' });
  });

  it('ignores presses from anyone but the owner, and forged or no-op data', async () => {
    const { store, api, deps } = setup();
    await handleUpdate(press('s:a:dou:1', { from: { id: 999 } }), deps);
    expect(api).not.toHaveBeenCalled();
    await handleUpdate(press('noop'), deps);
    await handleUpdate(press('s:a:dou:1;DROP TABLE'), deps);
    await handleUpdate(
      press('s:a:dou:1', { message: { ...vacancyMessage, chat: { id: 999 } } }),
      deps,
    );
    expect(store.rows.size).toBe(0);
    expect(api.mock.calls.every(([m]) => m === 'answerCallbackQuery')).toBe(true);
  });

  it('"not interested" stores the status and deletes the message from the chat', async () => {
    const { store, api, deps } = setup();
    await handleUpdate(press('s:x:dou:1'), deps);
    expect(store.rows.get('dou:1')?.status).toBe('x');
    expect(api.mock.calls.map(([m]) => m)).toEqual(['deleteMessage', 'answerCallbackQuery']);
    expect(api.mock.calls[0]?.[1]).toEqual({ chat_id: OWNER, message_id: 7 });
    expect(api.mock.calls[1]?.[1]).toMatchObject({ text: 'Сховано. Список: /hidden' });
  });

  it('keeps the message with a status row when Telegram refuses to delete it (older than 48 h)', async () => {
    const { store, api, deps } = setup();
    api.mockImplementation(async (method) => {
      if (method === 'deleteMessage')
        throw new Error('Telegram deleteMessage failed with HTTP 400');
    });
    await handleUpdate(press('s:x:dou:1'), deps);
    expect(store.rows.get('dou:1')?.status).toBe('x');
    const edit = api.mock.calls.find(([m]) => m === 'editMessageReplyMarkup')?.[1];
    expect(JSON.stringify(edit)).toContain('Статус: 🚫 Не цікаво');
    expect(api.mock.calls.at(-1)?.[1]).toMatchObject({ text: 'Статус: 🚫 Не цікаво' });
  });

  it('keeps only http(s) links from the message', async () => {
    const { store, deps } = setup();
    const message = {
      ...vacancyMessage,
      entities: [{ type: 'text_link', offset: 0, length: 3, url: 'javascript:alert(1)' }],
    };
    await handleUpdate(press('s:a:dou:1', { message }), deps);
    expect(store.rows.get('dou:1')?.url).toBe('');
  });
});

const record = (over: Partial<StatusRecord>): StatusRecord => ({
  vacancyId: 'dou:1',
  status: 'a',
  title: 'Node.js Engineer',
  meta: 'Manoris · remote',
  url: 'https://jobs.dou.ua/v/1',
  updatedAt: now,
  ...over,
});

describe('/status', () => {
  it('lists vacancies by status with links; "not interested" only as a count', () => {
    const text = statusReport([
      record({ vacancyId: 'dou:1', status: 'p', title: 'Tech <Lead>' }),
      record({ vacancyId: 'dou:2', status: 'a' }),
      record({ vacancyId: 'dou:3', status: 'r', url: '' }),
      record({ vacancyId: 'dou:4', status: 'x' }),
    ]);
    expect(text).toContain(
      '<b>🔄 В процесі (1)</b>\n• <a href="https://jobs.dou.ua/v/1">Tech &lt;Lead&gt;</a>',
    );
    expect(text).toContain('<b>✅ Відгукнувся (1)</b>');
    expect(text).toContain('<b>❌ Відмова (1)</b>\n• Node.js Engineer · Manoris · remote · 20.11');
    expect(text).toContain('🚫 Не цікаво: 1 (/hidden)');
    expect(text).not.toContain('dou:4');
    expect(text.indexOf('В процесі')).toBeLessThan(text.indexOf('Відгукнувся'));
  });

  it('stays under the Telegram limit for a long list', () => {
    const many = Array.from({ length: 300 }, (_, i) =>
      record({ vacancyId: `dou:${i}`, title: 'T'.repeat(200) }),
    );
    const text = statusReport(many);
    expect(text.length).toBeLessThanOrEqual(4096);
    expect(text).toContain('список скорочено');
  });

  it('/hidden lists the "not interested" vacancies with links, so a mistaken press does not lose the vacancy', () => {
    const text = statusReport(
      [record({ status: 'x', title: 'Hidden one' }), record({ vacancyId: 'dou:2', status: 'a' })],
      ['x'],
    );
    expect(text).toBe(
      '<b>🚫 Не цікаво (1)</b>\n• <a href="https://jobs.dou.ua/v/1">Hidden one</a> · Manoris · remote · 20.11',
    );
    expect(statusReport([], ['x'])).toBe('Схованих вакансій немає.');
  });

  it('answers /status only in the owner chat', async () => {
    const { api, deps } = setup([record({})]);
    await handleUpdate({ message: { chat: { id: 999 }, text: '/status' } }, deps);
    expect(api).not.toHaveBeenCalled();
    await handleUpdate({ message: { chat: { id: OWNER }, text: '/status@Applyra_Bot' } }, deps);
    expect(api.mock.calls[0]?.[0]).toBe('sendMessage');
    expect(String(api.mock.calls[0]?.[1].text)).toContain('Node.js Engineer');
  });
});

describe('webhook endpoint', () => {
  const env = (over: Partial<Env> = {}): Env => ({
    DB: {
      prepare: () => ({
        bind: () => ({
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({}),
        }),
      }),
    },
    TELEGRAM_BOT_TOKEN: '123:TOKEN',
    OWNER_CHAT_ID: String(OWNER),
    WEBHOOK_SECRET: 'expected-secret',
    ...over,
  });
  const post = (secret: string | undefined, body = '{}', path = '/telegram') =>
    new Request(`https://bot.example.workers.dev${path}`, {
      method: 'POST',
      headers: secret === undefined ? {} : { 'x-telegram-bot-api-secret-token': secret },
      body,
    });

  it('rejects requests without the right secret', async () => {
    expect((await handleRequest(post(undefined), env())).status).toBe(403);
    expect((await handleRequest(post('wrong'), env())).status).toBe(403);
    expect((await handleRequest(post('expected-secret'), env({ WEBHOOK_SECRET: '' }))).status).toBe(
      403,
    );
  });
  it('accepts only POST /telegram and valid JSON', async () => {
    expect((await handleRequest(new Request('https://x.workers.dev/telegram'), env())).status).toBe(
      404,
    );
    expect((await handleRequest(post('expected-secret', '{}', '/other'), env())).status).toBe(404);
    expect((await handleRequest(post('expected-secret', 'not json'), env())).status).toBe(400);
    expect((await handleRequest(post('expected-secret', '{}'), env())).status).toBe(200);
  });
});
