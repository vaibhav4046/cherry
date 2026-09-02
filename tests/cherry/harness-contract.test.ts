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
      'npm run gates && npm run build && npm run test:e2e && npm run verify:pack && npm run verify:sw && npm run audit:submission',
    );
  });

  it('keeps the install graph synchronized with the lockfile', () => {
    const packageJson = JSON.parse(readRepoFile('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const packageLock = JSON.parse(readRepoFile('package-lock.json')) as {
      packages?: Record<
        string,
        { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
      >;
    };
    const root = packageLock.packages?.[''];

    expect(root).toBeDefined();
    expect(root?.dependencies).toEqual(packageJson.dependencies);
    expect(root?.devDependencies).toEqual(packageJson.devDependencies);
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
    expect(contract).toContain('direct store mutation');
    expect(contract).toContain('exact revision');
    expect(contract).toContain('pairing token');
    expect(contract).toMatch(/labelled synthetic/i);
    expect(contract).toContain('package-lock.json');
    expect(contract).toContain('headless automation of ChatGPT, Codex, or Claude');
    expect(contract).toContain('BLOCKED');
  });

  it('points every rule layer to repository-owned source material', () => {
    const contract = readRepoFile('AGENTS.md');

    for (const path of [
      'docs/CHERRY_REPO_MAP.md',
      'docs/CHERRY_DECISIONS.md',
      'docs/codex-takeover/00_MASTER_PROMPT.md',
      'docs/codex-takeover/02_TICKETS.md',
      'docs/codex-takeover/03_DESIGN_DIRECTIVE.md',
      'docs/codex-takeover/04_COPY_GUIDE.md',
      'docs/codex-takeover/05_GUARDRAILS.md',
      'docs/codex-takeover/06_OPERATING_MODEL.md',
      'docs/codex-takeover/STATUS.md',
    ]) {
      expect(contract).toContain(path);
      expect(() => readRepoFile(path)).not.toThrow();
    }
  });
});
