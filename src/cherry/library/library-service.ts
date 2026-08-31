import { listWorkspaces } from '../mission/mission-service.ts';
import { getSkillGraph, listApprovals, listSkillGraphs } from '../skillgraph/skillgraph-service.ts';
import type { SkillGraph } from '../skillgraph/skillgraph-model.ts';
import { listEvidence } from '../evidence/evidence-service.ts';
import { listMemories } from '../memory/memory-service.ts';
import { buildSkillMarkdown, skillDirectoryName } from '../compiler/skill-markdown.ts';
import { buildClaudeTarget, buildCodexTarget } from '../compiler/target-files.ts';
import { ok, type Result } from '../core/result.ts';
import { approvalRequired, notFound } from '../core/errors.ts';

/**
 * Cross-workspace skill library: read-only aggregation over approved (and
 * in-progress) SkillGraphs. The library is the product's noun — "the skills
 * Cherry has learned for you" — and the serving layer for agents. Everything
 * here is a pure read; approvals, revisions, and compilation stay in their
 * own services with their existing human-only gates.
 */

export interface LibraryEntry {
  skillId: string;
  name: string;
  slug: string;
  purpose: string;
  status: SkillGraph['status'];
  version: string;
  revision: number;
  approvedRevision: number | null;
  /** True when the graph is approved at its exact current revision (export-eligible). */
  installReady: boolean;
  /** Content hash of the binding approval, when recorded. */
  approvalHash: string | null;
  targets: string[];
  nodeCount: number;
  evaluationCount: number;
  workspaceId: string;
  workspaceName: string;
  missionId: string | null;
  updatedAt: string;
}

export type SkillExportFormat = 'skill-md' | 'agents-md' | 'claude-md';

export interface SkillExportFile {
  fileName: string;
  mimeType: 'text/markdown';
  content: string;
  skillId: string;
  format: SkillExportFormat;
  revision: number;
  version: string;
}

function toEntry(graph: SkillGraph, workspaceName: string, approvalHash: string | null): LibraryEntry {
  return {
    skillId: graph.id,
    name: graph.name,
    slug: skillDirectoryName(graph),
    purpose: graph.purpose,
    status: graph.status,
    version: graph.version,
    revision: graph.revision,
    approvedRevision: graph.approvedRevision ?? null,
    installReady: graph.status === 'approved' && graph.approvedRevision === graph.revision,
    approvalHash,
    targets: [...graph.targets],
    nodeCount: graph.nodes.length,
    evaluationCount: graph.evaluations.length,
    workspaceId: graph.workspaceId,
    workspaceName,
    missionId: graph.missionId ?? null,
    updatedAt: graph.updatedAt,
  };
}

/** Every skill in every local workspace, install-ready first, newest inside each group. */
export async function listLibraryEntries(): Promise<LibraryEntry[]> {
  const workspaces = await listWorkspaces();
  const entries: LibraryEntry[] = [];
  for (const workspace of workspaces) {
    const [graphs, approvals] = await Promise.all([listSkillGraphs(workspace.id), listApprovals(workspace.id)]);
    for (const graph of graphs) {
      const binding = approvals.find(
        (approval) =>
          approval.objectId === graph.id &&
          approval.decision === 'approved' &&
          approval.objectRevision === (graph.approvedRevision ?? -1),
      );
      entries.push(toEntry(graph, workspace.name, binding?.contentHash ?? null));
    }
  }
  return entries.sort((a, b) => {
    if (a.installReady !== b.installReady) return a.installReady ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export interface LibraryFilter {
  query?: string;
  status?: 'all' | 'approved';
}

export function filterLibraryEntries(entries: LibraryEntry[], filter: LibraryFilter): LibraryEntry[] {
  const query = filter.query?.trim().toLowerCase() ?? '';
  return entries.filter((entry) => {
    if (filter.status === 'approved' && !entry.installReady) return false;
    if (!query) return true;
    const haystack = `${entry.name} ${entry.purpose} ${entry.targets.join(' ')} ${entry.workspaceName}`.toLowerCase();
    return query.split(/\s+/).every((token) => haystack.includes(token));
  });
}

export interface SkillRecommendation {
  skillId: string;
  name: string;
  purpose: string;
  status: SkillGraph['status'];
  installReady: boolean;
  version: string;
  revision: number;
  approvalHash: string | null;
  score: number;
  matchedOn: string[];
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'you',
  'how', 'what', 'can', 'use', 'using', 'about', 'need', 'want', 'help', 'please',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

/**
 * Deterministic lexical ranking — intentionally not an LLM call. The visiting
 * agent brings the reasoning; Cherry brings the memory. Scoring is explainable
 * so the result can honestly say why a skill matched.
 */
export function rankSkillsForTask(entries: LibraryEntry[], task: string, limit = 5): SkillRecommendation[] {
  const tokens = [...new Set(tokenize(task))];
  const scored: SkillRecommendation[] = [];
  for (const entry of entries) {
    const nameTokens = new Set(tokenize(entry.name));
    const purposeTokens = new Set(tokenize(entry.purpose));
    let score = 0;
    const matchedOn = new Set<string>();
    for (const token of tokens) {
      if (nameTokens.has(token)) {
        score += 3;
        matchedOn.add(`name:${token}`);
      }
      if (purposeTokens.has(token)) {
        score += 1;
        matchedOn.add(`purpose:${token}`);
      }
    }
    if (score === 0) continue;
    if (entry.installReady) score += 2;
    scored.push({
      skillId: entry.skillId,
      name: entry.name,
      purpose: entry.purpose.slice(0, 240),
      status: entry.status,
      installReady: entry.installReady,
      version: entry.version,
      revision: entry.revision,
      approvalHash: entry.approvalHash,
      score,
      matchedOn: [...matchedOn].slice(0, 8),
    });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Render one skill as an installable file. Mirrors the compiler's gate: every
 * export format requires a human approval at the exact current revision, the
 * same rule the .zip bundle enforces.
 */
export async function exportSkillFile(skillGraphId: string, format: SkillExportFormat): Promise<Result<SkillExportFile>> {
  const graph = await getSkillGraph(skillGraphId);
  if (!graph) return notFound('SkillGraph', skillGraphId);
  if (graph.status !== 'approved' || graph.approvedRevision !== graph.revision) {
    return approvalRequired('Exports require a human approval at the exact current revision', {
      status: graph.status,
      revision: graph.revision,
      approvedRevision: graph.approvedRevision ?? null,
    });
  }
  const directory = skillDirectoryName(graph);
  const wrap = (fileName: string, content: string): Result<SkillExportFile> =>
    ok({ fileName, mimeType: 'text/markdown', content, skillId: graph.id, format, revision: graph.revision, version: graph.version });

  if (format === 'agents-md') {
    return wrap(`${directory}-AGENTS.md`, buildCodexTarget(graph, directory).agentsMd);
  }
  if (format === 'claude-md') {
    return wrap(`${directory}-CLAUDE.md`, buildClaudeTarget(graph, directory).claudeMd);
  }
  const evidence = await listEvidence(graph.workspaceId, graph.missionId ? { missionId: graph.missionId } : undefined);
  const memories = await listMemories(graph.workspaceId, { status: 'approved' });
  return wrap(`${directory}-SKILL.md`, buildSkillMarkdown(graph, evidence, memories));
}
