/**
 * Deterministic mission templates. A template turns an outcome into a valid
 * draft plan; nothing here reads or writes state. Node text is fixed so the
 * same outcome always produces the same graph, and every agent or verify node
 * carries real checks on the files it declares.
 */

import { isoNow } from '../core/clock.ts';
import { newId } from '../core/ids.ts';
import {
  REPOSITORY_ROOT_CONTEXT_PREFIX,
  type MissionPlan,
  type MissionPlanNode,
  type VerificationCheckSpec,
} from './mission-plan-model.ts';

export type MissionTemplateId = 'repository-audit' | 'release-mission' | 'research-brief' | 'creator-draft';

export interface MissionTemplate {
  id: MissionTemplateId;
  name: string;
  description: string;
  /** Word-prefix keywords, matched case-insensitively in priority order. */
  keywords: readonly string[];
}

export const MISSION_TEMPLATES: readonly MissionTemplate[] = [
  {
    id: 'repository-audit',
    name: 'Repository audit',
    description: 'Inventory a repository, audit its dependencies and code quality, verify the report, then hand the findings to a person.',
    keywords: ['audit', 'repositor', 'repo ', 'defect', 'fix', 'bug', 'security', 'lint', 'dependenc', 'vulnerab', 'codebase', 'code quality'],
  },
  {
    id: 'release-mission',
    name: 'Release mission',
    description: 'Research and audit in parallel, prioritise, fix inside an isolated worktree, draft release notes, verify independently, then ask before publishing.',
    keywords: ['release', 'ship', 'launch content', 'deploy', 'competitor', 'failing test', 'regression', 'onboarding'],
  },
  {
    id: 'research-brief',
    name: 'Research brief',
    description: 'Gather sources, extract claims, draft a brief and check it against the sources.',
    keywords: [],
  },
  {
    id: 'creator-draft',
    name: 'Own my creator pipeline',
    description: 'Collect project updates, pick an angle, draft a LinkedIn post and a YouTube outline in parallel, fact-check, review the voice, then ask before anything is published.',
    keywords: ['creator', 'linkedin', 'youtube', 'newsletter', 'audience', 'content pipeline', 'social post', 'video'],
  },
];

const MATCH_PRIORITY: readonly MissionTemplateId[] = ['creator-draft', 'release-mission', 'repository-audit', 'research-brief'];

export function isMissionTemplateId(value: string): value is MissionTemplateId {
  return MISSION_TEMPLATES.some((template) => template.id === value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Deterministic keyword match; defaults to the research brief. */
export function matchTemplateForOutcome(outcome: string): MissionTemplateId {
  const lowered = outcome.toLowerCase();
  for (const id of MATCH_PRIORITY) {
    const template = MISSION_TEMPLATES.find((candidate) => candidate.id === id)!;
    if (template.keywords.some((keyword) => new RegExp(`\\b${escapeRegExp(keyword)}`).test(lowered))) return id;
  }
  return 'research-brief';
}

export interface InstantiateTemplateInput {
  workspaceId: string;
  missionId: string;
  outcome: string;
  constraints: string[];
  repositoryRoot: string | null;
}

const AGENT_TIMEOUT_MS = 600_000;
const DEVELOPER_TIMEOUT_MS = 1_200_000;
const VERIFY_TIMEOUT_MS = 300_000;
const HUMAN_TIMEOUT_MS = 1_800_000;

type NodeSeed = Partial<Omit<MissionPlanNode, 'id' | 'title' | 'objective' | 'definitionOfDone' | 'missionId'>> & Pick<MissionPlanNode, 'id' | 'title' | 'objective' | 'definitionOfDone'>;

function fileCheck(id: string, path: string, description: string): VerificationCheckSpec {
  return { id, kind: 'file', required: true, path, description };
}

function containsCheck(id: string, path: string, contains: string, description: string): VerificationCheckSpec {
  return { id, kind: 'file_contains', required: true, path, contains, description };
}

function humanCheck(id: string, description: string): VerificationCheckSpec {
  return { id, kind: 'human', required: true, description };
}

function commandCheck(id: string, argv: string[], description: string): VerificationCheckSpec {
  return { id, kind: 'command', required: true, argv, expectExitCode: 0, description };
}

/**
 * The checks every verify node runs on top of its own: the repository tests when a root exists.
 * Without a repository the verify node has nothing to execute, so it is exactly its artifact checks;
 * a verify node never writes files, so it must not demand a report of its own.
 */
function verifyChecks(repositoryRoot: string | null): VerificationCheckSpec[] {
  return repositoryRoot ? [commandCheck('tests', ['node', '--test'], 'The repository test suite passes inside the sandbox')] : [];
}

function agentNode(seed: NodeSeed): NodeSeed {
  return {
    kind: 'agent',
    requiredCapabilities: ['repository_read', 'artifact_write'],
    riskLevel: 'low',
    maxAttempts: 2,
    timeoutMs: AGENT_TIMEOUT_MS,
    sandbox: 'directory',
    ...seed,
  };
}

function verifyNode(seed: NodeSeed, repositoryRoot: string | null): NodeSeed {
  return {
    kind: 'verify',
    requiredCapabilities: ['verification'],
    riskLevel: 'low',
    maxAttempts: 1,
    timeoutMs: VERIFY_TIMEOUT_MS,
    sandbox: repositoryRoot ? 'git-worktree' : 'directory',
    ...seed,
    verificationPlan: [...(seed.verificationPlan ?? []), ...verifyChecks(repositoryRoot)],
  };
}

function humanNode(seed: NodeSeed): NodeSeed {
  return {
    kind: 'human_decision',
    requiredCapabilities: ['human_approval'],
    riskLevel: 'low',
    maxAttempts: 1,
    timeoutMs: HUMAN_TIMEOUT_MS,
    sandbox: 'none',
    verificationPlan: [humanCheck(`${seed.id}-human`, 'A person decides')],
    ...seed,
  };
}

function repositoryAuditNodes(repositoryRoot: string | null): NodeSeed[] {
  return [
    agentNode({
      id: 'inventory-repository',
      title: 'Inventory the repository',
      objective: 'List the modules, entry points, build steps and test commands of the repository described by the mission outcome.',
      definitionOfDone: ['artifacts/inventory.md lists every top-level module with its purpose', 'Build and test commands are recorded exactly as found'],
      verificationPlan: [fileCheck('inventory', 'artifacts/inventory.md', 'Inventory written')],
    }),
    agentNode({
      id: 'audit-dependencies',
      title: 'Audit dependencies',
      objective: 'Review declared dependencies for outdated, unused or risky packages using only the repository contents.',
      definitionOfDone: ['artifacts/dependency-audit.md lists each finding with the file and line that supports it'],
      dependencyIds: ['inventory-repository'],
      verificationPlan: [fileCheck('dependency-audit', 'artifacts/dependency-audit.md', 'Dependency audit written')],
    }),
    agentNode({
      id: 'audit-code-quality',
      title: 'Audit code quality',
      objective: 'Review the code for oversized files, missing error handling, duplicated logic and untested paths.',
      definitionOfDone: ['artifacts/code-quality.md lists each finding with a file reference and a suggested fix'],
      dependencyIds: ['inventory-repository'],
      verificationPlan: [fileCheck('code-quality', 'artifacts/code-quality.md', 'Code quality audit written')],
    }),
    agentNode({
      id: 'consolidate-findings',
      title: 'Consolidate the findings',
      objective: 'Merge the dependency and code quality findings into one prioritised report.',
      definitionOfDone: ['artifacts/audit-report.md has a "## Findings" section ordered by severity', 'Every finding cites its source audit'],
      dependencyIds: ['audit-dependencies', 'audit-code-quality'],
      verificationPlan: [
        fileCheck('audit-report', 'artifacts/audit-report.md', 'Audit report written'),
        containsCheck('audit-report-findings', 'artifacts/audit-report.md', '## Findings', 'The report has a findings section'),
      ],
    }),
    verifyNode({
      id: 'independent-verification',
      title: 'Independent verification',
      objective: 'Confirm the audit report exists and the repository still passes its own tests.',
      definitionOfDone: ['Every required check passed'],
      dependencyIds: ['consolidate-findings'],
      verificationPlan: [fileCheck('audit-report-present', 'artifacts/audit-report.md', 'Audit report present for review')],
    }, repositoryRoot),
    humanNode({
      id: 'review-findings',
      title: 'Review the findings',
      objective: 'A person reads the audit report and decides what happens next.',
      definitionOfDone: ['A person recorded a decision on the audit report'],
      dependencyIds: ['independent-verification'],
    }),
  ];
}

function releaseMissionNodes(repositoryRoot: string | null): NodeSeed[] {
  return [
    agentNode({
      id: 'research-competitor',
      title: 'Research the competitor',
      objective: 'Summarise what comparable products do for the outcome, using only the approved context and sources in the bundle.',
      definitionOfDone: ['artifacts/competitor-brief.md summarises at least three comparable approaches', 'Every claim names the source excerpt it came from'],
      verificationPlan: [fileCheck('competitor-brief', 'artifacts/competitor-brief.md', 'Competitor brief written')],
    }),
    agentNode({
      id: 'audit-onboarding',
      title: 'Audit the onboarding',
      objective: 'Walk the first-run experience in the repository and record every friction point.',
      definitionOfDone: ['artifacts/onboarding-audit.md lists each friction point with the file that causes it'],
      verificationPlan: [fileCheck('onboarding-audit', 'artifacts/onboarding-audit.md', 'Onboarding audit written')],
    }),
    agentNode({
      id: 'prioritise',
      title: 'Prioritise the work',
      objective: 'Rank the findings from the research and the audit into one ordered list for this release.',
      definitionOfDone: ['artifacts/priorities.md has a "## Priorities" section with the ordered list', 'The top item names the fix the developer will make'],
      dependencyIds: ['research-competitor', 'audit-onboarding'],
      verificationPlan: [
        fileCheck('priorities', 'artifacts/priorities.md', 'Priorities written'),
        containsCheck('priorities-section', 'artifacts/priorities.md', '## Priorities', 'The priorities section exists'),
      ],
    }),
    agentNode({
      id: 'developer-fix',
      title: 'Developer fix',
      objective: 'Implement the top priority inside the isolated worktree and describe the change.',
      definitionOfDone: ['The change is committed on the sandbox branch only', 'artifacts/fix-summary.md explains what changed and how it was tested'],
      dependencyIds: ['prioritise'],
      preferredHostKinds: ['codex-cli', 'claude-cli'],
      requiredCapabilities: ['repository_read', 'repository_write', 'command_execution', 'artifact_write'],
      riskLevel: 'medium',
      timeoutMs: DEVELOPER_TIMEOUT_MS,
      // A worktree needs a repository; without one the fix still runs in its own directory sandbox.
      sandbox: repositoryRoot ? 'git-worktree' : 'directory',
      verificationPlan: [fileCheck('fix-summary', 'artifacts/fix-summary.md', 'Fix summary written')],
    }),
    agentNode({
      id: 'content-draft',
      title: 'Draft the release notes',
      objective: 'Write release notes for the prioritised change in plain English.',
      definitionOfDone: ['content/release-notes.md describes the change for a reader who did not build it'],
      dependencyIds: ['prioritise'],
      verificationPlan: [fileCheck('release-notes', 'content/release-notes.md', 'Release notes written')],
    }),
    verifyNode({
      id: 'independent-verification',
      title: 'Independent verification',
      objective: 'Check the fix summary, the release notes and the repository tests without trusting the workers.',
      definitionOfDone: ['Every required check passed'],
      dependencyIds: ['developer-fix', 'content-draft'],
      verificationPlan: [
        fileCheck('fix-summary-present', 'artifacts/fix-summary.md', 'Fix summary present'),
        fileCheck('release-notes-present', 'content/release-notes.md', 'Release notes present'),
      ],
    }, repositoryRoot),
    humanNode({
      id: 'publish-approval',
      title: 'Publish approval',
      objective: 'A person decides whether the verified release is published.',
      definitionOfDone: ['A person recorded a publish decision'],
      dependencyIds: ['independent-verification'],
      riskLevel: 'high',
    }),
  ];
}

function researchBriefNodes(repositoryRoot: string | null): NodeSeed[] {
  return [
    agentNode({
      id: 'gather-sources',
      title: 'Gather the sources',
      objective: 'Collect the relevant excerpts from the approved context bundle for the outcome.',
      definitionOfDone: ['artifacts/sources.md lists each source with its trust label'],
      verificationPlan: [fileCheck('sources', 'artifacts/sources.md', 'Sources written')],
    }),
    agentNode({
      id: 'extract-claims',
      title: 'Extract the claims',
      objective: 'Turn the sources into a list of checkable claims.',
      definitionOfDone: ['artifacts/claims.md lists each claim with the source that supports it'],
      dependencyIds: ['gather-sources'],
      verificationPlan: [fileCheck('claims', 'artifacts/claims.md', 'Claims written')],
    }),
    agentNode({
      id: 'draft-brief',
      title: 'Draft the brief',
      objective: 'Write the research brief from the claims.',
      definitionOfDone: ['artifacts/research-brief.md has a "## Summary" section and a "## Sources" section'],
      dependencyIds: ['extract-claims'],
      verificationPlan: [
        fileCheck('brief', 'artifacts/research-brief.md', 'Brief written'),
        containsCheck('brief-summary', 'artifacts/research-brief.md', '## Summary', 'The brief has a summary'),
        containsCheck('brief-sources', 'artifacts/research-brief.md', '## Sources', 'The brief lists its sources'),
      ],
    }),
    verifyNode({
      id: 'fact-check',
      title: 'Fact check',
      objective: 'Confirm the brief and its claims exist and are traceable to sources.',
      definitionOfDone: ['Every required check passed'],
      dependencyIds: ['draft-brief'],
      verificationPlan: [
        fileCheck('brief-present', 'artifacts/research-brief.md', 'Brief present'),
        fileCheck('claims-present', 'artifacts/claims.md', 'Claims present'),
      ],
    }, repositoryRoot),
  ];
}

function creatorDraftNodes(repositoryRoot: string | null): NodeSeed[] {
  return [
    agentNode({
      id: 'collect-project-updates',
      title: 'Collect project updates',
      objective: 'Gather what changed in the project recently from the approved context.',
      definitionOfDone: ['content/project-updates.md lists the updates worth sharing'],
      verificationPlan: [fileCheck('project-updates', 'content/project-updates.md', 'Project updates written')],
    }),
    agentNode({
      id: 'research-current-context',
      title: 'Research the current context',
      objective: 'Summarise what the audience is talking about, using only the source excerpts in the bundle.',
      definitionOfDone: ['content/current-context.md summarises the context with source labels'],
      verificationPlan: [fileCheck('current-context', 'content/current-context.md', 'Current context written')],
    }),
    agentNode({
      id: 'select-content-angle',
      title: 'Select the content angle',
      objective: 'Choose one angle that connects the project updates with the current context.',
      definitionOfDone: ['content/angle.md has a "## Angle" section with one chosen angle and why'],
      dependencyIds: ['collect-project-updates', 'research-current-context'],
      verificationPlan: [
        fileCheck('angle', 'content/angle.md', 'Angle written'),
        containsCheck('angle-section', 'content/angle.md', '## Angle', 'The angle section exists'),
      ],
    }),
    agentNode({
      id: 'draft-linkedin-post',
      title: 'Draft the LinkedIn post',
      objective: 'Write a LinkedIn post for the chosen angle. Nothing is published.',
      definitionOfDone: ['content/linkedin-post.md holds the draft post'],
      dependencyIds: ['select-content-angle'],
      verificationPlan: [fileCheck('linkedin-post', 'content/linkedin-post.md', 'LinkedIn draft written')],
    }),
    agentNode({
      id: 'draft-youtube-outline',
      title: 'Draft the YouTube outline',
      objective: 'Write a video outline for the chosen angle. Nothing is uploaded.',
      definitionOfDone: ['content/youtube-outline.md holds the outline with timestamps'],
      dependencyIds: ['select-content-angle'],
      verificationPlan: [fileCheck('youtube-outline', 'content/youtube-outline.md', 'YouTube outline written')],
    }),
    agentNode({
      id: 'fact-check',
      title: 'Fact check the drafts',
      objective: 'List every factual claim in both drafts and the excerpt that supports it.',
      definitionOfDone: ['content/fact-check.md has a "## Claims" section covering both drafts'],
      dependencyIds: ['draft-linkedin-post', 'draft-youtube-outline'],
      verificationPlan: [
        fileCheck('fact-check', 'content/fact-check.md', 'Fact check written'),
        containsCheck('fact-check-claims', 'content/fact-check.md', '## Claims', 'The claims section exists'),
      ],
    }),
    verifyNode({
      id: 'voice-review',
      title: 'Voice review',
      objective: 'Confirm both drafts and the fact check exist before a person reads them.',
      definitionOfDone: ['Every required check passed'],
      dependencyIds: ['fact-check'],
      verificationPlan: [
        fileCheck('linkedin-present', 'content/linkedin-post.md', 'LinkedIn draft present'),
        fileCheck('youtube-present', 'content/youtube-outline.md', 'YouTube outline present'),
        fileCheck('fact-check-present', 'content/fact-check.md', 'Fact check present'),
      ],
    }, repositoryRoot),
    humanNode({
      id: 'request-publish-approval',
      title: 'Request publish approval',
      objective: 'A person decides whether either draft is published.',
      definitionOfDone: ['A person recorded a publish decision'],
      dependencyIds: ['voice-review'],
      riskLevel: 'high',
    }),
  ];
}

const TEMPLATE_NODES: Record<MissionTemplateId, (repositoryRoot: string | null) => NodeSeed[]> = {
  'repository-audit': repositoryAuditNodes,
  'release-mission': releaseMissionNodes,
  'research-brief': researchBriefNodes,
  'creator-draft': creatorDraftNodes,
};

function materialise(seed: NodeSeed, missionId: string, repositoryRoot: string | null): MissionPlanNode {
  const sandbox = seed.sandbox ?? 'directory';
  const contextRefs = [...(seed.contextRefs ?? [])];
  if (repositoryRoot && sandbox !== 'none') contextRefs.push(`${REPOSITORY_ROOT_CONTEXT_PREFIX}${repositoryRoot}`);
  return {
    id: seed.id,
    missionId,
    title: seed.title,
    objective: seed.objective,
    definitionOfDone: seed.definitionOfDone,
    dependencyIds: seed.dependencyIds ?? [],
    kind: seed.kind ?? 'agent',
    preferredAgentProfileId: seed.preferredAgentProfileId ?? null,
    preferredHostKinds: seed.preferredHostKinds ?? [],
    requiredCapabilities: seed.requiredCapabilities ?? [],
    riskLevel: seed.riskLevel ?? 'low',
    verificationPlan: seed.verificationPlan ?? [],
    contextRefs,
    maxAttempts: seed.maxAttempts ?? 1,
    timeoutMs: seed.timeoutMs ?? AGENT_TIMEOUT_MS,
    sandbox,
  };
}

/** Returns a draft plan that passes validateMissionPlan. Throws only for an unknown template id. */
export function instantiateTemplate(templateId: MissionTemplateId, input: InstantiateTemplateInput): MissionPlan {
  const build = TEMPLATE_NODES[templateId];
  if (!build) throw new Error(`Unknown mission template ${String(templateId)}`);
  const repositoryRoot = input.repositoryRoot?.trim() ? input.repositoryRoot.trim() : null;
  const now = isoNow();
  return {
    id: newId('pl'),
    workspaceId: input.workspaceId,
    missionId: input.missionId,
    templateId,
    outcome: input.outcome.trim(),
    constraints: input.constraints.map((line) => line.trim()).filter(Boolean),
    nodes: build(repositoryRoot).map((seed) => materialise(seed, input.missionId, repositoryRoot)),
    status: 'draft',
    revision: 1,
    contentHash: '',
    approvalId: null,
    nodeWorkItemIds: {},
    createdAt: now,
    updatedAt: now,
  };
}
