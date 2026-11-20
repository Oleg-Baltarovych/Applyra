import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { markSent, pruneState, selectNew } from './dedup.ts';
import { parseProfile, rank, type Profile } from './filter.ts';
import { formatDigest, type Message } from './format.ts';

const SEND_GAP_MS = 1100;
import { normalize } from './normalize/normalize.ts';
import { emailSource, imapMailbox, readImapConfig } from './sources/email.ts';
import { feedSources } from './sources/feeds.ts';
import { FakeSource, SAMPLE_ITEMS, type Source } from './sources/source.ts';
import { DEFAULT_STATE_PATH, fileStore, type StateStore } from './state.ts';
import { isRejectedMessage, readTelegramConfig, sendMessage } from './telegram.ts';
import type { RawItem, Vacancy } from './types.ts';

export interface RunOptions {
  sources: Source[];
  profile: Profile;
  store: StateStore;
  /** Print the messages instead of sending; the state is left untouched. */
  dryRun: boolean;
  now: Date;
  send: (message: Message) => Promise<void>;
  log: (line: string) => void;
}

export interface RunSummary {
  fetched: number;
  fresh: number;
  matched: number;
  sent: number;
  /** Vacancies whose message Telegram rejected (400 content error) — remembered, never retried. */
  rejected: number;
}

const MAX_LOG = 300;

/** Error text safe for logs: urls lose userinfo/query/fragment, one line, ≤ 300 chars. */
export function redact(text: string): string {
  const oneLine = text
    .replace(/https?:\/\/[^\s"'<>]+/gi, (raw) => {
      try {
        const u = new URL(raw);
        return `${u.protocol}//${u.host}${u.pathname === '/' ? '' : u.pathname}`;
      } catch {
        return '<url>';
      }
    })
    .replace(/\s+/g, ' ')
    .trim();
  return oneLine.length > MAX_LOG ? `${oneLine.slice(0, MAX_LOG - 1)}…` : oneLine;
}

const errorText = (err: unknown) => redact(err instanceof Error ? err.message : 'error');

/** fetch → normalize → dedup → filter/score → format → send → remember what was sent. */
export async function run(o: RunOptions): Promise<RunSummary> {
  const results = await Promise.allSettled(o.sources.map((s) => s.fetch()));
  const raw: RawItem[] = [];
  results.forEach((r, i) => {
    const name = o.sources[i]?.name ?? `#${i}`;
    if (r.status === 'fulfilled') raw.push(...r.value);
    else o.log(`source ${name} failed: ${errorText(r.reason)}`);
  });
  if (o.sources.length > 0 && results.every((r) => r.status === 'rejected'))
    throw new Error('All sources failed');

  const vacancies = raw
    .map((item) => normalize(item, o.now))
    .filter((v): v is Vacancy => v !== undefined);
  // A load failure throws here, before anything is sent or saved.
  let state = pruneState(await o.store.load(), o.now);
  const fresh = selectNew(vacancies, state);
  const ranked = rank(fresh, o.profile);
  const messages = formatDigest(ranked, { date: o.now });
  const summary: RunSummary = {
    fetched: raw.length,
    fresh: fresh.length,
    matched: ranked.length,
    sent: 0,
    rejected: 0,
  };

  if (o.dryRun) {
    // Feed text could look like a workflow command ("::add-mask::…"): the runner ignores commands
    // between ::stop-commands::<token> and ::<token>::; the indent is a second guard for humans/other CIs.
    const token = randomUUID();
    o.log(`::stop-commands::${token}`);
    for (const m of messages) o.log(`${m.text}\n${'─'.repeat(40)}`.replace(/^/gm, '  '));
    o.log(`::${token}::`);
    o.log(`dry run: ${JSON.stringify(summary)} — nothing sent, state unchanged`);
    return summary;
  }

  let failure: { error: unknown } | undefined;
  for (const [i, m] of messages.entries()) {
    try {
      await o.send(m);
      summary.sent += m.vacancies.length;
    } catch (error) {
      if (!isRejectedMessage(error)) {
        failure = { error };
        break;
      }
      // Resending can never succeed: quarantine (remember as sent) instead of blocking every future run.
      o.log(
        `message ${i + 1} rejected by Telegram (${errorText(error)}); skipping its ${m.vacancies.length} vacancies`,
      );
      summary.rejected += m.vacancies.length;
    }
    state = markSent(state, m.vacancies, o.now);
  }

  // Persist even after a failure, so delivered vacancies are not sent twice — but never let a save
  // error hide the send error that caused it.
  try {
    await o.store.save(state);
  } catch (saveError) {
    if (!failure) throw saveError;
    o.log(`saving state failed: ${errorText(saveError)}`);
  }
  if (failure) throw failure.error;
  o.log(`done: ${JSON.stringify(summary)}`);
  return summary;
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────

const flag = (args: string[], name: string) =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

/**
 * Source names → sources: RSS sites (sources/feeds.ts), `email` (IMAP alerts, needs IMAP_* env),
 * `fake` (dry-run only).
 */
export function createSources(
  names: string[],
  dryRun: boolean,
  env: Record<string, string | undefined> = {},
  now: Date = new Date(),
): Source[] {
  // A Set: a repeated name must not fetch its feeds twice (one request per feed per run).
  return [...new Set(names)].flatMap((name) => {
    if (name === 'fake') {
      if (!dryRun) throw new Error('Source "fake" is allowed only with --dry-run');
      return [new FakeSource(SAMPLE_ITEMS)];
    }
    if (name === 'email') return [emailSource(imapMailbox(readImapConfig(env)), now)];
    const sources = feedSources(name);
    if (!sources) throw new Error(`Unknown source: ${name}`);
    return sources;
  });
}

async function cli(args: string[], env: Record<string, string | undefined>): Promise<void> {
  const dryRun = args.includes('--dry-run');
  const names = (flag(args, 'source') ?? env.DIGEST_SOURCES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length === 0) {
    console.log('No sources configured (DIGEST_SOURCES or --source=); nothing to do.');
    return;
  }
  const now = new Date();
  const sources = createSources(names, dryRun, env, now);
  const profilePath = flag(args, 'profile') ?? env.DIGEST_PROFILE_PATH ?? 'profile.json';
  const profile = parseProfile(JSON.parse(await readFile(profilePath, 'utf8')));
  const telegram = dryRun ? undefined : readTelegramConfig(env);
  // One message per vacancy: stay under Telegram's ~1 message/second per chat.
  let lastSent = 0;
  await run({
    sources,
    profile,
    store: fileStore(env.DIGEST_STATE_PATH || DEFAULT_STATE_PATH),
    dryRun,
    now,
    send: async (message) => {
      if (!telegram) throw new Error('Telegram is not configured');
      const wait = lastSent + SEND_GAP_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastSent = Date.now();
      await sendMessage(telegram, message.text, { replyMarkup: message.replyMarkup });
    },
    log: (line) => console.log(line),
  });
}

if (import.meta.main) {
  cli(process.argv.slice(2), process.env).catch((err: unknown) => {
    // Message only: our errors never carry secrets (telegram.ts strips the URL).
    console.error(err instanceof Error ? err.message : 'Unexpected error');
    process.exitCode = 1;
  });
}
