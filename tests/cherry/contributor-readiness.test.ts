import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('contributor readiness contract', () => {
  it('documents every supported extension seam and the release discipline', () => {
    const contributing = read('CONTRIBUTING.md');

    expect(contributing).toContain('npm run gates');
    expect(contributing).toContain('npm run verify:all');
    expect(contributing).toContain('## Add a source kind');
    expect(contributing).toContain('## Add a WebMCP tool');
    expect(contributing).toContain('## Add an export target');
    expect(contributing).toContain('## Add a runner job type');
    expect(contributing).toContain('## Claims');
    expect(contributing).toContain('lane');
  });

  it('asks contributors for gates and honest claims in GitHub templates', () => {
    const bug = read('.github/ISSUE_TEMPLATE/bug_report.md');
    const feature = read('.github/ISSUE_TEMPLATE/feature_request.md');
    const pullRequest = read('.github/pull_request_template.md');

    for (const template of [bug, feature, pullRequest]) {
      expect(template.toLowerCase()).toContain('gate');
      expect(template.toLowerCase()).toContain('claim');
    }
  });
});
