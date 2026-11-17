// Signed-in test users A/B for HTTP tests (11-testing.md §5, IDOR suite) through the real OAuth path: sign-in/social →
// mocked Google token endpoint → /api/auth/callback/google. No direct session writes.
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { SESSION_COOKIE } from '../../src/modules/auth/index.js';
import { ConfigService } from '../../src/platform/config/index.js';
import { cookiesOf, googleSignIn } from './google-oauth-mock.js';

export interface TestSession {
  readonly userId: string;
  /** Supertest agent that sends the session cookie on every request. */
  readonly agent: TestAgent;
  /** Raw `Cookie` header value, for requests built by hand. */
  readonly cookie: string;
}

/**
 * Requires the default test env (Google creds + A/B on the allowlist, test-env.ts). The cookie is passed by hand:
 * the session cookie is `Secure`, which superagent's jar does not replay over http.
 */
export async function signInAs(app: INestApplication, who: 'A' | 'B'): Promise<TestSession> {
  const webOrigin = app.get(ConfigService).get('WEB_ORIGIN');
  const { start, callback } = await googleSignIn(app, `code-${who}`, { webOrigin });
  const session = callback && cookiesOf(callback).get(SESSION_COOKIE);
  if (!callback || callback.status !== 302 || !session) {
    throw new Error(
      `signInAs(${who}): sign-in failed (start ${String(start.status)} ${JSON.stringify(start.body)}, callback ${String(callback?.status)} ${String(callback?.get('Location'))})`,
    );
  }
  const cookie = session.pair;
  const me = await request(app.getHttpServer()).get('/api/auth/get-session').set('Cookie', cookie);
  const userId: unknown = me.body?.user?.id;
  if (typeof userId !== 'string') throw new Error(`signInAs(${who}): no session after sign-in`);
  // Origin preset too: every non-auth mutation needs it (HttpPolicyGuard) and Better Auth checks it with a cookie.
  const agent = request.agent(app.getHttpServer()).set('Cookie', cookie).set('Origin', webOrigin);
  return { userId, agent, cookie };
}
