// Public API of the auth module.
export { type AuthConfig, COOKIE_PREFIX, SESSION_COOKIE, SIGNUP_CLOSED } from './auth.config.js';
export { AUTH_METADATA } from './auth-metadata.js';
export { AuthModule, type AuthModuleAsyncOptions } from './auth.module.js';
export { authOptionsFromConfig } from './auth.options.js';
// Spec name for the package's @AllowAnonymous() (09-security-privacy.md, 04-architecture.md §7).
export { AllowAnonymous as Public, Session, type UserSession } from '@thallesp/nestjs-better-auth';
