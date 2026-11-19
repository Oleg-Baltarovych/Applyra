import type { ErrorEvent } from '@sentry/nestjs';
import { describe, expect, it } from 'vitest';
import { scrubBreadcrumb, scrubEvent } from './scrub.js';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';

const REDACTED = '[REDACTED]';

const event = (overrides: Partial<ErrorEvent>): ErrorEvent => ({ type: undefined, ...overrides });

describe('scrubEvent (Sentry beforeSend, 09 §10 / §12)', () => {
  it('drops cookies, body, query string and env from the request and strips the query from its url', () => {
    const scrubbed = scrubEvent(
      event({
        request: {
          method: 'POST',
          url: 'https://api.applyra.localhost/api/v1/me?token=abc#frag',
          cookies: { '__Host-applyra.session': 'sess' },
          data: { notes: 'private', password: 'pw' },
          query_string: 'token=abc',
          env: { REMOTE_ADDR: '203.0.113.7' },
        },
      }),
    );

    expect(scrubbed.request).toEqual({
      method: 'POST',
      url: 'https://api.applyra.localhost/api/v1/me',
    });
  });

  it('keeps only allowlisted request headers (no authorization, cookie, api key or client ip)', () => {
    const scrubbed = scrubEvent(
      event({
        request: {
          headers: {
            Authorization: 'Bearer t0k3n',
            cookie: 'a=b',
            'set-cookie': 'c=d',
            'x-api-key': 'k',
            'x-forwarded-for': '203.0.113.7',
            'cf-connecting-ip': '203.0.113.7',
            'User-Agent': 'vitest',
            'x-request-id': 'req-1',
            referer: 'https://app.applyra.localhost/x?code=oauth',
          },
        },
      }),
    );

    expect(scrubbed.request?.headers).toEqual({ 'User-Agent': 'vitest', 'x-request-id': 'req-1' });
  });

  it('reduces the user to its id (no email, ip or username)', () => {
    const scrubbed = scrubEvent(
      event({
        user: { id: 'u-1', email: 'alice@example.com', ip_address: '203.0.113.7', username: 'al' },
      }),
    );
    expect(scrubbed.user).toEqual({ id: 'u-1' });
  });

  it('removes a user without an id entirely', () => {
    const scrubbed = scrubEvent(event({ user: { email: 'alice@example.com' } }));
    expect(scrubbed.user).toBeUndefined();
  });

  it('masks emails in the message, log entry and exception values', () => {
    const scrubbed = scrubEvent(
      event({
        message: 'failed for alice@example.com',
        logentry: { message: 'bob@example.org signed in', params: ['carol@example.net'] },
        exception: {
          values: [{ type: 'Error', value: 'Key (email)=(alice@example.com) already exists' }],
        },
      }),
    );

    expect(scrubbed.message).toBe('failed for a***@example.com');
    expect(scrubbed.logentry).toEqual({
      message: 'b***@example.org signed in',
      params: ['c***@example.net'],
    });
    expect(scrubbed.exception?.values?.[0]?.value).toBe(
      'Key (email)=(a***@example.com) already exists',
    );
  });

  it('drops local variables from stack frames but keeps the frames', () => {
    const scrubbed = scrubEvent(
      event({
        exception: {
          values: [
            {
              type: 'Error',
              stacktrace: {
                frames: [{ filename: 'dist/main.js', lineno: 1, vars: { password: 'pw' } }],
              },
            },
          ],
        },
      }),
    );

    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames).toEqual([
      { filename: 'dist/main.js', lineno: 1 },
    ]);
  });

  it('redacts the logging key list at any depth in extra, contexts and tags', () => {
    const scrubbed = scrubEvent(
      event({
        extra: {
          token: 't',
          nested: { deeper: { accessToken: 'a', email: 'alice@example.com', kept: 'ok' } },
          url: 'https://x.test/upload?X-Amz-Signature=s',
          ip: '203.0.113.7',
        },
        contexts: { app: { secret: 's', app_name: 'api' } },
        tags: { requestId: 'req-1', email: 'alice@example.com' },
      }),
    );

    expect(scrubbed.extra).toEqual({
      token: REDACTED,
      nested: { deeper: { accessToken: REDACTED, email: 'a***@example.com', kept: 'ok' } },
      url: 'https://x.test/upload',
      ip: '203.0.113.0/24',
    });
    expect(scrubbed.contexts).toEqual({ app: { secret: REDACTED, app_name: 'api' } });
    expect(scrubbed.tags).toEqual({ requestId: 'req-1', email: 'a***@example.com' });
  });

  it('scrubs breadcrumb data and messages (outgoing http urls lose their query)', () => {
    const scrubbed = scrubEvent(
      event({
        breadcrumbs: [
          {
            category: 'http',
            data: { url: 'https://oauth2.googleapis.com/token?code=c', method: 'POST' },
          },
          { category: 'console', message: 'hello alice@example.com' },
        ],
      }),
    );

    expect(scrubbed.breadcrumbs).toEqual([
      { category: 'http', data: { url: 'https://oauth2.googleapis.com/token', method: 'POST' } },
      { category: 'console', message: 'hello a***@example.com' },
    ]);
  });

  it('does not mutate the input event', () => {
    const input = event({ user: { id: 'u-1', email: 'alice@example.com' }, extra: { token: 't' } });
    scrubEvent(input);
    expect(input).toEqual(
      event({ user: { id: 'u-1', email: 'alice@example.com' }, extra: { token: 't' } }),
    );
  });

  it('leaves an event without sensitive fields unchanged', () => {
    const input = event({ level: 'error', environment: 'production', tags: { requestId: 'r' } });
    expect(scrubEvent(input)).toEqual(input);
  });

  it('reduces a Prisma-style exception to its last line, without emails, URL queries or tokens', () => {
    const value = [
      'Invalid `prisma.document.create()` invocation:',
      '  → 12 notes: "call alice@example.com", url: "https://r2.test/k?X-Amz-Signature=s"',
      `Upload to https://r2.test/k/${TOKEN}?token=abc by bob@example.org failed`,
    ].join('\n');
    const scrubbed = scrubEvent(event({ exception: { values: [{ type: 'Error', value }] } }));
    expect(scrubbed.exception?.values?.[0]?.value).toBe(
      'Upload to https://r2.test/k/:redacted by b***@example.org failed',
    );
  });

  it('caps long exception values and messages at 300 characters', () => {
    const scrubbed = scrubEvent(
      event({ message: 'm'.repeat(500), exception: { values: [{ value: 'v'.repeat(500) }] } }),
    );
    expect(scrubbed.message).toHaveLength(300);
    expect(scrubbed.exception?.values?.[0]?.value).toHaveLength(300);
  });

  it('redacts token path segments in the request url', () => {
    const scrubbed = scrubEvent(event({ request: { url: `https://api.test/reset/${TOKEN}?a=1` } }));
    expect(scrubbed.request?.url).toBe('https://api.test/reset/:redacted');
  });

  it('drops query and fragment attributes wherever they appear, and the server name', () => {
    const scrubbed = scrubEvent(
      event({
        server_name: 'api-7f9c',
        contexts: {
          span: {
            'url.query': '?token=t',
            'url.fragment': '#f',
            'http.query': 'a=1',
            'http.fragment': 'f',
          },
        },
        extra: { query_string: 'token=t' },
      }),
    );
    expect(scrubbed.server_name).toBeUndefined();
    expect(scrubbed.contexts).toEqual({
      span: {
        'url.query': REDACTED,
        'url.fragment': REDACTED,
        'http.query': REDACTED,
        'http.fragment': REDACTED,
      },
    });
    expect(scrubbed.extra).toEqual({ query_string: REDACTED });
  });
});

describe('scrubBreadcrumb (Sentry beforeBreadcrumb)', () => {
  it('drops console and any other non-http breadcrumbs', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'user said hi' })).toBeNull();
    expect(scrubBreadcrumb({ category: 'query', message: 'SELECT ...' })).toBeNull();
  });

  it.each(['http', 'fetch'])(
    'keeps only method, status and a redacted url on %s breadcrumbs',
    (category) => {
      expect(
        scrubBreadcrumb({
          category,
          type: 'http',
          level: 'info',
          timestamp: 1,
          message: 'POST https://x.test/?code=c',
          data: {
            url: `https://oauth2.test/t/${TOKEN}`,
            'http.request.method': 'POST',
            method: 'POST',
            status_code: 200,
            'url.query': 'code=c',
            'url.fragment': 'f',
          },
        }),
      ).toEqual({
        category,
        type: 'http',
        level: 'info',
        timestamp: 1,
        data: {
          url: 'https://oauth2.test/t/:redacted',
          'http.request.method': 'POST',
          method: 'POST',
          status_code: 200,
        },
      });
    },
  );
});
