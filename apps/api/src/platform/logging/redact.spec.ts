import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { REDACTED, REDACTED_KEYS, censor, errSerializer, redactOptions } from './redact.js';

const SENTINEL = 'S3NT1NEL';

function capture(): {
  lines: () => Record<string, unknown>[];
  raw: () => string;
  stream: Writable;
} {
  let out = '';
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      out += chunk.toString();
      cb();
    },
  });
  return {
    stream,
    raw: () => out,
    lines: () =>
      out
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

const logWith = (record: Record<string, unknown>) => {
  const sink = capture();
  pino({ redact: redactOptions }, sink.stream).info(record, 'test');
  return sink;
};

describe('log redaction (09-security-privacy.md §10)', () => {
  // `email`, `ip`, `remoteAddress` and `url` are transformed, not removed; covered separately below.
  const plainKeys = REDACTED_KEYS.filter(
    (k) => !['email', 'ip', 'remoteAddress', 'url'].includes(k),
  );

  it('covers every 09 §10 secret, content and PII key', () => {
    expect(REDACTED_KEYS).toEqual(
      expect.arrayContaining([
        'password',
        'newPassword',
        'currentPassword',
        'token',
        'accessToken',
        'refreshToken',
        'idToken',
        'secret',
        'totp',
        'parsedText',
        'notes',
        'note',
        'description',
        'coverLetter',
        'email',
        'phone',
        'contact',
        'telegramChatId',
        'ip',
      ]),
    );
  });

  it.each(['top level', 'nested once', 'nested twice'])(
    'leaves no sentinel value at %s',
    (depth) => {
      const fields = Object.fromEntries(plainKeys.map((k) => [k, `${SENTINEL}-${k}`]));
      const record =
        depth === 'top level'
          ? fields
          : depth === 'nested once'
            ? { ctx: fields }
            : { outer: { ctx: fields } };
      const sink = logWith(record);
      expect(sink.raw()).not.toContain(SENTINEL);
      expect(sink.raw()).toContain(REDACTED);
    },
  );

  it('redacts OAuth codes and user messages only under body/query/oauth', () => {
    const sink = logWith({
      body: { code: `${SENTINEL}-c`, message: `${SENTINEL}-m` },
      query: { code: `${SENTINEL}-q` },
      oauth: { code: `${SENTINEL}-o` },
      req: { query: { code: `${SENTINEL}-rq` }, body: { message: `${SENTINEL}-rm` } },
    });
    expect(sink.raw()).not.toContain(SENTINEL);
  });

  it('keeps error fields readable: err.message, err.type and errorCode', () => {
    const sink = capture();
    pino({ redact: redactOptions, serializers: { err: errSerializer } }, sink.stream).error(
      { err: new TypeError('cannot read x of undefined'), errorCode: 'NOT_FOUND' },
      'failed',
    );
    expect(sink.lines()[0]).toMatchObject({
      errorCode: 'NOT_FOUND',
      err: { type: 'TypeError', message: 'cannot read x of undefined' },
    });
  });

  it('masks email-like substrings inside a serialized error (message, stack, meta)', () => {
    // Shape of a Prisma driver-adapter error: the pg detail sits in enumerable `meta` (copied by the serializer).
    const err = Object.assign(
      new Error('insert failed for ann.lee@mail.example.org', {
        cause: new Error('duplicate key'),
      }),
      {
        meta: {
          driverAdapterError: {
            cause: { originalMessage: 'Key (email)=(oleg@example.com) already exists.' },
          },
        },
      },
    );
    const out = JSON.stringify(errSerializer(err));
    expect(out).not.toMatch(/oleg@|ann.lee@/);
    expect(out).toContain('o***@example.com');
    expect(out).toContain('a***@mail.example.org');
  });

  it('strips URL queries and token path segments inside a serialized error', () => {
    const err = new Error(
      'PUT https://r2.test/b/k?X-Amz-Signature=sig failed for https://x.test/reset/AbCdEfGhIjKlMnOpQrStUvWx',
    );
    const out = JSON.stringify(errSerializer(err));
    expect(out).not.toMatch(/X-Amz-Signature|AbCdEfGhIjKlMnOpQrStUvWx/);
    expect(out).toContain('https://r2.test/b/k failed for https://x.test/reset/:redacted');
  });

  it('redacts a whole contact object and body.text', () => {
    const sink = logWith({
      contact: { name: `${SENTINEL}-n`, linkedin: `${SENTINEL}-l` },
      body: { text: `${SENTINEL}-t`, kind: 'ok' },
    });
    expect(sink.raw()).not.toContain(SENTINEL);
    expect(sink.lines()[0]).toMatchObject({
      contact: REDACTED,
      body: { text: REDACTED, kind: 'ok' },
    });
  });

  it('redacts credential headers on req/res', () => {
    const sink = logWith({
      req: {
        headers: {
          authorization: `Bearer ${SENTINEL}`,
          cookie: `s=${SENTINEL}`,
          'x-api-key': SENTINEL,
          accept: 'application/json',
        },
      },
      res: { headers: { 'set-cookie': [`s=${SENTINEL}`] } },
    });
    expect(sink.raw()).not.toContain(SENTINEL);
    expect(sink.lines()[0]).toMatchObject({ req: { headers: { accept: 'application/json' } } });
  });

  it('masks emails as o***@domain at every depth', () => {
    const sink = logWith({
      email: 'oleg@example.com',
      user: { email: 'Ann.Lee@mail.example.org' },
    });
    expect(sink.lines()[0]).toMatchObject({
      email: 'o***@example.com',
      user: { email: 'A***@mail.example.org' },
    });
  });

  it('truncates IPv4 to /24 and IPv6 to /48', () => {
    const sink = logWith({
      ip: '203.0.113.77',
      req: { remoteAddress: '2001:db8:85a3:8d3:1319:8a2e:370:7348' },
      peer: { ip: '::ffff:198.51.100.23' },
    });
    expect(sink.lines()[0]).toMatchObject({
      ip: '203.0.113.0/24',
      req: { remoteAddress: '2001:db8:85a3::/48' },
      peer: { ip: '198.51.100.0/24' },
    });
  });

  it('drops the query string of a logged url (presigned X-Amz-* parameters)', () => {
    const sink = logWith({ url: `https://s3.example.com/k?X-Amz-Signature=${SENTINEL}` });
    expect(sink.lines()[0]).toMatchObject({ url: 'https://s3.example.com/k' });
  });

  it('censors anything it cannot parse instead of passing it through', () => {
    expect(censor({ not: 'an email' }, ['email'])).toBe(REDACTED);
    expect(censor('not-an-ip', ['ip'])).toBe(REDACTED);
    expect(censor('no-at-sign', ['user', 'email'])).toBe(REDACTED);
    expect(censor(42, ['url'])).toBe(REDACTED);
  });
});
