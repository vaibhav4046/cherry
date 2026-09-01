import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readRepoFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('repository harness contract', () => {
  it('keeps the fast and complete gate commands explicit', () => {
    const packageJson = JSON.parse(readRepoFile('package.json')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.gates).toBe(
      'npm run typecheck && npm run lint && npm run test && npm run test:runner',
    );
    expect(packageJson.scripts?.['verify:all']).toBe(
      'npm run gates && npm run build && npm run test:e2e && npm run verify:pack && npm run audit:submission',
    );
  });

  it('pins the three enforceable rule layers in AGENTS.md', () => {
    const contract = readRepoFile('AGENTS.md');

    expect(contract).toContain('## Layer 1 — Product invariants');
    expect(contract).toContain('## Layer 2 — Delivery process');
    expect(contract).toContain('## Layer 3 — Source-of-truth pointers');
    expect(contract).toContain('ProofEvent');
    expect(contract).toContain('human-only');
    expect(contract).toContain('single deployer');
    expect(contract).toContain('STATUS.md');
  });

  it('points every rule layer to repository-owned source material', () => {
    const contract = readRepoFile('AGENTS.md');

    for (const path of [
      'docs/CHERRY_REPO_MAP.md',
      'docs/CHERRY_DECISIONS.md',
      'docs/codex-takeover/00_MASTER_PROMPT.md',
      'docs/codex-takeover/02_TICKETS.md',
      'docs/codex-takeover/05_GUARDRAILS.md',
      'docs/codex-takeover/06_OPERATING_MODEL.md',
      'docs/codex-takeover/STATUS.md',
    ]) {
      expect(contract).toContain(path);
      expect(() => readRepoFile(path)).not.toThrow();
    }
  });
});
