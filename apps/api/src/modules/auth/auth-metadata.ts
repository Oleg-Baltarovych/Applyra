/**
 * Metadata keys written by @thallesp/nestjs-better-auth's AllowAnonymous (our @Public) / OptionalAuth / Roles
 * (2.8.0 `dist/index.mjs`; the package exports no constants). Read via `Reflector.getAllAndOverride([handler, class])`.
 * auth-metadata.spec.ts fails if an upgrade renames them.
 */
export const AUTH_METADATA = { public: 'PUBLIC', optional: 'OPTIONAL', roles: 'ROLES' } as const;
