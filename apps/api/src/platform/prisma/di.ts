// Composition entry of platform/prisma (rule 4 exception, 04 §4.1): what the app root and the auth options need to
// wire Prisma — the module, the DI token and the client type. No client factory, no generated client.
export type { AppPrisma } from './prisma.client.js';
export { PRISMA } from './prisma.constants.js';
export { PrismaModule } from './prisma.module.js';
