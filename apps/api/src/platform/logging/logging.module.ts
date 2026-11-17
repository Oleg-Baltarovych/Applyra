import type { IncomingMessage, ServerResponse } from 'node:http';
import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule, type Params } from 'nestjs-pino';
import type { DestinationStream, LevelWithSilent } from 'pino';
import type { Options } from 'pino-http';
import { ConfigService, type Env } from '../config/index.js';
import { newId } from '../ids/uuid-v7.js';
import { errSerializer, redactOptions } from './redact.js';

/** Test seam: a capture stream + level (NODE_ENV=test is otherwise silent). */
export interface LoggingOverride {
  level: LevelWithSilent;
  stream: DestinationStream;
}

const LEVELS: Readonly<Record<Env['NODE_ENV'], LevelWithSilent>> = {
  test: 'silent',
  development: 'debug',
  production: 'info',
};

type Req = IncomingMessage & { originalUrl?: string };
const pathOf = (req: Req): string => (req.originalUrl ?? req.url ?? '').split('?')[0] ?? '';

/** pino-http options: request id from the request-id middleware, no bodies / query strings / headers. */
export function pinoHttpOptions(level: LevelWithSilent): Options<Req, ServerResponse> {
  return {
    level,
    redact: redactOptions,
    // req.id is set by the request-id middleware (configureHttp), which runs before every module middleware.
    genReqId: (req) => req.id ?? newId(),
    // On every line of the request (request logger, app logs in its context, the completion line).
    customProps: (req) => ({ requestId: req.id }),
    // Raw req/res reach the serializers: only the fields below are ever logged.
    wrapSerializers: false,
    serializers: {
      req: (req: Req) => ({ method: req.method, path: pathOf(req) }),
      res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
      err: errSerializer,
    },
    autoLogging: { ignore: (req) => pathOf(req).startsWith('/health/') },
  };
}

@Module({})
export class LoggingModule {
  static forRoot(override?: LoggingOverride): DynamicModule {
    return {
      module: LoggingModule,
      imports: [
        LoggerModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService): Params => {
            const options = pinoHttpOptions(override?.level ?? LEVELS[config.get('NODE_ENV')]);
            return { pinoHttp: override ? [options, override.stream] : options };
          },
        }),
      ],
    };
  }
}
