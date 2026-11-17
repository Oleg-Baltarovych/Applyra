import { describe, expect, it } from 'vitest';
import { scopeModeFor, UnscopedQueryError } from './user-scope.extension.js';

describe('scopeModeFor', () => {
  it('throws in test, warns in development and is off in production', () => {
    expect(scopeModeFor('test')).toBe('throw');
    expect(scopeModeFor('development')).toBe('warn');
    expect(scopeModeFor('production')).toBe('off');
  });
});

describe('UnscopedQueryError', () => {
  it('names model and operation only', () => {
    const error = new UnscopedQueryError('UserSettings', 'findMany');
    expect(error).toMatchObject({
      name: 'UnscopedQueryError',
      model: 'UserSettings',
      operation: 'findMany',
    });
    expect(error.message).toBe(
      'Unscoped query: UserSettings.findMany without its owner key in `where`',
    );
  });
});
