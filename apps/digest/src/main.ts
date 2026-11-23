import { randomUUID } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import { markSent, pruneState, selectNew } from './dedup.ts';
import { explainAll, statsReport, type ExplainOptions, type LlmClient } from './explain.ts';
import { parseProfile, rank, type Profile } from './filter.ts';
import { alertMessage, formatDigest, type Message } from './format.ts';

const SEND_GAP_MS = 1100;
import { normalize } from './normalize/normalize.ts';
import { emailSource, imapMailbox, readImapConfig } from './sources/email.ts';
import { feedSources } from './sources/feeds.ts';
import { FakeSource, SAMPLE_ITEMS, type Source } from './sources/source.ts';
import { DEFAULT_STATE_PATH, fileStore, type StateStore } from './state.ts';
import {
  isRejectedMessage,
  readTelegramConfig,
  sendMessage,
  type TelegramConfig,
} from './telegram.ts';
import type { RawItem, Vacancy } from './types.ts';
import { readWorkersAiConfig, workersAi } from './workers-ai.ts';

export interface RunOptions {
  sources: Source[];
  profile: Profile;
  store: StateStore;
  /** Print the messages instead of sending; the state is left untouched. */
  dryRun: boolean;
  now: Date;
  send: (message: Message) => Promise<void>;
  log: (line: string) => void;
  /** Fit explanations (ADR 005); off when absent. */
  llm?: LlmClient | undefined;
  explainOptions?: ExplainOptions;
  /** Receives the explanation stats (e.g. for the Actions step summary); its failure is only logged. */
  report?: ((lines: string[]) => Promise<void>) | undefined;
  /** Why explanations are off although configured (e.g. one of the two variables missing) → alert line. */
  llmConfigError?: string | undefined;
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
  const failed: string[] = [];
  results.forEach((r, i) => {
    const name = o.sources[i]?.name ?? `#${i}`;
    if (r.status === 'fulfilled') raw.push(...r.value);
    else {
      o.log(`source ${name} failed: ${errorText(r.reason)}`);
      failed.push(`${name}: ${errorText(r.reason)}`);
    }
  });
  if (o.sources.length > 0 && failed.length === o.sources.length)
    throw new Error(`All sources failed (${failed.join('; ')})`);

  const vacancies = raw
    .map((item) => normalize(item, o.now))
    .filter((v): v is Vacancy => v !== undefined);
  // A load failure throws here, before anything is sent or saved.
  let state = pruneState(await o.store.load(), o.now);
  const fresh = selectNew(vacancies, state, o.now);
  const ranked = rank(fresh, o.profile);
  let items = ranked;
  let explainProblem = o.llmConfigError;
  if (o.llm && ranked.length > 0) {
    const explained = await explainAll(ranked, o.profile, o.llm, o.explainOptions);
    items = explained.items;
    const lines = statsReport(explained.stats).map(redact);
    for (const line of lines) o.log(line);
    if (o.report)
      await o.report(lines).catch((err: unknown) => o.log(`report failed: ${errorText(err)}`));
    // Alert when nothing was explained, or a limit/budget cut the run short; a few odd answers are only logged.
    const { ok, failed: broken, stopped, firstError } = explained.stats;
    if (broken > 0 && (ok === 0 || stopped))
      explainProblem = redact(
        `${ranked.length - ok} з ${ranked.length} без пояснення (${firstError ?? 'error'})`,
      );
  }
  const messages = formatDigest(items, { date: o.now });
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
  const problems = [...failed, ...(explainProblem ? [`пояснення: ${explainProblem}`] : [])];
  if (problems.length > 0) {
    // After the digest and the state save: an alert that cannot be delivered never costs a vacancy.
    const title =
      failed.length > 0 ? 'не відповіли джерела, дайджест — з решти' : 'дайджест без пояснень';
    try {
      await o.send(alertMessage(title, problems));
    } catch (error) {
      o.log(`alert failed: ${errorText(error)}`);
    }
  }
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
  const telegram = dryRun ? undefined : readTelegramConfig(env);
  try {
    await digest(args, env, dryRun, names, telegram);
  } catch (err) {
    // Tell the owner, or a broken run goes unnoticed until someone misses the digest.
    if (telegram)
      await sendMessage(
        telegram,
        alertMessage('дайджест не надіслано', [errorText(err)]).text,
      ).catch(() => console.error('failure alert could not be sent'));
    throw err;
  }
}

async function digest(
  args: string[],
  env: Record<string, string | undefined>,
  dryRun: boolean,
  names: string[],
  telegram: TelegramConfig | undefined,
): Promise<void> {
  const now = new Date();
  const sources = createSources(names, dryRun, env, now);
  const profilePath = flag(args, 'profile') ?? env.DIGEST_PROFILE_PATH ?? 'profile.json';
  const profile = parseProfile(JSON.parse(await readFile(profilePath, 'utf8')));
  // Explanations are optional: a misconfiguration turns them off, never the digest.
  let llm: LlmClient | undefined;
  let llmConfigError: string | undefined;
  try {
    const ai = readWorkersAiConfig(env);
    llm = ai ? workersAi(ai) : undefined;
  } catch (err) {
    llmConfigError = errorText(err);
    console.log(`explanations off: ${llmConfigError}`);
  }
  const summaryPath = env.GITHUB_STEP_SUMMARY;
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
      await sendMessage(telegram, message.text, {
        replyMarkup: message.replyMarkup,
        silent: message.silent,
      });
    },
    log: (line) => console.log(line),
    llm,
    llmConfigError,
    report: summaryPath
      ? (lines) =>
          appendFile(
            summaryPath,
            [
              '### Fit explanations',
              '',
              '```text',
              ...lines.map((l) => l.replaceAll('`', "'")),
              '```',
              '',
            ].join('\n'),
          )
      : undefined,
  });
}

if (import.meta.main) {
  cli(process.argv.slice(2), process.env).catch((err: unknown) => {
    // Message only: our errors never carry secrets (telegram.ts strips the URL).
    console.error(err instanceof Error ? err.message : 'Unexpected error');
    process.exitCode = 1;
  });
}
