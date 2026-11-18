// @ts-check
// Post-build gate (`pnpm build`): dist/index.html must satisfy the CSP HTML policy (09 §9.1).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { htmlPolicyProblems } from './html-policy.mjs';

const file = path.join(import.meta.dirname, '../dist/index.html');
const problems = htmlPolicyProblems(readFileSync(file, 'utf8'));
if (problems.length > 0) {
  console.error(`dist/index.html violates the CSP HTML policy:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('dist/index.html: CSP HTML policy OK');
