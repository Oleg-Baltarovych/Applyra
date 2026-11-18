// CSP 09 §9.1 (`script-src 'self'`, no 'unsafe-inline'): index.html — source and built — carries no inline script,
// no inline event handler and no javascript: URL. scripts/check-dist-html.mjs runs the same check on dist/ in `build`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { htmlPolicyProblems } from '../scripts/html-policy.mjs';

describe('htmlPolicyProblems', () => {
  it('accepts external scripts only', () => {
    expect(
      htmlPolicyProblems(
        '<head><script src="/theme-init.js"></script><script type="module" src="/src/main.tsx"></script></head>',
      ),
    ).toEqual([]);
  });

  it.each([
    ['<script>alert(1)</script>', 'inline <script>'],
    ['<script type="module">import "/x.js"</script>', 'inline <script>'],
    ['<SCRIPT >x()</SCRIPT>', 'inline <script>'],
    ['<script src="/a.js">x()</script>', 'inline <script>'],
    ['<body onload="x()">', 'inline event handler'],
    ['<img src=x onerror=alert(1)>', 'inline event handler'],
    ['<a href="javascript:alert(1)">', 'javascript: URL'],
  ])('rejects %s', (html, problem) => {
    expect(htmlPolicyProblems(html)).toEqual([expect.stringContaining(problem)]);
  });

  it('source index.html passes', () => {
    const html = readFileSync(path.join(import.meta.dirname, '../index.html'), 'utf8');
    expect(htmlPolicyProblems(html)).toEqual([]);
  });
});
