import { getDb } from '../persistence/cherry-db.ts';
import { ok, type Result } from '../core/result.ts';
import { isoNow } from '../core/clock.ts';
import type { MemoryGraph, MemoryGraphNode, MemoryGraphEdge } from './memory-graph-model.ts';

export async function buildMemoryGraph(workspaceId: string, missionId?: string | null): Promise<Result<MemoryGraph>> {
  const db = getDb(); const nodes: MemoryGraphNode[] = []; const edges: MemoryGraphEdge[] = []; const diagnostics = [] as MemoryGraph['diagnostics'];
  const add = (id: string, kind: MemoryGraphNode['kind'], recordType: string, r: object, label?: string) => { const d = r as { missionId?: string | null; status?: string; revision?: number; provenance?: Array<{ id: string }> }; nodes.push({ id, kind, workspaceId, missionId: d.missionId ?? missionId ?? null, status: d.status, revision: d.revision, provenance: d.provenance?.map((p) => p.id) ?? [], recordType, ...(label ? { label } : {}) }); };
  const lessons = await db.lessons.where('workspaceId').equals(workspaceId).toArray();
  const lessonIds = new Set(lessons.filter((x) => !missionId || x.missionId === missionId).map((x) => x.id));
  for (const l of lessons) if (lessonIds.has(l.id)) { add(l.id, 'lesson', 'lesson', l, l.title); add(`source:${l.id}`, 'source', 'lesson-source', l, l.title); }
  const segments = await db.transcriptSegments.where('workspaceId').equals(workspaceId).toArray();
  for (const s of segments.filter((x) => lessonIds.has(x.lessonId))) { add(s.id, 'transcript-segment', 'transcriptSegment', s); edges.push({ id: `source:${s.lessonId}->${s.id}`, kind: 'source→transcript', source: `source:${s.lessonId}`, target: s.id }); }
  const observations = await db.observations.where('workspaceId').equals(workspaceId).toArray();
  for (const o of observations.filter((x) => lessonIds.has(x.lessonId))) { add(o.id, 'observation', 'observation', o); if (o.evidenceId) edges.push({ id: `${o.id}->${o.evidenceId}`, kind: 'observation→evidence', source: o.id, target: o.evidenceId }); }
  const evidence = await db.evidence.where('workspaceId').equals(workspaceId).toArray();
  for (const e of evidence.filter((x) => !missionId || x.missionId === missionId || (x.lessonId && lessonIds.has(x.lessonId)))) { add(e.id, 'evidence-claim', 'evidence', e, e.claim); for (const n of e.usedByNodeIds ?? []) edges.push({ id: `${e.id}->${n}`, kind: 'evidence→skill-node', source: e.id, target: n }); }
  const graphs = await db.skillGraphs.where('workspaceId').equals(workspaceId).toArray();
  for (const g of graphs.filter((x) => !missionId || x.missionId === missionId)) { for (const n of g.nodes) { add(n.id, 'skill-node', 'skillNode', { ...n, missionId: g.missionId, revision: g.revision }); for (const e of n.evidenceIds ?? []) edges.push({ id: `${e}->${n.id}`, kind: 'evidence→skill-node', source: e, target: n.id }); } if (g.status === 'approved') add(`${g.id}@r${g.revision}`, 'approved-skill-revision', 'skillGraph', g, g.name); }
  const memories = await db.memories.where('workspaceId').equals(workspaceId).toArray();
  for (const m of memories.filter((x) => !missionId || x.missionId === missionId || x.scope === 'workspace' || x.scope === 'global')) { add(m.id, m.status === 'approved' ? 'approved-memory' : 'memory-proposal', 'memory', m, m.title); for (const source of m.derivedFromMemoryIds ?? []) edges.push({ id: `${source}->${m.id}`, kind: 'skill-revision→memory-proposal', source, target: m.id }); }
  const routines = await db.routines.where('workspaceId').equals(workspaceId).toArray(); for (const r of routines) { add(r.id, 'routine', 'routine', r, r.name); edges.push({ id: `${r.skillGraphId}->${r.id}`, kind: 'memory→routine', source: r.skillGraphId, target: r.id }); }
  const artifacts = await db.artifactSets.where('workspaceId').equals(workspaceId).toArray(); for (const a of artifacts.filter((x) => !missionId || x.missionId === missionId)) { const files = await db.artifactFiles.where('artifactSetId').equals(a.id).toArray(); for (const f of files) { add(f.id, 'artifact', 'artifactFile', a, f.path); } }
  const verifications = await db.verifications.where('workspaceId').equals(workspaceId).toArray(); for (const v of verifications.filter((x) => !missionId || x.missionId === missionId)) { for (const r of v.results) { add(r.id, 'verification-result', 'verificationResult', { ...r, missionId: v.missionId }, r.name); } for (const a of artifacts.filter((x) => x.id === v.artifactSetId)) for (const f of await db.artifactFiles.where('artifactSetId').equals(a.id).toArray()) edges.push({ id: `${f.id}->${v.id}`, kind: 'artifact→verification', source: f.id, target: v.id }); }
  const receipts = await db.receipts.where('workspaceId').equals(workspaceId).toArray(); for (const r of receipts.filter((x) => !missionId || x.missionId === missionId)) { add(r.receiptId, 'proof-receipt', 'receipt', r, r.status); for (const v of verifications.filter((x) => x.missionId === r.missionId)) for (const result of v.results) edges.push({ id: `${result.id}->${r.receiptId}`, kind: 'verification→receipt', source: result.id, target: r.receiptId }); }
  for (const edge of edges) if (!nodes.some((n) => n.id === edge.source) || !nodes.some((n) => n.id === edge.target)) diagnostics.push({ code: 'orphan', recordType: edge.kind, recordId: edge.id, message: `Relationship points to missing record` });
  return ok({ workspaceId, missionId: missionId ?? null, nodes, edges: edges.filter((e) => nodes.some((n) => n.id === e.source) && nodes.some((n) => n.id === e.target)), diagnostics, createdAt: isoNow() });
}
