// Guards an upgrade of @thallesp/nestjs-better-auth: its decorators must keep writing the keys our guards and the
// IDOR gate read (the package exports no constants for them).
import { AllowAnonymous, OptionalAuth, Roles } from '@thallesp/nestjs-better-auth';
import { describe, expect, it } from 'vitest';
import { AUTH_METADATA } from './auth-metadata.js';

class Probe {
  @AllowAnonymous()
  open(): void {}

  @OptionalAuth()
  maybe(): void {}

  @Roles(['ADMIN'])
  admin(): void {}
}

const meta = (key: string, handler: () => void): unknown => Reflect.getMetadata(key, handler);

describe('AUTH_METADATA', () => {
  it('@Public() (AllowAnonymous) writes AUTH_METADATA.public = true', () => {
    expect(meta(AUTH_METADATA.public, Probe.prototype.open)).toBe(true);
  });

  it('@OptionalAuth() writes AUTH_METADATA.optional = true', () => {
    expect(meta(AUTH_METADATA.optional, Probe.prototype.maybe)).toBe(true);
  });

  it('@Roles([...]) writes the role list under AUTH_METADATA.roles', () => {
    expect(meta(AUTH_METADATA.roles, Probe.prototype.admin)).toEqual(['ADMIN']);
  });
});
