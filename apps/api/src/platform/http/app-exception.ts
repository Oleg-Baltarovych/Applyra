import { type ErrorCode, errorStatus } from '@applyra/contracts';

/** Codes a service may throw; VALIDATION_ERROR comes only from Zod (array details). */
export type AppErrorCode = Exclude<ErrorCode, 'VALIDATION_ERROR'>;

/**
 * The one exception services throw (never a bare HttpException): a catalogue code (06-api.md §3.1), a client-safe
 * message and optional details. The status comes from `errorStatus`; the global filter renders the 06 §3 body.
 */
export class AppException extends Error {
  override readonly name = 'AppException';
  readonly status: number;

  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.status = errorStatus[code];
  }
}
