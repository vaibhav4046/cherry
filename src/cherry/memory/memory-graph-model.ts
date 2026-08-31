export type MemoryGraphNodeKind =
  | 'source' | 'lesson' | 'transcript-segment' | 'observation' | 'evidence-claim'
  | 'skill-node' | 'approved-skill-revision' | 'memory-proposal' | 'approved-memory'
  | 'routine' | 'verification-result' | 'artifact' | 'proof-receipt';

export interface MemoryGraphNode {
  id: string;
  kind: MemoryGraphNodeKind;
  type: MemoryGraphNodeKind;
  workspaceId: string;
  missionId?: string | null;
  status?: string;
  revision?: number;
  provenance?: string[];
  recordType: string;
  label?: string;
}

export type MemoryGraphEdgeKind = 'source→transcript' | 'transcript→observation' | 'observation→evidence' | 'evidence→skill-node' | 'skill-revision→memory-proposal' | 'memory→routine' | 'skill→artifact' | 'artifact→verification' | 'verification→receipt';

export interface MemoryGraphEdge { id: string; kind: MemoryGraphEdgeKind; type: MemoryGraphEdgeKind; source: string; target: string; }
export interface MemoryGraphDiagnostic { code: 'orphan'; recordType: string; recordId: string; message: string; }
export interface MemoryGraph { workspaceId: string; missionId: string | null; nodes: MemoryGraphNode[]; edges: MemoryGraphEdge[]; diagnostics: MemoryGraphDiagnostic[]; createdAt: string; }

export function provenanceFor(record: { provenance?: Array<{ id: string }>; sourceId?: string | null; evidenceIds?: string[] }): string[] {
  return [...(record.provenance?.map((p) => p.id) ?? []), ...(record.sourceId ? [record.sourceId] : []), ...(record.evidenceIds ?? [])];
}

export const nodeStatus = (node: MemoryGraphNode): string | undefined => node.status;
export const nodeProvenance = (node: MemoryGraphNode): string[] => [...(node.provenance ?? [])];
