// The production HTTP composition for Supertest: AppModule + configureHttp, exactly as main.ts wires them.
import type { INestApplication, ModuleMetadata } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule, type AppModuleOptions } from '../../src/app.module.js';
import { ConfigService } from '../../src/platform/config/index.js';
import { configureHttp } from '../../src/platform/http/index.js';

export interface HttpAppOptions extends AppModuleOptions {
  /** Extra test-only modules (probe controllers, config providers). */
  imports?: ModuleMetadata['imports'];
  controllers?: ModuleMetadata['controllers'];
}

export async function createHttpApp({
  imports = [],
  controllers = [],
  ...appOptions
}: HttpAppOptions): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(appOptions), ...imports],
    controllers,
  }).compile();
  const app = moduleRef.createNestApplication({ bodyParser: false, bufferLogs: true });
  configureHttp(app, app.get(ConfigService));
  await app.init();
  return app;
}
