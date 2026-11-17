// App-role Prisma client for integration tests: the same factory as the api (adapter-pg on applyra_app, user-scope
// guard in `throw` mode). Close it in afterAll.
import { type AppPrisma, createPrismaClient } from '../../../src/platform/prisma/index.js';
import { testInfra } from './test-infra.js';

export function testPrisma(): AppPrisma {
  return createPrismaClient({
    url: testInfra().databaseUrl,
    scopeMode: 'throw',
    logger: {
      warn: (message) => {
        throw new Error(`unexpected user-scope warning in throw mode: ${message}`);
      },
    },
  });
}
