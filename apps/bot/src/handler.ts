import {
  parseCallback,
  shortDate,
  STATUS_LABEL,
  statusKeyboard,
  type StatusCode,
} from '@applyra/digest/status';
import type { StatusRecord, StatusStore } from './store.ts';
import type { BotApi } from './telegram.ts';

export interface Deps {
  store: StatusStore;
  api: BotApi;
  /** The only chat the bot answers (TELEGRAM_CHAT_ID of the digest). */
  ownerChatId: number;
  now: Date;
}

// ── untrusted update → the few fields we use ─────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

interface VacancyMessage {
  chatId: number;
  messageId: number;
  title: string;
  meta: string;
  url: string;
}

const MAX_FIELD = 300;

/** Title (line 1), meta (line 2) and the title link of a digest vacancy message. */
function readVacancyMessage(m: unknown): VacancyMessage | undefined {
  if (!isObj(m) || !isObj(m.chat)) return undefined;
  const chatId = num(m.chat.id);
  const messageId = num(m.message_id);
  const text = str(m.text);
  if (chatId === undefined || messageId === undefined || !text) return undefined;
  const [title = '', meta = ''] = text.split('\n');
  const link = Array.isArray(m.entities)
    ? m.entities.find((e) => isObj(e) && e.type === 'text_link' && typeof e.url === 'string')
    : undefined;
  const url = isObj(link) ? (str(link.url) ?? '') : '';
  return {
    chatId,
    messageId,
    title: title.slice(0, MAX_FIELD),
    meta: meta.slice(0, MAX_FIELD),
    url: /^https?:\/\//i.test(url) ? url.slice(0, 1000) : '',
  };
}

// ── handlers ─────────────────────────────────────────────────────────────────────────────────────

/** A status button was pressed: store it (pressing the current one clears it) and redraw the keyboard. */
async function onStatusButton(cq: Record<string, unknown>, deps: Deps): Promise<void> {
  const id = str(cq.id);
  if (!id) return;
  const answer = (text: string) => deps.api('answerCallbackQuery', { callback_query_id: id, text });
  const parsed = parseCallback(str(cq.data) ?? '');
  const msg = readVacancyMessage(cq.message);
  if (!parsed || !msg || msg.chatId !== deps.ownerChatId) return answer('');

  const previous = await deps.store.get(parsed.vacancyId);
  const cleared = previous?.status === parsed.code;
  let current: { code: StatusCode; at: Date } | undefined;
  if (cleared) {
    await deps.store.remove(parsed.vacancyId);
  } else {
    current = { code: parsed.code, at: deps.now };
    await deps.store.put({
      vacancyId: parsed.vacancyId,
      status: parsed.code,
      title: msg.title || previous?.title || parsed.vacancyId,
      meta: msg.meta || previous?.meta || '',
      url: msg.url || previous?.url || '',
      updatedAt: deps.now,
    });
  }
  // "Not interested" removes the vacancy from the chat (it stays in /hidden). Telegram refuses to delete
  // messages older than 48 h: those keep a status row instead.
  if (current?.code === 'x') {
    const deleted = await deps
      .api('deleteMessage', { chat_id: msg.chatId, message_id: msg.messageId })
      .then(() => true)
      .catch(() => false);
    if (deleted) return answer('Сховано. Список: /hidden');
  }
  await deps.api('editMessageReplyMarkup', {
    chat_id: msg.chatId,
    message_id: msg.messageId,
    reply_markup: statusKeyboard(parsed.vacancyId, current),
  });
  await answer(current ? `Статус: ${STATUS_LABEL[current.code]}` : 'Статус знято');
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const LIMIT = 4000;
const GROUPS: StatusCode[] = ['p', 'a', 'r'];

/**
 * Vacancies grouped by status, with links. /status: in progress, applied, rejected, and "not interested" as a
 * count only; /hidden: the "not interested" ones (their messages were deleted from the chat).
 */
export function statusReport(records: StatusRecord[], groups: StatusCode[] = GROUPS): string {
  const hiddenOnly = !groups.some((code) => code !== 'x');
  if (!records.some((r) => groups.includes(r.status) || (!hiddenOnly && r.status === 'x')))
    return hiddenOnly
      ? 'Схованих вакансій немає.'
      : 'Поки що немає вакансій зі статусом. Натисни кнопку під вакансією в дайджесті.';
  const parts: string[] = [];
  for (const code of groups) {
    const group = records.filter((r) => r.status === code);
    if (group.length === 0) continue;
    const lines = group.map((r) => {
      const title = escapeHtml(r.title);
      const link = r.url ? `<a href="${escapeHtml(r.url)}">${title}</a>` : title;
      const meta = r.meta ? ` · ${escapeHtml(r.meta)}` : '';
      return `• ${link}${meta} · ${shortDate(r.updatedAt)}`;
    });
    parts.push(`<b>${STATUS_LABEL[code]} (${group.length})</b>\n${lines.join('\n')}`);
  }
  const skipped = records.filter((r) => r.status === 'x').length;
  if (skipped && !groups.includes('x')) parts.push(`${STATUS_LABEL.x}: ${skipped} (/hidden)`);
  let text = parts.join('\n\n');
  if (text.length > LIMIT) {
    // Cut at a line boundary so no tag or entity is split.
    const cut = text.lastIndexOf('\n', LIMIT - 40);
    text = `${text.slice(0, cut)}\n… список скорочено`;
  }
  return text;
}

const HELP =
  'Під кожною вакансією в дайджесті є кнопки статусу. Натисни ще раз на поточний статус, щоб зняти його.\n/status — усі вакансії за статусами.\n/hidden — сховані («Не цікаво»): їх прибрано з чату, тут лишаються посилання.';

async function onMessage(m: Record<string, unknown>, deps: Deps): Promise<void> {
  if (!isObj(m.chat) || num(m.chat.id) !== deps.ownerChatId) return;
  const command = (str(m.text) ?? '').trim().split(/[\s@]/)[0];
  const reply = (text: string) =>
    deps.api('sendMessage', {
      chat_id: deps.ownerChatId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  if (command === '/status') return reply(statusReport(await deps.store.list()));
  if (command === '/hidden') return reply(statusReport(await deps.store.list(), ['x']));
  if (command === '/start' || command === '/help') return reply(HELP);
}

/** One Telegram update (already authenticated by the webhook secret). Updates from other chats are ignored. */
export async function handleUpdate(update: unknown, deps: Deps): Promise<void> {
  if (!isObj(update)) return;
  if (isObj(update.callback_query)) {
    const cq = update.callback_query;
    if (!isObj(cq.from) || num(cq.from.id) !== deps.ownerChatId) return;
    return onStatusButton(cq, deps);
  }
  if (isObj(update.message)) return onMessage(update.message, deps);
}
