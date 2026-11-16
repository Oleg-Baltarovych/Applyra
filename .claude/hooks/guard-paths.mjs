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

// Representative secret file names a glob is tested against.
const SECRET_NAMES = ['.env', '.env.local', '.env.test', '.env.development', '.env.production', '.env.staging', '.env.development.local'];

const MAX_ALTERNATIVES = 256; // brace-expansion budget; exceeding it fails closed
const MAX_GLOB_TOKEN = 512;

class Unanalysable extends Error {}

// Bash-style brace expansion: `.env{,.local}` → ['.env', '.env.local'] (nested braces supported).
// Throws Unanalysable once more than MAX_ALTERNATIVES results would be produced.
function expandBraces(s, budget = { left: MAX_ALTERNATIVES }) {
  const open = s.indexOf('{');
  if (open < 0) {
    if (--budget.left < 0) throw new Unanalysable('too many brace alternatives');
    return [s];
  }
  let depth = 0;
  const parts = [];
  let start = open + 1;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth === 0) {
      parts.push(s.slice(start, i));
      const pre = s.slice(0, open);
      const post = s.slice(i + 1);
      const out = [];
      for (const p of parts) out.push(...expandBraces(pre + p + post, budget));
      return out;
    } else if (s[i] === ',' && depth === 1) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  if (--budget.left < 0) throw new Unanalysable('too many brace alternatives');
  return [s]; // unbalanced → literal
}

// Bash glob → RegExp: `*` → any chars, `?` → one char, `[...]`/`[!...]` → class. Syntax this converter does not
// model (POSIX classes `[:alpha:]`, `[=x=]`, `[.x.]`, extglob `@(…)` etc.) throws Unanalysable → fail closed.
function globToRegExp(g) {
  if (/\[[:=.]|[@!+?*]\(/.test(g)) throw new Unanalysable('unsupported glob syntax');
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') re += '.*';
    else if (c === '?') re += '.';
    else if (c === '[') {
      const end = g.indexOf(']', i + 2);
      if (end < 0) { re += '\\['; continue; }
      let cls = g.slice(i + 1, end);
      if (cls.startsWith('!') || cls.startsWith('^')) cls = '^' + cls.slice(1);
      re += '[' + cls.replace(/\\/g, '\\\\') + ']';
      i = end;
    } else re += c.replace(/[.+^$()|\\\]{}]/g, '\\$&');
  }
  try {
    return new RegExp('^' + re + '$');
  } catch {
    throw new Unanalysable('glob does not compile');
  }
}

// A glob is a secrets reference if it matches a known secrets name, or if it can match *some* name that starts with
// `.env` (other than `.env.example`): probe with names built from the glob's own literal text, so `.env.?ey` is caught
// via `.env.xey` even though that name is not in SECRET_NAMES.
function globHitsSecrets(g) {
  const re = globToRegExp(g);
  if (SECRET_NAMES.some((n) => re.test(n))) return true;
  const probe = g.replace(/\[[^\]]*\]/g, 'x').replace(/\*/g, '').replace(/\?/g, 'x');
  return probe !== '.env.example' && /^\.env(\.|$)/.test(probe) && re.test(probe);
}

// Bash: block commands that reference a .env file (anything but .env.example), including glob/brace forms
// such as `.env*`, `.env?`, `.env{,.local}`, `.e[n]v`. This is a best-effort guard against accidental reads,
// not a sandbox: the permission deny rules in settings.json and keeping real secrets out of reach are the
// primary controls. Anything the hook cannot analyse fails closed (blocks).
if (tool === 'Bash') {
  const command = String(input?.tool_input?.command ?? '');
  let hit = false;
  try {
    const plain = /(?:^|[\s'"=<>|;&(/\\`])\.env(?:\.(?!example\b)[\w-]+)*(?=$|[\s'"<>|;&)`*?[{,])/;
    // Dot-file tokens with glob/brace syntax: block only if the pattern can actually expand to a .env file name
    // (so jq filters like `.[]` or regexes like `.*foo` pass).
    const tokens = command.match(/(?:^|[\s'"=<>|;&(/\\`])\.[^\s'"<>|;&)`/\\]*/g) ?? [];
    hit = plain.test(command) || tokens.some((t) => {
      const tok = t.replace(/^[^.]*/, '');
      if (!/[*?[{]|[@!+]\(/.test(tok)) return false;
      if (tok.length > MAX_GLOB_TOKEN) throw new Unanalysable('glob token too long');
      return expandBraces(tok).some(globHitsSecrets);
    });
  } catch (err) {
    block(`could not analyse the command for .env references (${err instanceof Unanalysable ? err.message : 'internal error'}); rephrase it. ${SECRETS_HINT}`);
  }
  if (hit) block(`command references a .env file. ${SECRETS_HINT}`);
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
