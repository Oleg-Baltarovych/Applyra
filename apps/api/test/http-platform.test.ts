// M0-09 HTTP platform policy (FR-AUTH-03; 06-api.md §3, §5; 09-security-privacy.md §3, §9.2, §10) through the real
// composition: AppModule + configureHttp, env-driven auth (no database needed: nothing here reaches Prisma).
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Writable } from 'node:stream';
import { ApiError } from '@applyra/contracts';
import { Body, Controller, Delete, type INestApplication, Post } from '@nestjs/common';
import { APIError } from 'better-auth/api';
import { createZodDto } from 'nestjs-zod';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Public } from '../src/modules/auth/index.js';
import { AcceptsMultipart, AppException } from '../src/platform/http/index.js';
import { createHttpApp } from './support/http-app.js';
import { testEnv } from './support/test-env.js';

const WEB_ORIGIN = 'http://localhost:5173';
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LIMIT = 1024 * 1024;

class ProbeDto extends createZodDto(
  z.strictObject({ items: z.array(z.strictObject({ title: z.string().min(1) })) }),
) {}
class BlobDto extends createZodDto(z.strictObject({ blob: z.string() })) {}

@Controller('__probe')
class ProbeController {
  @Public()
  @Post('zod')
  zod(@Body() body: ProbeDto): ProbeDto {
    return body;
  }

  @Public()
  @Post('blob')
  blob(@Body() body: BlobDto): { length: number } {
    return { length: body.blob.length };
  }

  @Public()
  @Post('app-exception')
  appException(): never {
    throw new AppException('CONFLICT_STATE', 'Not allowed now', { reason: 'probe' });
  }

  @Public()
  @Post('throw')
  throwRaw(): never {
    throw new Error('db password=hunter2 at 10.0.0.5');
  }

  @Public()
  @Post('better-auth')
  betterAuth(): never {
    throw new APIError('FORBIDDEN', { code: 'SIGNUP_CLOSED', message: 'Sign-up is closed' });
  }

  @Public()
  @Delete('item')
  remove(): { deleted: true } {
    return { deleted: true };
  }

  @Public()
  @AcceptsMultipart()
  @Post('upload')
  upload(): { ok: true } {
    return { ok: true };
  }

  @Post('private')
  privateMutation(): { ok: true } {
    return { ok: true };
  }
}

let logOutput = '';
const logStream = new Writable({
  write(chunk: Buffer, _enc, cb) {
    logOutput += chunk.toString();
    cb();
  },
});
const logLines = () =>
  logOutput
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);

let app: INestApplication;
const http = () => request(app.getHttpServer());
const post = (path: string) => http().post(path).set('Origin', WEB_ORIGIN);

beforeAll(async () => {
  app = await createHttpApp({
    env: testEnv({ WEB_ORIGIN }),
    logging: { level: 'info', stream: logStream },
    controllers: [ProbeController],
  });
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  logOutput = '';
});

/** Every non-/api/auth error: contract body whose requestId equals the X-Request-Id header. */
const expectApiError = (res: request.Response, status: number, code: string) => {
  expect(res.status).toBe(status);
  const body = ApiError.parse(res.body);
  expect(body).toMatchObject({ statusCode: status, code });
  expect(body.requestId).toBe(res.get('X-Request-Id'));
  return body;
};

describe('error shape (06 §3)', () => {
  it('unknown route → 404 NOT_FOUND', async () => {
    expectApiError(await http().get('/nope'), 404, 'NOT_FOUND');
  });

  it('Zod body → 400 VALIDATION_ERROR with dot-joined paths', async () => {
    const res = await post('/__probe/zod').send({ items: [{ title: '' }] });
    const body = expectApiError(res, 400, 'VALIDATION_ERROR');
    expect(body.details).toEqual([{ path: 'items.0.title', message: expect.any(String) }]);
  });

  it('malformed JSON → 400 VALIDATION_ERROR without parser internals', async () => {
    const res = await post('/__probe/zod')
      .set('Content-Type', 'application/json')
      .send('{"items":');
    const body = expectApiError(res, 400, 'VALIDATION_ERROR');
    expect(JSON.stringify(body)).not.toMatch(/position|Unexpected|JSON\.parse/);
  });

  it('no session on a private route → 401 UNAUTHENTICATED', async () => {
    expectApiError(await post('/__probe/private'), 401, 'UNAUTHENTICATED');
  });

  it('AppException → its code, status and details', async () => {
    const body = expectApiError(await post('/__probe/app-exception'), 409, 'CONFLICT_STATE');
    expect(body).toMatchObject({ message: 'Not allowed now', details: { reason: 'probe' } });
  });

  it('Better Auth APIError on our route → mapped by its code', async () => {
    const body = expectApiError(await post('/__probe/better-auth'), 403, 'SIGNUP_CLOSED');
    expect(body.details).toBeNull();
  });

  it('thrown Error → 500 INTERNAL_ERROR with a fixed message; stack + requestId only in the log', async () => {
    const res = await post('/__probe/throw');
    const body = expectApiError(res, 500, 'INTERNAL_ERROR');
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(res.body)).not.toMatch(/hunter2|10\.0\.0\.5|at /);
    const errorLine = logLines().find((l) => l.msg === 'request failed');
    expect(errorLine).toMatchObject({ level: 50, requestId: body.requestId });
    expect(JSON.stringify(errorLine)).toContain('stack');
  });
});

describe('request id', () => {
  it('echoes a valid incoming X-Request-Id', async () => {
    const res = await http().get('/nope').set('X-Request-Id', 'cf-ray-12345678');
    expect(res.get('X-Request-Id')).toBe('cf-ray-12345678');
    expect(res.body.requestId).toBe('cf-ray-12345678');
  });

  it.each([
    ['invalid', 'bad id;x'],
    ['missing', undefined],
  ])('replaces a %s one with a UUID v7', async (_label, id) => {
    const req = http().get('/health/live');
    const res = await (id === undefined ? req : req.set('X-Request-Id', id));
    expect(res.get('X-Request-Id')).toMatch(UUID_V7);
  });

  it('appears in the request log line, which has no query string, headers or body', async () => {
    const res = await post('/__probe/zod?token=S3CRET-QUERY')
      .set('Authorization', 'Bearer S3CRET-HEADER')
      .send({ items: [{ title: 'S3CRET-BODY' }] });
    const id = res.get('X-Request-Id');
    const line = logLines().find((l) => l.requestId === id && l.msg === 'request completed');
    expect(line).toMatchObject({
      req: { method: 'POST', path: '/__probe/zod' },
      res: { statusCode: 201 },
    });
    expect(logOutput).not.toMatch(/S3CRET/);
  });
});

describe('security headers (09 §9.2)', () => {
  const expectHeaders = (res: request.Response) => {
    expect(res.get('Content-Security-Policy')).toBe("default-src 'none';frame-ancestors 'none'");
    expect(res.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
    expect(res.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.get('Cross-Origin-Resource-Policy')).toBe('same-site');
    expect(res.get('Cache-Control')).toBe('no-store');
    expect(res.get('X-Powered-By')).toBeUndefined();
    expect(res.get('X-Request-Id')).toBeDefined();
  };

  it('on a 200', async () => expectHeaders(await http().get('/health/live')));
  it('on a 404', async () => expectHeaders(await http().get('/nope')));
  it('on /api/auth/*', async () => {
    const res = await http().get('/api/auth/get-session');
    expect(res.status).toBe(200);
    expectHeaders(res);
  });
});

describe('CORS (09 §3)', () => {
  const preflight = (origin: string) =>
    http()
      .options('/__probe/zod')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'Content-Type, Idempotency-Key');

  it('allows exactly WEB_ORIGIN', async () => {
    const res = await preflight(WEB_ORIGIN);
    expect(res.status).toBe(204);
    expect(res.get('Access-Control-Allow-Origin')).toBe(WEB_ORIGIN);
    expect(res.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(res.get('Access-Control-Allow-Methods')).toBe('GET,POST,PUT,PATCH,DELETE');
    expect(res.get('Access-Control-Allow-Headers')).toBe('Content-Type,Idempotency-Key');
    expect(res.get('Access-Control-Max-Age')).toBe('600');
  });

  it.each(['https://evil.example.com', `${WEB_ORIGIN}.evil.com`, 'http://localhost:5174'])(
    'gives %s no ACAO header',
    async (origin) => {
      expect((await preflight(origin)).get('Access-Control-Allow-Origin')).toBeUndefined();
    },
  );

  it('covers /api/auth/* with the same policy (the adapter CORS is off)', async () => {
    const res = await http()
      .options('/api/auth/sign-in/social')
      .set('Origin', WEB_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');
    expect(res.get('Access-Control-Allow-Methods')).toBe('GET,POST,PUT,PATCH,DELETE');
    const foreign = await http()
      .options('/api/auth/sign-in/social')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'POST');
    expect(foreign.get('Access-Control-Allow-Origin')).toBeUndefined();
  });
});

describe('CSRF Origin check + JSON-only mutations', () => {
  it('rejects a mutation without Origin → 403 CSRF_ORIGIN', async () => {
    expectApiError(await http().post('/__probe/zod').send({ items: [] }), 403, 'CSRF_ORIGIN');
  });

  it('rejects a foreign Origin → 403 CSRF_ORIGIN', async () => {
    const res = await http()
      .post('/__probe/zod')
      .set('Origin', 'https://evil.example.com')
      .send({ items: [] });
    expectApiError(res, 403, 'CSRF_ORIGIN');
  });

  it('rejects a bad Origin before auth (unauthenticated + bad Origin → 403, not 401)', async () => {
    expectApiError(await http().post('/__probe/private'), 403, 'CSRF_ORIGIN');
  });

  it('checks DELETE too, and passes a DELETE without a body', async () => {
    expectApiError(await http().delete('/__probe/item'), 403, 'CSRF_ORIGIN');
    const ok = await http().delete('/__probe/item').set('Origin', WEB_ORIGIN);
    expect(ok.status).toBe(200);
  });

  it('accepts JSON from WEB_ORIGIN', async () => {
    const res = await post('/__probe/zod').send({ items: [{ title: 'ok' }] });
    expect(res.status).toBe(201);
  });

  it('text/plain body → 415 UNSUPPORTED_MEDIA_TYPE', async () => {
    const res = await post('/__probe/zod').set('Content-Type', 'text/plain').send('{"items":[]}');
    expectApiError(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('urlencoded body is not parsed and → 415', async () => {
    const res = await post('/__probe/zod').type('form').send('items=1');
    expectApiError(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('multipart passes only on an @AcceptsMultipart() handler', async () => {
    const ok = await post('/__probe/upload').attach('file', Buffer.from('a,b\n1,2'), 'x.csv');
    expect(ok.status).toBe(201);
    const rejected = await post('/__probe/zod').attach('file', Buffer.from('a'), 'x.csv');
    expectApiError(rejected, 415, 'UNSUPPORTED_MEDIA_TYPE');
  });
});

describe('JSON body limit (06 §5)', () => {
  // {"blob":"<n chars>"} has 11 bytes of framing.
  const bodyOf = (bytes: number) => JSON.stringify({ blob: 'x'.repeat(bytes - 11) });

  it('accepts a body of exactly 1 MB', async () => {
    const body = bodyOf(LIMIT);
    expect(Buffer.byteLength(body)).toBe(LIMIT);
    const res = await post('/__probe/blob').set('Content-Type', 'application/json').send(body);
    expect(res.status).toBe(201);
  });

  it('rejects 1 MB + 1 byte → 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await post('/__probe/blob')
      .set('Content-Type', 'application/json')
      .send(bodyOf(LIMIT + 1));
    expectApiError(res, 413, 'PAYLOAD_TOO_LARGE');
  });

  it('rejects an oversize body on /api/auth/* too (Better Auth reads bodies unbounded)', async () => {
    const res = await post('/api/auth/sign-in/social')
      .set('Content-Type', 'application/json')
      .send(bodyOf(LIMIT + 1));
    expectApiError(res, 413, 'PAYLOAD_TOO_LARGE');
  });

  it('answers a large declared body on /api/auth/* with a readable 413 (body drained, no ECONNRESET)', async () => {
    // Regression: answering before the body was read made the kernel RST the socket while the client was writing.
    for (let i = 0; i < 3; i += 1) {
      const res = await post('/api/auth/sign-in/social')
        .set('Content-Type', 'application/json')
        .send(bodyOf(8 * LIMIT));
      expectApiError(res, 413, 'PAYLOAD_TOO_LARGE');
    }
  });

  /** A chunked POST (no Content-Length) written in 64 KB pieces over a real socket. */
  const chunkedAuthPost = async (bytes: number) => {
    const server = app.getHttpServer() as import('node:http').Server;
    if (!server.listening) await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo; // listening on TCP → AddressInfo, not a pipe name
    const payload = bodyOf(bytes);
    return new Promise<{ status: number; body: unknown; requestId: string | undefined }>(
      (resolve, reject) => {
        const req = httpRequest(
          {
            port,
            host: '127.0.0.1',
            method: 'POST',
            path: '/api/auth/sign-in/social',
            headers: { 'Content-Type': 'application/json', Origin: WEB_ORIGIN },
          },
          (res) => {
            let text = '';
            res.on('data', (c: Buffer) => (text += c.toString()));
            res.on('end', () =>
              resolve({
                status: res.statusCode ?? 0,
                body: text ? JSON.parse(text) : null,
                requestId: res.headers['x-request-id'] as string | undefined,
              }),
            );
          },
        );
        req.on('error', reject);
        for (let i = 0; i < payload.length; i += 65_536) req.write(payload.slice(i, i + 65_536));
        req.end();
      },
    );
  };

  it('rejects a chunked body past 1 MB on /api/auth/* → 413 (bytes counted on the stream)', async () => {
    const res = await chunkedAuthPost(LIMIT + 1);
    expect(res.status).toBe(413);
    expect(ApiError.parse(res.body)).toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      requestId: res.requestId,
    });
  });

  it('hands a chunked body within the limit on to Better Auth', async () => {
    const res = await chunkedAuthPost(1000);
    expect(res.status).not.toBe(413);
    // Better Auth parsed the JSON: it rejects the (dummy) blob body by its own validation, in its own shape.
    expect(res.body).toHaveProperty('code');
    expect(res.body).not.toHaveProperty('requestId');
  });
});

describe('/api/auth/* keeps Better Auth error bodies (06 §3, decision A)', () => {
  it('returns { code, message } with our X-Request-Id', async () => {
    const res = await post('/api/auth/sign-in/social').send({ provider: 'not-configured' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body).toHaveProperty('code');
    expect(res.body).not.toHaveProperty('requestId');
    expect(res.get('X-Request-Id')).toMatch(UUID_V7);
  });
});
