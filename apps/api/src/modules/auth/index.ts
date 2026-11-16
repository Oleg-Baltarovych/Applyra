// Public API of the auth module.
export { type AuthConfig, SIGNUP_CLOSED } from './auth.config.js';
export { AuthModule, type AuthModuleAsyncOptions } from './auth.module.js';
// Spec name for the package's @AllowAnonymous() (09-security-privacy.md, 04-architecture.md §7).
export { AllowAnonymous as Public, Session, type UserSession } from '@thallesp/nestjs-better-auth';
