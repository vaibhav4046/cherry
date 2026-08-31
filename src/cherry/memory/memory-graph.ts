import { getDb } from '../persistence/cherry-db.ts';
import { ok, type Result } from '../core/result.ts';
import { isoNow } from '../core/clock.ts';
import type { MemoryGraph, MemoryGraphNode, MemoryGraphEdge } from './memory-graph-model.ts';

export async function buildMemoryGraph(workspaceId: string, missionId?: string | null): Promise<Result<MemoryGraph>> {
  const db = getDb(); const nodes: MemoryGraphNode[] = []; const edges: MemoryGraphEdge[] = []; const diagnostics = [] as MemoryGraph['diagnostics'];
  const add = (id: string, kind: MemoryGraphNode['kind'], recordType: string, r: object, label?: string) => { const d = r as { missionId?: string | null; status?: string; revision?: number; provenance?: Array<{ id: string }> }; nodes.push({ id, kind, type: kind, workspaceId, missionId: d.missionId ?? missionId ?? null, status: d.status, revision: d.revision, provenance: d.provenance?.map((p) => p.id) ?? [], recordType, ...(label ? { label } : {}) }); };
  const edge = (id: string, kind: MemoryGraphEdge['kind'], source: string, target: string) => edges.push({ id, kind, type: kind, source, target });
  const lessons = await db.lessons.where('workspaceId').equals(workspaceId).toArray();
  const lessonIds = new Set(lessons.filter((x) => !missionId || x.missionId === missionId).map((x) => x.id));
  for (const l of lessons) if (lessonIds.has(l.id)) add(l.id, 'source', 'lesson', l, l.title);
  const segments = await db.transcriptSegments.where('workspaceId').equals(workspaceId).toArray();
  for (const s of segments.filter((x) => lessonIds.has(x.lessonId))) { add(s.id, 'transcript-segment', 'transcriptSegment', s); edge(`${s.lessonId}->${s.id}`, 'source→transcript', s.lessonId, s.id); }
  const observations = await db.observations.where('workspaceId').equals(workspaceId).toArray();
  for (const o of observations.filter((x) => lessonIds.has(x.lessonId))) { add(o.id, 'observation', 'observation', o); if (o.evidenceId) edge(`${o.id}->${o.evidenceId}`, 'observation→evidence', o.id, o.evidenceId); }
  const evidence = await db.evidence.where('workspaceId').equals(workspaceId).toArray();
  for (const e of evidence.filter((x) => !missionId || x.missionId === missionId || (x.lessonId && lessonIds.has(x.lessonId)))) { add(e.id, 'evidence-claim', 'evidence', e, e.claim); for (const n of e.usedByNodeIds ?? []) edge(`${e.id}->${n}`, 'evidence→skill-node', e.id, n); }
  const graphs = await db.skillGraphs.where('workspaceId').equals(workspaceId).toArray();
  const skillVersions = await db.skillVersions.where('workspaceId').equals(workspaceId).toArray();
  const graphIds = new Set(graphs.filter((x) => !missionId || x.missionId === missionId).map((g) => g.id));
  for (const g of graphs.filter((x) => graphIds.has(x.id))) { for (const n of g.nodes) { add(n.id, 'skill-node', 'skillNode', { ...n, missionId: g.missionId, revision: g.revision }); for (const e of n.evidenceIds ?? []) edge(`${e}->${n.id}`, 'evidence→skill-node', e, n.id); } for (const v of skillVersions.filter((x) => x.skillGraphId === g.id && x.status === 'approved')) add(v.id, 'approved-skill-revision', 'skillGraphVersion', { ...v, missionId: g.missionId, status: v.status, revision: v.revision }, g.name); }
  const memories = await db.memories.where('workspaceId').equals(workspaceId).toArray();
  for (const m of memories.filter((x) => !missionId || x.missionId === missionId || x.scope === 'workspace' || x.scope === 'global')) { add(m.id, m.status === 'approved' ? 'approved-memory' : 'memory-proposal', 'memory', m, m.title); }
  const routines = await db.routines.where('workspaceId').equals(workspaceId).toArray(); for (const r of routines.filter((x) => graphIds.has(x.skillGraphId))) add(r.id, 'routine', 'routine', r, r.name);
  const artifacts = await db.artifactSets.where('workspaceId').equals(workspaceId).toArray(); for (const a of artifacts.filter((x) => !missionId || x.missionId === missionId)) { const files = await db.artifactFiles.where('artifactSetId').equals(a.id).toArray(); for (const f of files) { add(f.id, 'artifact', 'artifactFile', a, f.path); } }
  const verifications = await db.verifications.where('workspaceId').equals(workspaceId).toArray(); for (const v of verifications.filter((x) => !missionId || x.missionId === missionId)) { add(v.id, 'verification-result', 'verificationReport', v, v.status); for (const a of artifacts.filter((x) => x.id === v.artifactSetId)) for (const f of await db.artifactFiles.where('artifactSetId').equals(a.id).toArray()) edge(`${f.id}->${v.id}`, 'artifact→verification', f.id, v.id); }
  const receipts = await db.receipts.where('workspaceId').equals(workspaceId).toArray(); for (const r of receipts.filter((x) => !missionId || x.missionId === missionId)) { add(r.receiptId, 'proof-receipt', 'receipt', r, r.status); for (const v of verifications.filter((x) => x.missionId === r.missionId)) if (r.events.some((event) => event.objectId === v.id)) edge(`${v.id}->${r.receiptId}`, 'verification→receipt', v.id, r.receiptId); }
  for (const edge of edges) if (!nodes.some((n) => n.id === edge.source) || !nodes.some((n) => n.id === edge.target)) diagnostics.push({ code: 'orphan', recordType: edge.kind, recordId: edge.id, message: `Relationship points to missing record` });
  const validEdges = edges.filter((e) => nodes.some((n) => n.id === e.source) && nodes.some((n) => n.id === e.target));
  const uniqueEdges = [...new Map(validEdges.map((e) => [`${e.kind}:${e.source}:${e.target}`, e])).values()];
  return ok({ workspaceId, missionId: missionId ?? null, nodes, edges: uniqueEdges, diagnostics, createdAt: isoNow() });
}
