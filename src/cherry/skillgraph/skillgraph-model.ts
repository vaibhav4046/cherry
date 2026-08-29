import type { TrustLevel } from '../evidence/evidence-model.ts';

export type NodeKind =
  | 'research'
  | 'decision'
  | 'design'
  | 'build'
  | 'action'
  | 'approval'
  | 'verification'
  | 'export';

export type EdgeType = 'dependency' | 'success' | 'failure' | 'approval' | 'data';

export type SkillGraphStatus = 'draft' | 'proposed' | 'ready_for_review' | 'approved' | 'rejected' | 'deprecated';

export type MemoryScope = 'global' | 'workspace' | 'project' | 'mission' | 'run';
export type MemorySensitivity = 'public' | 'private' | 'sensitive';
export type MemoryType = 'identity' | 'preference' | 'project' | 'procedure' | 'correction' | 'policy' | 'episode';

export interface JsonSchemaObject {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

export interface SkillTrigger {
  id: string;
  type: 'manual' | 'schedule' | 'event' | 'host-invocation';
  description: string;
  config?: Record<string, unknown>;
}

export interface SkillNodeFailure {
  strategy: 'stop' | 'retry' | 'return-to-node' | 'request-approval';
  maxAttempts?: number;
  targetNodeId?: string | null;
}

export interface MemorySelector {
  types: MemoryType[];
  scopes: MemoryScope[];
  tags?: string[];
}

export interface SkillNode {
  id: string;
  kind: NodeKind;
  title: string;
  goal: string;
  instructions?: string[];
  requires: string[];
  produces: string[];
  allowedToolIds: string[];
  evidenceIds: string[];
  memorySelectors: MemorySelector[];
  assertionIds: string[];
  humanGateIds: string[];
  timeoutMs?: number;
  onFailure: SkillNodeFailure;
  position: { x: number; y: number };
}

export interface SkillEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  label?: string;
}

export interface ToolRequirement {
  id: string;
  name: string;
  description: string;
  access: 'read' | 'write' | 'consequential';
  inputSchema: JsonSchemaObject;
  outputSchema?: JsonSchemaObject;
  provider?: 'cherry' | 'webmcp' | 'mcp' | 'host' | 'runner';
}

export interface EvidenceReference {
  evidenceId: string;
  use: string;
  trust: TrustLevel;
  timestampSeconds?: number;
}

export interface MemoryPolicy {
  allowedScopes: MemoryScope[];
  allowedSensitivity: MemorySensitivity[];
  /** Cherry never promotes memory silently. */
  requireApproval: true;
  selectors: MemorySelector[];
}

export interface PolicyRule {
  id: string;
  title: string;
  effect: 'allow' | 'deny' | 'require-approval' | 'require-verification';
  condition: string;
  scope: 'global' | 'workspace' | 'project' | 'mission' | 'run' | 'node';
  sourceEvidenceIds?: string[];
}

export interface HumanGate {
  id: string;
  title: string;
  reason: string;
  requiredRevisionType: 'mission' | 'skillgraph' | 'artifact-set' | 'memory' | 'runner-job';
  action: 'approve' | 'publish' | 'execute' | 'export' | 'delete' | 'share';
  expiresAfterSeconds?: number;
}

export type EvaluationType =
  | 'schema'
  | 'graph'
  | 'file'
  | 'dom'
  | 'runtime'
  | 'accessibility'
  | 'policy'
  | 'hash'
  | 'command'
  | 'manual';

export type EvaluationSeverity = 'blocking' | 'error' | 'warning' | 'info';

export interface Evaluation {
  id: string;
  name: string;
  type: EvaluationType;
  severity: EvaluationSeverity;
  config: Record<string, unknown>;
  sourceEvidenceIds?: string[];
}

export type CompileTarget = 'agent-skills' | 'codex' | 'claude-code' | 'webmcp' | 'prompt-pack';

export interface SkillGraph {
  schemaVersion: '1.0.0';
  id: string;
  workspaceId: string;
  missionId?: string | null;
  name: string;
  slug?: string;
  purpose: string;
  version: string;
  revision: number;
  status: SkillGraphStatus;
  triggers?: SkillTrigger[];
  inputSchema: JsonSchemaObject;
  outputSchema?: JsonSchemaObject;
  nodes: SkillNode[];
  edges: SkillEdge[];
  tools: ToolRequirement[];
  knowledge?: EvidenceReference[];
  memoryPolicy: MemoryPolicy;
  guardrails: PolicyRule[];
  humanGates: HumanGate[];
  evaluations: Evaluation[];
  targets: CompileTarget[];
  approvedRevision?: number | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Content hash of the canonical graph at this revision. */
  versionHash?: string;
}

export interface SkillGraphVersion {
  id: string;
  workspaceId: string;
  skillGraphId: string;
  revision: number;
  version: string;
  status: SkillGraphStatus;
  snapshot: SkillGraph;
  versionHash: string;
  changeSummary: string;
  createdAt: string;
  actorType: 'human' | 'agent' | 'system';
}
