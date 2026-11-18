// Errors of the typed API client (10 §6.3). UI branches on `code` (contracts ErrorCode), never on `message` text.
import type { ApiError, ErrorCode } from '@applyra/contracts';

/** Non-2xx response, parsed by contracts `ApiError`; an unparseable body becomes INTERNAL_ERROR. */
export class ApiRequestError extends Error {
  override readonly name = 'ApiRequestError';
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: ApiError['details'];
  readonly requestId: string;

  constructor(status: number, body: Pick<ApiError, 'code' | 'message' | 'details' | 'requestId'>) {
    super(body.message);
    this.status = status;
    this.code = body.code;
    this.details = body.details;
    this.requestId = body.requestId;
  }
}

/** The request never got an HTTP response (offline, DNS, CORS rejection, abort). */
export class NetworkError extends Error {
  override readonly name = 'NetworkError';
}

/** A 2xx body that does not match the contracts schema: never handed to the UI. */
export class ResponseShapeError extends Error {
  override readonly name = 'ResponseShapeError';
}

export const isApiRequestError = (e: unknown): e is ApiRequestError => e instanceof ApiRequestError;
