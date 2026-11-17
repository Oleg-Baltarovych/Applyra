// Signed-in test users A/B for HTTP tests (11-testing.md §5, IDOR suite). Signature fixed now so M0-07b can
// build against it; the real sign-in through the auth path (mocked Google token endpoint) lands in M0-10.
import type { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent.js';

export interface TestSession {
  readonly userId: string;
  /** Supertest agent that sends the session cookie on every request. */
  readonly agent: TestAgent;
  /** Raw `Cookie` header value, for requests built by hand. */
  readonly cookie: string;
}

export function signInAs(app: INestApplication, who: 'A' | 'B'): Promise<TestSession> {
  void app;
  return Promise.reject(new Error(`signInAs(${who}): implemented in M0-10`));
}
