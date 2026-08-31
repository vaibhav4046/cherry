export interface ProofSource {
  id: string;
  type: 'human' | 'video' | 'transcript' | 'webpage' | 'document' | 'repository' | 'tool-result' | 'memory';
  uri?: string | null;
  timestampSeconds?: number;
  trust: 'untrusted' | 'reviewed' | 'approved';
  description: string;
  contentHash?: string | null;
}

export interface ProofReceiptEvent {
  id: string;
  sequence: number;
  type: string;
  actorType: 'human' | 'agent' | 'system' | 'runner' | 'provider';
  actorId?: string | null;
  occurredAt: string;
  objectType: string;
  objectId: string;
  summary: string;
  payloadHash?: string | null;
}

export interface ProofApproval {
  id: string;
  objectType: 'mission' | 'skillgraph' | 'artifact-set' | 'memory' | 'runner-job' | 'export';
  objectId: string;
  objectRevision: number;
  decision: 'approved' | 'rejected';
  decidedBy: string;
  decidedAt: string;
  comment?: string;
  contentHash?: string;
}

export interface ProofArtifact {
  path: string;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
  artifactRevision?: number;
}

export interface ProofAssertion {
  id: string;
  name: string;
  type: string;
  severity: string;
  status: 'passed' | 'failed' | 'blocked' | 'skipped';
  startedAt: string;
  finishedAt: string;
  evidence: string[];
  actual?: unknown;
  expected?: unknown;
  errorCode?: string | null;
}

export interface ProofFailureRepair {
  failureAssertionId: string;
  failedAt: string;
  repairEventIds?: string[];
  repairSummary: string;
  reverifiedAssertionId: string;
}

export interface ProofExport {
  type: 'workspace' | 'agent-skill' | 'codex' | 'claude-code' | 'proof' | 'artifact';
  fileName: string;
  sizeBytes: number;
  sha256: string;
}

export interface ProofProvider {
  kind: 'manual' | 'webmcp-host' | 'codex-cli' | 'claude-cli' | 'local-model' | 'runner';
  version?: string;
  status: 'not-used' | 'completed' | 'failed' | 'cancelled' | 'blocked';
  /** Provider completion is never treated as verification. */
  verifiedSeparately: true;
  exitCode?: number | null;
}

export interface ProofReceipt {
  schemaVersion: '1.0.0';
  receiptId: string;
  workspaceId: string;
  missionId: string;
  runId?: string | null;
  skillGraphId: string;
  skillGraphVersion: string;
  skillGraphRevision?: number;
  status: 'verified' | 'failed' | 'blocked' | 'cancelled';
  canonicalization: {
    algorithm: 'JCS-RFC8785';
    hashAlgorithm: 'SHA-256';
    exclusions: string[];
  };
  sources?: ProofSource[];
  events: ProofReceiptEvent[];
  approvals: ProofApproval[];
  artifacts: ProofArtifact[];
  assertions: ProofAssertion[];
  failuresAndRepairs: ProofFailureRepair[];
  exports: ProofExport[];
  provider?: ProofProvider;
  receiptHash: string;
  createdAt: string;
  truncation?: { truncated: boolean; omittedCount: number };
}

export const RECEIPT_HASH_EXCLUSIONS = ['receiptHash'] as const;
