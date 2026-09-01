import { listEvidence } from '../evidence/evidence-service.ts';
import type { EvidenceRecord } from '../evidence/evidence-model.ts';
import type { SkillGraph } from './skillgraph-model.ts';

/** Evidence is attached to a skill only through an explicit graph reference. */
export function referencedSkillEvidenceIds(graph: SkillGraph): Set<string> {
  return new Set([
    ...graph.nodes.flatMap((node) => node.evidenceIds),
    ...(graph.knowledge ?? []).map((reference) => reference.evidenceId),
  ]);
}

/**
 * Resolve only evidence referenced by this graph. The workspace and mission
 * query remains a second boundary so a malformed cross-scope ID cannot leak
 * another project's evidence into a detail view or export.
 */
export async function listSkillEvidence(graph: SkillGraph): Promise<EvidenceRecord[]> {
  const referencedIds = referencedSkillEvidenceIds(graph);
  if (referencedIds.size === 0) return [];

  const records = await listEvidence(
    graph.workspaceId,
    graph.missionId ? { missionId: graph.missionId } : undefined,
  );
  return records.filter((record) => referencedIds.has(record.id));
}
