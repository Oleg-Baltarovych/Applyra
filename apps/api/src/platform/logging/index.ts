// Public API of platform/logging (pino via nestjs-pino; redaction list = 09-security-privacy.md §10).
export { LoggingModule, type LoggingOverride } from './logging.module.js';
export { REDACTED } from './redact.js';
