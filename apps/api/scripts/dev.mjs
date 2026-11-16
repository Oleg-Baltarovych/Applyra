// Local dev loop without extra deps: tsc --watch rebuilds dist/, node --watch restarts the api on change.
// Loads the root env file (cp .env.example .env) — local only; `start` (production) reads the process env.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const apiDir = path.resolve(import.meta.dirname, '..');
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
const tsconfig = path.join(apiDir, 'tsconfig.build.json');
const run = (args) => spawn(process.execPath, args, { cwd: apiDir, stdio: 'inherit' });

// Initial build first, so node --watch never starts on a stale or missing dist/.
const initial = spawnSync(process.execPath, [tsc, '-p', tsconfig], {
  cwd: apiDir,
  stdio: 'inherit',
});
if (initial.status !== 0) process.exit(initial.status ?? 1);

const children = [
  run([tsc, '-p', tsconfig, '--watch', '--preserveWatchOutput']),
  run(['--watch', '--env-file-if-exists=../../.env', 'dist/main.js']),
];
const stop = () => {
  for (const child of children) child.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
// If either watcher dies, take the other one down too instead of leaving a half-running loop.
for (const child of children) child.on('exit', stop);
