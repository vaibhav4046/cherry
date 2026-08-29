#!/usr/bin/env node
import { readFile, access } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const required = [
  'SKILL.md',
  'references/mission.md',
  'references/workflow.md',
  'references/evidence.md',
  'references/memory-policy.md',
  'references/tool-requirements.md',
  'policies/safety.md',
  'policies/originality.md',
  'evals/acceptance-tests.json'
];

const failures = [];
for (const relative of required) {
  try {
    await access(resolve(root, relative));
  } catch {
    failures.push(`Missing required file: ${relative}`);
  }
}

const skillPath = resolve(root, 'SKILL.md');
let skill = '';
try {
  skill = await readFile(skillPath, 'utf8');
} catch {
  failures.push('SKILL.md is unreadable.');
}

if (skill) {
  const match = skill.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    failures.push('SKILL.md is missing YAML frontmatter.');
  } else {
    const name = match[1].match(/^name:\s*([^\n]+)$/m)?.[1]?.trim();
    const description = match[1].match(/^description:\s*([^\n]+)$/m)?.[1]?.trim();
    if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) {
      failures.push('Skill name is missing or invalid.');
    }
    if (name && name !== basename(root)) {
      failures.push(`Skill name '${name}' does not match directory '${basename(root)}'.`);
    }
    if (!description || description.length > 1024) {
      failures.push('Skill description is missing or exceeds 1024 characters.');
    }
  }
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checkedFiles: required.length, skillDirectory: basename(root) }, null, 2));
