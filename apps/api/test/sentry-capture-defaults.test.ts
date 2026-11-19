// M0-15: with the SDK's DEFAULT integrations (http request data, breadcrumbs, …) an unexpected 500 still reaches
// Sentry exactly once and without cookies, query string or body. Own file: Sentry.init is process-global.
// Real client + in-memory transport: no network.
import { Body, Controller, type INestApplication, Post } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { createZodDto } from 'nestjs-zod';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Public } from '../src/modules/auth/index.js';
import { sentryOptions } from '../src/platform/sentry/sentry-options.js';
import { createHttpApp } from './support/http-app.js';
import { testEnv } from './support/test-env.js';

class NotesDto extends createZodDto(z.strictObject({ notes: z.string() })) {}

@Controller('__sentry-defaults')
class CrashController {
  @Public()
  @Post('crash')
  crash(@Body() body: NotesDto): never {
    // The body is parsed (so a body-capturing integration would see it), then the handler fails.
    throw new Error(body.notes === '' ? 'empty' : 'boom');
  }
}

let app: INestApplication;
const envelopes: string[] = [];
const events: Sentry.Event[] = [];

beforeAll(async () => {
  Sentry.init({
    ...sentryOptions({ dsn: 'https://public@sentry.invalid/1', environment: 'test' }),
    transport: () => ({
      send: (envelope) => {
        envelopes.push(JSON.stringify(envelope));
        for (const [header, payload] of envelope[1]) {
          if (header.type === 'event') events.push(payload as Sentry.Event);
        }
        return Promise.resolve({});
      },
      flush: () => Promise.resolve(true),
    }),
  });
  app = await createHttpApp({ env: testEnv(), controllers: [CrashController] });
});

afterAll(async () => {
  await app.close();
  await Sentry.close();
});

describe('Sentry with default integrations', () => {
  it('sends one event per 500 with no cookie, query string or body', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/__sentry-defaults/crash?token=QUERY-SECRET')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', 'session=COOKIE-SECRET')
      .set('Authorization', 'Bearer AUTH-SECRET')
      .send({ notes: 'BODY-SECRET' });
    await Sentry.flush(2000);

    expect(res.status).toBe(500);
    expect(events).toHaveLength(1);
    const sent = envelopes.join('\n');
    for (const secret of ['QUERY-SECRET', 'COOKIE-SECRET', 'AUTH-SECRET', 'BODY-SECRET']) {
      expect(sent).not.toContain(secret);
    }
    expect(events[0]?.exception?.values?.[0]?.value).toBe('boom');
    // The http integration did attach the request (so the absence above is the scrub, not missing data).
    expect(events[0]?.request?.url).toMatch(/\/api\/v1\/__sentry-defaults\/crash$/);
  });
});
