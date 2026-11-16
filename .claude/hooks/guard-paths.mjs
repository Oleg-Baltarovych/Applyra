// PreToolUse hook (Read|Edit|Write|Bash): blocks access to secrets files and edits to committed Prisma migrations.
// Exit 2 = block, stderr is shown to Claude. Exit 0 = no decision.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const tool = input?.tool_name ?? '';

const block = (reason) => {
  process.stderr.write(`Blocked by .claude/hooks/guard-paths.mjs: ${reason}\n`);
  process.exit(2);
};

const SECRETS_HINT = 'Secrets files are off-limits. Use .env.example and ask the user to update their local .env.';

// Bash: block commands that reference a .env file (anything but .env.example), including glob/brace forms
// such as `.env*`, `.env?`, `.env{,.local}`, `.e[n]v`. This is a best-effort guard against accidental reads,
// not a sandbox: the permission deny rules in settings.json and keeping real secrets out of reach are the
// primary controls.
if (tool === 'Bash') {
  const command = String(input?.tool_input?.command ?? '');
  const plain = /(?:^|[\s'"=<>|;&(/\\`])\.env(?:\.(?!example\b)[\w-]+)*(?=$|[\s'"<>|;&)`*?[{,])/;
  // Any dot-file token that starts with `e` or a glob char and contains glob syntax could expand to .env*.
  const tokens = command.match(/(?:^|[\s'"=<>|;&(/\\`])\.[^\s'"<>|;&)`/\\]*/g) ?? [];
  const globbed = tokens.some((t) => {
    const tok = t.replace(/^[^.]*/, '');
    return /^\.[e*?[{]/.test(tok) && /[*?[{]/.test(tok);
  });
  if (plain.test(command) || globbed) {
    block(`command references a .env file. ${SECRETS_HINT}`);
  }
  process.exit(0);
}

// Grep can print file contents; check its explicit target path / glob too.
const ti = input?.tool_input ?? {};
if (tool === 'Grep') {
  for (const target of [ti.path, ti.glob]) {
    if (typeof target === 'string' && /(^|[\\/])\.env(?!\.example$)(\.[^\\/]*|\*)?$/.test(target)) {
      block(`Grep target "${target}" is a secrets file. ${SECRETS_HINT}`);
    }
  }
  process.exit(0);
}

const filePath = ti.file_path ?? ti.notebook_path;
if (!filePath) process.exit(0);

const rel = path.relative(root, filePath).split(path.sep).join('/');
const base = path.basename(filePath);

if (/^\.env(\..+)?$/.test(base) && base !== '.env.example') {
  block(`"${rel}" is a secrets file. ${SECRETS_HINT}`);
}

// A migration is immutable once it is tracked by git (committed or staged).
// A freshly generated, untracked migration (`prisma migrate dev --create-only`) may still be edited
// to append raw SQL — see /prisma-migration.
if (tool !== 'Read' && /(^|\/)prisma\/migrations\/[^/]+\/.+/.test(rel) && existsSync(filePath)) {
  const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '--', rel], { cwd: root, stdio: 'ignore' });
  // status 1 = untracked; anything else (tracked, or git unavailable) → treat as immutable.
  if (tracked.status !== 1) {
    block(`"${rel}" belongs to a committed migration. Create a new migration instead (see /prisma-migration).`);
  }
}

process.exit(0);
