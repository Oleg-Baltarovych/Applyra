// @ts-check
// HTML policy for CSP `script-src 'self'` (09 §9.1): used by test/index-html.test.ts and check-dist-html.mjs.

/**
 * Problems in an HTML document: inline <script> bodies, on*= attributes, javascript: URLs. Empty array = OK.
 * Regex-based on purpose: the input is our own index.html / Vite output, not arbitrary HTML.
 * @param {string} html
 * @returns {string[]}
 */
export function htmlPolicyProblems(html) {
  /** @type {string[]} */
  const problems = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const [, attrs = '', body = ''] = match;
    if (body.trim() !== '' || !/\bsrc\s*=/i.test(attrs)) {
      problems.push(`inline <script> at offset ${match.index}`);
    }
  }
  for (const match of html.matchAll(/<[a-z][^>]*\son[a-z]+\s*=/gi)) {
    problems.push(`inline event handler at offset ${match.index}`);
  }
  for (const match of html.matchAll(/javascript:/gi)) {
    problems.push(`javascript: URL at offset ${match.index}`);
  }
  return problems;
}
