#!/usr/bin/env node
/**
 * Fake agent host for tests. Invoked as
 *   node fake-host.mjs <codex|claude> [--flags=all|none|partial] ...argv
 * It answers --version, prints a --help listing the documented flags, and
 * otherwise echoes the argv it received as one JSON line and obeys directives
 * found in any argument or in .cherry/TASK.md:
 *   [[exit:N]] [[sleep:MS]] [[write:rel/path=content]] [[secret]] [[big]] [[stderr:text]]
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [flavour, ...rest] = process.argv.slice(2);
const flagsMode = rest[0]?.startsWith('--flags=') ? rest.shift().slice('--flags='.length) : 'all';

const HELP = {
  codex: {
    all: 'Usage: codex exec [OPTIONS] [PROMPT]\n  --sandbox <MODE>\n  -C, --cd <DIR>\n  --skip-git-repo-check\n  --output-last-message <FILE>\n  --json\n',
    partial: 'Usage: codex exec [OPTIONS] [PROMPT]\n  --sandbox <MODE>\n  --cd <DIR>\n',
    none: 'Usage: codex exec [PROMPT]\n',
  },
  claude: {
    all: 'Usage: claude [options] [prompt]\n  -p, --print\n  --output-format <format>\n  --permission-mode <mode>\n  --add-dir <directories...>\n  --max-turns <turns>\n',
    partial: 'Usage: claude [options] [prompt]\n  -p, --print\n  --output-format <format>\n',
    none: 'Usage: claude [prompt]\n',
  },
};

if (rest.includes('--version')) {
  process.stdout.write(`fake-${flavour} 9.9.9\n`);
  process.exit(0);
}
if (rest.includes('--help')) {
  process.stdout.write(HELP[flavour]?.[flagsMode] ?? '');
  process.exit(0);
}

process.stdout.write(JSON.stringify({ argv: rest, cwd: process.cwd() }) + '\n');

let script = rest.join(' ');
const taskFile = join(process.cwd(), '.cherry', 'TASK.md');
if (script.includes('.cherry/TASK.md') && existsSync(taskFile)) script += ' ' + readFileSync(taskFile, 'utf8');

for (const [, relPath, content] of script.matchAll(/\[\[write:([^=\]]+)=([^\]]*)\]\]/g)) {
  const target = join(process.cwd(), relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
if (script.includes('[[secret]]')) process.stdout.write('token sk-abcdefghijklmnop1234 end\n');
if (script.includes('[[big]]')) process.stdout.write('x'.repeat(300 * 1024) + '\n');
const stderrMatch = /\[\[stderr:([^\]]*)\]\]/.exec(script);
if (stderrMatch) process.stderr.write(stderrMatch[1] + '\n');
const sleepMatch = /\[\[sleep:(\d+)\]\]/.exec(script);
const exitMatch = /\[\[exit:(\d+)\]\]/.exec(script);
const exitCode = exitMatch ? Number(exitMatch[1]) : 0;
if (sleepMatch) {
  setTimeout(() => process.exit(exitCode), Number(sleepMatch[1]));
} else {
  process.exit(exitCode);
}
