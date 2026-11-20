/** The only network access of the source adapters: one GET per feed, bounded in time and size. */

export type FetchImpl = typeof fetch;

/** Identifies the client honestly; no personal data. */
const USER_AGENT = 'ApplyraDigest/1.0 (personal daily job digest; RSS reader)';
const TIMEOUT_MS = 20_000;
/** Real feeds are ≤ ~0.5 MB (100 Djinni items). */
export const MAX_BYTES = 2_000_000;

const errorName = (err: unknown) => (err instanceof Error ? err.name : 'error');

/**
 * GET `url` as UTF-8 text. Redirects are refused (a feed must not silently move to another host); the body
 * is read as a stream and aborted past MAX_BYTES. Errors carry `name` + HTTP status / error class only —
 * never the url, headers or body (errors are logged).
 */
export async function fetchText(
  name: string,
  url: string,
  fetchImpl: FetchImpl = fetch,
): Promise<string> {
  const fail = (what: string) => new Error(`${name}: ${what}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        headers: {
          'user-agent': USER_AGENT,
          accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.1',
        },
        redirect: 'error',
        signal: controller.signal,
      });
    } catch (err) {
      throw fail(`request failed (${errorName(err)})`);
    }
    if (!res.ok) throw fail(`HTTP ${res.status}`);
    if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES)
      throw fail('response too large');
    if (!res.body) return '';
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for await (const chunk of res.body) {
        size += chunk.byteLength;
        if (size > MAX_BYTES) break; // leaving the loop cancels the stream
        chunks.push(chunk);
      }
    } catch (err) {
      throw fail(`reading the response failed (${errorName(err)})`);
    }
    if (size > MAX_BYTES) throw fail('response too large');
    return new TextDecoder().decode(Buffer.concat(chunks));
  } finally {
    clearTimeout(timer);
  }
}
