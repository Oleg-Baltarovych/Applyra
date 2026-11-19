import { describe, expect, it } from 'vitest';
import { redactUrl, redactUrlsIn, summarizeText } from './redact-rules.js';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';

describe('redactUrl', () => {
  it('drops the query string and fragment', () => {
    expect(redactUrl('https://x.test/upload?X-Amz-Signature=s#frag')).toBe('https://x.test/upload');
  });

  it('replaces token-looking path segments (24+ url-safe chars), not the host or short segments', () => {
    expect(redactUrl(`https://api.applyra.localhost/api/v1/invites/${TOKEN}/accept?x=1`)).toBe(
      'https://api.applyra.localhost/api/v1/invites/:redacted/accept',
    );
    expect(redactUrl(`/reset/${TOKEN}`)).toBe('/reset/:redacted');
    expect(redactUrl('/api/v1/jobs/0193a7c2-7b4e-7c1a-9f2e-123456789abc')).toBe(
      '/api/v1/jobs/0193a7c2-7b4e-7c1a-9f2e-123456789abc',
    );
  });
});

describe('redactUrlsIn', () => {
  it('redacts every http(s) URL inside free text', () => {
    expect(
      redactUrlsIn(
        `fetch https://r2.test/k?X-Amz-Signature=s failed; see "https://a.test/t/${TOKEN}".`,
      ),
    ).toBe('fetch https://r2.test/k failed; see "https://a.test/t/:redacted".');
  });
});

describe('summarizeText', () => {
  it('keeps a short one-liner as is', () => {
    expect(summarizeText('Unique constraint failed')).toBe('Unique constraint failed');
  });

  it('keeps only the last non-empty line of a multi-line (Prisma-style) message', () => {
    const prisma = [
      '',
      'Invalid `prisma.application.create()` invocation in',
      '/app/apps/api/dist/modules/applications/applications.repository.js:12:5',
      '  → 12 notes: "my private notes"',
      'Unique constraint failed on the fields: (`userId`,`jobId`)',
      '',
    ].join('\n');
    expect(summarizeText(prisma)).toBe(
      'Unique constraint failed on the fields: (`userId`,`jobId`)',
    );
  });

  it('caps the result at 300 characters', () => {
    const result = summarizeText('x'.repeat(1000));
    expect(result).toHaveLength(300);
    expect(result.endsWith('…')).toBe(true);
  });
});
