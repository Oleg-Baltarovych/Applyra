import { ImapFlow, type MessageStructureObject } from 'imapflow';
import { alertItems, dkimPassDomains, type MailMessage } from './alerts.ts';
import type { Source } from './source.ts';

/**
 * Job-alert e-mails from sites without a public feed (Work.ua, robota.ua, LinkedIn): the owner subscribes
 * a dedicated mailbox to their alerts; this source reads it over IMAP (TLS, read-only, nothing is marked
 * or deleted). Re-reading the same mails each day is harmless: dedup state drops what was already sent.
 */
export interface Mailbox {
  messagesSince(since: Date): Promise<MailMessage[]>;
}

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

/** Mails from the last N days are read every run (covers a missed day or two). */
export const LOOKBACK_DAYS = 3;
const MAX_MESSAGES = 100;
const MAX_HTML_BYTES = 1_000_000;

/** IMAP settings from env; throws (without values) when the credentials are missing. */
export function readImapConfig(env: Record<string, string | undefined>): ImapConfig {
  const user = env.IMAP_USER?.trim();
  const password = env.IMAP_PASSWORD;
  if (!user || !password) throw new Error('email: IMAP_USER and IMAP_PASSWORD must be set');
  const port = Number(env.IMAP_PORT || 993);
  if (!Number.isInteger(port) || port <= 0 || port > 65535)
    throw new Error('email: IMAP_PORT must be a port number');
  return { host: env.IMAP_HOST?.trim() || 'imap.gmail.com', port, user, password };
}

/** The text/html part number of a message structure (single-part html → '1'), if any. */
export function htmlPart(node: MessageStructureObject | undefined): string | undefined {
  if (!node) return undefined;
  if (node.childNodes?.length) {
    for (const child of node.childNodes) {
      const part = htmlPart(child);
      if (part) return part;
    }
    return undefined;
  }
  const attachment = node.disposition?.toLowerCase() === 'attachment';
  return node.type.toLowerCase() === 'text/html' && !attachment ? (node.part ?? '1') : undefined;
}

/** Error text without server responses or credentials: only the error class / code. */
function imapError(stage: string, err: unknown): Error {
  const e = err as { authenticationFailed?: boolean; code?: unknown } | undefined;
  const why = e?.authenticationFailed
    ? 'authentication failed'
    : typeof e?.code === 'string'
      ? e.code
      : err instanceof Error
        ? err.name
        : 'error';
  return new Error(`email: IMAP ${stage} failed (${why})`);
}

/** Reads a decoded part, cutting it at MAX_HTML_BYTES (the decoded size can exceed the transfer size). */
async function readAll(stream: AsyncIterable<Buffer | string>): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of stream) {
    const chunk = typeof c === 'string' ? Buffer.from(c) : c;
    chunks.push(chunk);
    size += chunk.byteLength;
    if (size >= MAX_HTML_BYTES) break; // leaving the loop destroys the stream
  }
  return Buffer.concat(chunks).subarray(0, MAX_HTML_BYTES).toString('utf8');
}

export function imapMailbox(config: ImapConfig): Mailbox {
  return {
    async messagesSince(since) {
      const client = new ImapFlow({
        host: config.host,
        port: config.port,
        secure: true,
        auth: { user: config.user, pass: config.password },
        logger: false, // its logs would include server responses
        disableAutoIdle: true,
        connectionTimeout: 20_000,
        greetingTimeout: 15_000,
        socketTimeout: 60_000,
      });
      // An 'error' event without a listener would crash the process.
      client.on('error', () => {});
      try {
        await client.connect();
      } catch (err) {
        throw imapError('login', err);
      }
      const out: MailMessage[] = [];
      try {
        const lock = await client.getMailboxLock('INBOX', { readOnly: true });
        try {
          const uids = (await client.search({ since }, { uid: true })) || [];
          const recent = uids.slice(-MAX_MESSAGES);
          if (recent.length === 0) return out;
          const messages = await client.fetchAll(
            recent,
            {
              uid: true,
              envelope: true,
              bodyStructure: true,
              internalDate: true,
              headers: ['authentication-results'],
            },
            { uid: true },
          );
          for (const m of messages) {
            const part = htmlPart(m.bodyStructure);
            const from = m.envelope?.from?.[0]?.address;
            if (!part || !from) continue;
            const download = await client.download(String(m.uid), part, {
              uid: true,
              maxBytes: MAX_HTML_BYTES,
            });
            if (!download.content) continue;
            const received = new Date(m.internalDate ?? m.envelope?.date ?? since);
            const date = Number.isNaN(received.getTime()) ? since : received;
            out.push({
              from,
              dkimDomains: dkimPassDomains(m.headers?.toString('utf8') ?? ''),
              date,
              html: await readAll(download.content),
            });
          }
          return out;
        } finally {
          lock.release();
        }
      } catch (err) {
        throw imapError('read', err);
      } finally {
        await client.logout().catch(() => {});
      }
    },
  };
}

/** The `email` source: alert mails from the last LOOKBACK_DAYS → raw items (one per vacancy link). */
export function emailSource(mailbox: Mailbox, now: Date): Source {
  return {
    name: 'email',
    fetch: async () => {
      const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
      const messages = await mailbox.messagesSince(since);
      return messages.flatMap(alertItems);
    },
  };
}
