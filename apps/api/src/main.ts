// HTTP entrypoint. Layout: src/modules/<name>/ (index.ts = public API) · src/platform/ (shared backend code).
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadEnv } from './platform/config/index.js';

async function bootstrap(): Promise<void> {
  // Exits listing every invalid variable before anything else starts.
  const env = loadEnv();
  const app = await NestFactory.create(
    AppModule.forRoot({ env }),
    // Better Auth reads the raw body itself; @thallesp/nestjs-better-auth restores parsers elsewhere.
    { bodyParser: false },
  );
  app.enableShutdownHooks();
  await app.listen(env.PORT);
}

void bootstrap();
