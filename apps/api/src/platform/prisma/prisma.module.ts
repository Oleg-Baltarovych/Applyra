import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '../config/index.js';
import { type AppPrisma, createPrismaClient } from './prisma.client.js';
import { PRISMA } from './prisma.constants.js';
import { TransactionRunner } from './transaction.js';
import { scopeModeFor } from './user-scope.extension.js';

/**
 * Global: repositories inject PRISMA, services inject TransactionRunner. No eager connect — the adapter connects on
 * the first query, so the app (and in-process tests) boot without a database; readiness is M0-09's probe.
 */
@Global()
@Module({
  providers: [
    {
      provide: PRISMA,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AppPrisma =>
        createPrismaClient({
          url: config.get('DATABASE_URL'),
          scopeMode: scopeModeFor(config.get('NODE_ENV')),
          logger: new Logger('PrismaUserScope'),
        }),
    },
    TransactionRunner,
  ],
  exports: [PRISMA, TransactionRunner],
})
export class PrismaModule implements OnApplicationShutdown {
  constructor(@Inject(PRISMA) private readonly prisma: AppPrisma) {}

  async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
