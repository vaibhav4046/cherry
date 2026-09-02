/**
 * Capability registry: what a worker may reach for, with an honest status per
 * entry. A status of validated_real or shipped_tested must name the test,
 * capture or command that proves it; everything without proof is designed or
 * unavailable. Pure data and pure filters; nothing here executes anything.
 */

import type { RuntimeCapability } from './workforce-model.ts';
import { PLAN_RISKS, type MissionPlanNode, type PlanRisk } from './mission-plan-model.ts';

export type CapabilityOrigin = 'mcp' | 'webmcp' | 'plugin' | 'connector' | 'browser' | 'cli' | 'filesystem' | 'terminal' | 'skill' | 'cherry';

export const CAPABILITY_STATUSES = ['validated_real', 'shipped_tested', 'experimental', 'designed', 'unavailable'] as const;
export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

export type CapabilitySideEffect = 'none' | 'sandbox' | 'external';

export interface CapabilityDescriptor {
  id: string;
  title: string;
  description: string;
  origin: CapabilityOrigin;
  /** Runtime capabilities a node must declare before this may be allowlisted. */
  requires: RuntimeCapability[];
  riskLevel: PlanRisk;
  sideEffect: CapabilitySideEffect;
  status: CapabilityStatus;
  /** Repository path of the test or capture that proves the status; required for tested statuses. */
  evidenceRef: string | null;
}

export const DEFAULT_CAPABILITY_CATALOGUE: readonly CapabilityDescriptor[] = [
  {
    id: 'github.repository.read',
    title: 'Read a GitHub repository',
    description: 'Read files, issues and pull requests through an official connector.',
    origin: 'connector',
    requires: ['repository_read', 'network'],
    riskLevel: 'low',
    sideEffect: 'none',
    status: 'designed',
    evidenceRef: null,
  },
  {
    id: 'github.pull_request.create',
    title: 'Open a pull request',
    description: 'Push a sandbox branch and open a pull request. Requires approval.',
    origin: 'connector',
    requires: ['repository_write', 'network'],
    riskLevel: 'high',
    sideEffect: 'external',
    status: 'designed',
    evidenceRef: null,
  },
  {
    id: 'gmail.draft.create',
    title: 'Create a Gmail draft',
    description: 'Write a draft in the mailbox without sending it. Requires approval.',
    origin: 'connector',
    requires: ['network'],
    riskLevel: 'medium',
    sideEffect: 'external',
    status: 'designed',
    evidenceRef: null,
  },
  {
    id: 'gmail.message.send',
    title: 'Send an email',
    description: 'Send mail on the person\'s behalf. Always requires approval.',
    origin: 'connector',
    requires: ['network'],
    riskLevel: 'critical',
    sideEffect: 'external',
    status: 'designed',
    evidenceRef: null,
  },
  {
    id: 'linkedin.post.create',
    title: 'Publish a LinkedIn post',
    description: 'Publish through the official API only. Always requires approval; scraping is never used.',
    origin: 'connector',
    requires: ['network'],
    riskLevel: 'critical',
    sideEffect: 'external',
    status: 'designed',
    evidenceRef: null,
  },
  {
    id: 'youtube.video.upload',
    title: 'Upload a YouTube video',
    description: 'Upload through the official API only. Always requires approval.',
    origin: 'connector',
    requires: ['network'],
    riskLevel: 'critical',
    sideEffect: 'external',
    status: 'designed',
    evidenceRef: null,
  },
  {
    id: 'browser.navigate',
    title: 'Drive a visible browser',
    description: 'Open pages in a visible browser that the person can watch. No hidden sessions.',
    origin: 'browser',
    requires: ['browser_control', 'network'],
    riskLevel: 'medium',
    sideEffect: 'external',
    status: 'designed',
    evidenceRef: null,
  },
  {
    id: 'terminal.execute',
    title: 'Run an allowlisted command',
    description: 'Spawn an allowlisted executable inside the sandbox with a minimal environment and no shell.',
    origin: 'terminal',
    requires: ['command_execution'],
    riskLevel: 'medium',
    sideEffect: 'sandbox',
    status: 'shipped_tested',
    evidenceRef: 'runner/v2.test.mjs',
  },
  {
    id: 'skill.install',
    title: 'Install an approved skill bundle',
    description: 'Compile an approved skill graph into a bundle the worker can read.',
    origin: 'skill',
    requires: ['artifact_write'],
    riskLevel: 'low',
    sideEffect: 'sandbox',
    status: 'shipped_tested',
    evidenceRef: 'tests/cherry/compiler.test.ts',
  },
  {
    id: 'webmcp.current_page.invoke',
    title: 'Invoke a WebMCP tool on the current page',
    description: 'Call a tool the current page registered. Live host behaviour is not captured yet.',
    origin: 'webmcp',
    requires: ['page_tools'],
    riskLevel: 'medium',
    sideEffect: 'external',
    status: 'experimental',
    evidenceRef: 'tests/cherry/webmcp.test.ts',
  },
  {
    id: 'cherry.verify.run',
    title: 'Run deterministic checks',
    description: 'File, hash and graph checks over produced artifacts; required checks fail closed.',
    origin: 'cherry',
    requires: ['verification'],
    riskLevel: 'low',
    sideEffect: 'none',
    status: 'shipped_tested',
    evidenceRef: 'tests/cherry/verification-boundary.test.ts',
  },
  {
    id: 'repository.worktree',
    title: 'Work in an isolated git worktree',
    description: 'One branch per worker under an approved root. Promote to shipped_tested when the runner sandbox tests pass.',
    origin: 'filesystem',
    requires: ['repository_write'],
    riskLevel: 'medium',
    sideEffect: 'sandbox',
    status: 'designed',
    evidenceRef: null,
  },
];

/** Statuses that describe code which exists and can be allowlisted. */
const USABLE_STATUSES: readonly CapabilityStatus[] = ['validated_real', 'shipped_tested', 'experimental'];

function riskRank(risk: PlanRisk): number {
  return PLAN_RISKS.indexOf(risk);
}

/** Verify nodes and human decisions never get more than low-risk capabilities; agent nodes get their declared level. */
export function capabilityRiskCeiling(node: MissionPlanNode): PlanRisk {
  return node.kind === 'agent' ? node.riskLevel : 'low';
}

/** The allowlist for a node: usable capabilities whose requirements the node declares, within its risk ceiling. */
export function filterCapabilities(catalogue: readonly CapabilityDescriptor[], node: MissionPlanNode): CapabilityDescriptor[] {
  const ceiling = riskRank(capabilityRiskCeiling(node));
  return catalogue.filter((capability) => USABLE_STATUSES.includes(capability.status)
    && riskRank(capability.riskLevel) <= ceiling
    && capability.requires.every((required) => node.requiredCapabilities.includes(required)));
}
