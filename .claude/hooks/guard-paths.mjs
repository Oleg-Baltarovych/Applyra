// PreToolUse hook (Edit|Write): blocks edits to secrets and to applied Prisma migrations.
// Exit 2 = block, stderr is shown to Claude. Exit 0 = no decision.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const filePath = input?.tool_input?.file_path;
if (!filePath) process.exit(0);

const rel = path
  .relative(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd(), filePath)
  .split(path.sep)
  .join('/');
const base = path.basename(filePath);

const block = (reason) => {
  process.stderr.write(`Blocked by .claude/hooks/guard-paths.mjs: ${reason}\n`);
  process.exit(2);
};

if (/^\.env(\..+)?$/.test(base) && base !== '.env.example') {
  block(`"${rel}" is a secrets file. Edit .env.example instead and ask the user to update their local .env.`);
}

if (/(^|\/)prisma\/migrations\/[^/]+\/.+/.test(rel) && existsSync(filePath)) {
  block(`"${rel}" is an existing (applied) migration. Create a new migration instead (see /prisma-migration).`);
}

process.exit(0);
