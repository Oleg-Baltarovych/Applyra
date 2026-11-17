// HTTP entrypoint. Layout: src/modules/<name>/ (index.ts = public API) · src/platform/ (shared backend code).
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ConfigService, loadEnv } from './platform/config/index.js';
import { configureHttp } from './platform/http/index.js';

async function bootstrap(): Promise<void> {
  // Exits listing every invalid variable before anything else starts.
  const env = loadEnv();
  const app = await NestFactory.create(
    AppModule.forRoot({ env }),
    // Better Auth reads the raw body itself; @thallesp/nestjs-better-auth restores parsers elsewhere.
    // bufferLogs: boot logs wait for the pino logger set in configureHttp.
    { bodyParser: false, bufferLogs: true },
  );
  configureHttp(app, app.get(ConfigService));
  app.enableShutdownHooks();
  await app.listen(env.PORT);
}

void bootstrap();
