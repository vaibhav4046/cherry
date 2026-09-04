import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { instantiateTemplate } from '../../src/cherry/workforce/mission-templates.ts';
import {
  CAPABILITY_STATUSES,
  DEFAULT_CAPABILITY_CATALOGUE,
  capabilityRiskCeiling,
  filterCapabilities,
} from '../../src/cherry/workforce/capability-registry-service.ts';

const plan = instantiateTemplate('release-mission', { workspaceId: 'ws-1', missionId: 'ms-1', outcome: 'Ship it', constraints: [], repositoryRoot: null });
const nodeById = Object.fromEntries(plan.nodes.map((node) => [node.id, node]));

describe('capability catalogue', () => {
  it('lists the twelve catalogued capabilities with honest statuses', () => {
    expect(DEFAULT_CAPABILITY_CATALOGUE.map((capability) => capability.id).sort()).toEqual([
      'browser.navigate',
      'cherry.verify.run',
      'github.pull_request.create',
      'github.repository.read',
      'gmail.draft.create',
      'gmail.message.send',
      'linkedin.post.create',
      'repository.worktree',
      'skill.install',
      'terminal.execute',
      'webmcp.current_page.invoke',
      'youtube.video.upload',
    ]);
    expect(CAPABILITY_STATUSES).toEqual(['validated_real', 'shipped_tested', 'experimental', 'designed', 'unavailable']);
    for (const capability of DEFAULT_CAPABILITY_CATALOGUE) {
      expect(CAPABILITY_STATUSES, capability.id).toContain(capability.status);
    }
    const byId = Object.fromEntries(DEFAULT_CAPABILITY_CATALOGUE.map((capability) => [capability.id, capability]));
    for (const id of ['github.repository.read', 'github.pull_request.create', 'gmail.draft.create', 'gmail.message.send', 'linkedin.post.create', 'youtube.video.upload', 'browser.navigate']) {
      expect(byId[id]!.status, id).toBe('designed');
    }
    expect(byId['webmcp.current_page.invoke']!.status).toBe('validated_real');
    expect(byId['gmail.message.send']!.riskLevel).toBe('critical');
    expect(byId['gmail.message.send']!.sideEffect).toBe('external');
  });

  it('never claims a tested status without evidence that exists in the repository', () => {
    for (const capability of DEFAULT_CAPABILITY_CATALOGUE) {
      if (capability.status === 'validated_real' || capability.status === 'shipped_tested') {
        expect(capability.evidenceRef, capability.id).not.toBeNull();
        expect(existsSync(resolve(process.cwd(), capability.evidenceRef!)), `${capability.id}: ${capability.evidenceRef}`).toBe(true);
      }
    }
    expect(new Set(DEFAULT_CAPABILITY_CATALOGUE.map((capability) => capability.id)).size).toBe(DEFAULT_CAPABILITY_CATALOGUE.length);
  });
});

describe('filterCapabilities', () => {
  it('returns only capabilities the node can use within its risk ceiling', () => {
    const developer = nodeById['developer-fix']!;
    const allowed = filterCapabilities(DEFAULT_CAPABILITY_CATALOGUE, developer).map((capability) => capability.id);
    expect(allowed).toContain('terminal.execute');
    expect(allowed).not.toContain('gmail.message.send');
    expect(allowed).not.toContain('github.pull_request.create');
    expect(allowed).not.toContain('browser.navigate');
    for (const id of allowed) {
      const capability = DEFAULT_CAPABILITY_CATALOGUE.find((candidate) => candidate.id === id)!;
      expect(capability.requires.every((required) => developer.requiredCapabilities.includes(required)), id).toBe(true);
      expect(['validated_real', 'shipped_tested', 'experimental'], id).toContain(capability.status);
    }
  });

  it('gives a verify node only low-risk verification capabilities and a human decision none', () => {
    const verify = nodeById['independent-verification']!;
    expect(filterCapabilities(DEFAULT_CAPABILITY_CATALOGUE, verify).map((capability) => capability.id)).toEqual(['cherry.verify.run']);
    expect(filterCapabilities(DEFAULT_CAPABILITY_CATALOGUE, nodeById['publish-approval']!)).toEqual([]);
    const research = nodeById['research-competitor']!;
    expect(filterCapabilities(DEFAULT_CAPABILITY_CATALOGUE, research).map((capability) => capability.id)).not.toContain('terminal.execute');
  });

  it('caps risk by node kind and declared level', () => {
    expect(capabilityRiskCeiling(nodeById['developer-fix']!)).toBe('medium');
    expect(capabilityRiskCeiling({ ...nodeById['developer-fix']!, riskLevel: 'critical' })).toBe('critical');
    expect(capabilityRiskCeiling(nodeById['independent-verification']!)).toBe('low');
    expect(capabilityRiskCeiling({ ...nodeById['publish-approval']!, riskLevel: 'critical' })).toBe('low');
    const critical = { ...nodeById['developer-fix']!, riskLevel: 'critical' as const, requiredCapabilities: [...nodeById['developer-fix']!.requiredCapabilities, 'network' as const] };
    const ids = filterCapabilities(DEFAULT_CAPABILITY_CATALOGUE, critical).map((capability) => capability.id);
    expect(ids).toContain('terminal.execute');
    expect(ids).not.toContain('gmail.message.send');
  });
});
