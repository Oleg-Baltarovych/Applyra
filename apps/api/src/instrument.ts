// Sentry bootstrap (M0-15, 12-infra-ops.md §9). Preloaded before the app: `node --import ./dist/instrument.js
// dist/main.js` (package.json start/dev, Dockerfile CMD). In ESM, Sentry must be initialised before @nestjs/* and
// express are loaded, so this file imports nothing that pulls them in. Without SENTRY_DSN it does nothing: no
// client, no network (the local default).
import * as Sentry from '@sentry/nestjs';
import { readSentryEnv } from './platform/config/sentry-env.js';
import { sentryOptions } from './platform/sentry/sentry-options.js';

const sentry = readSentryEnv();
if (sentry) Sentry.init(sentryOptions(sentry));
