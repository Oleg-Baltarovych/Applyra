import { describe, expect, it } from 'vitest';
import { IDOR_EXEMPT_KEY, IdorExempt } from './idor-exempt.decorator.js';

describe('@IdorExempt', () => {
  it('stores the trimmed reason on the handler', () => {
    class Probe {
      @IdorExempt('  own data only  ')
      me(): void {}
    }
    expect(Reflect.getMetadata(IDOR_EXEMPT_KEY, Probe.prototype.me)).toBe('own data only');
  });

  it.each(['', '   '])('rejects an empty reason %j at decoration time', (reason) => {
    expect(() => IdorExempt(reason)).toThrow(/reason/);
  });
});
