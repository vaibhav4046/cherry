import { getDb } from './cherry-db.ts';
import { appendProofEvents, withWorkspaceTx } from './transactions.ts';
import { newId, isValidId, type IdPrefix } from '../core/ids.ts';
import { isoNow } from '../core/clock.ts';
import { sha256Canonical, sha256CanonicalExcluding, sha256Text } from '../core/hash.ts';
import { ok, type Result } from '../core/result.ts';
import { invalid, notFound } from '../core/errors.ts';
import { PROOF_EVENT_TYPES, type NewProofEvent } from '../core/domain-event.ts';
import { parseYouTubeChannelId } from '../source/youtube-channel-id.ts';
import { isPublicNetworkHost } from '../source/public-network-host.ts';
import { parseYouTubeUrl } from '../watch/youtube-url.ts';
import { validateSkillGraph } from '../skillgraph/skillgraph-validator.ts';
import type { SkillGraph } from '../skillgraph/skillgraph-model.ts';
import { RECEIPT_HASH_EXCLUSIONS, type ProofReceipt } from '../proof/proof-model.ts';
import type { MemoryRecord, MemoryVersion } from '../memory/memory-model.ts';
import type { ApprovalRecord } from '../approval/approval-model.ts';
import { SYNTHETIC_SAMPLE_APPROVER } from '../skillgraph/sample-state.ts';
import { validateArtifactPath } from '../artifacts/artifact-path.ts';
import {
  MAX_ARTIFACT_FILE_BYTES,
  MAX_ARTIFACT_FILES,
  MAX_ARTIFACT_SET_BYTES,
} from '../artifacts/artifact-model.ts';
import {
  CHANNEL_WATCH_PROCESSED_JOB_ID_LIMIT,
  CHANNEL_WATCH_SEEN_VIDEO_ID_LIMIT,
} from '../source/channel-watch-model.ts';

export const WORKSPACE_EXPORT_VERSION = '1.0.0';

export interface WorkspaceExport {
  schemaVersion: typeof WORKSPACE_EXPORT_VERSION;
  exportId: string;
  exportedAt: string;
  workspace: Record<string, unknown>;
  missions: unknown[];
  missionTasks: unknown[];
  lessons: unknown[];
  transcriptSegments: unknown[];
  observations: unknown[];
  evidence: unknown[];
  skillGraphs: unknown[];
  skillVersions: unknown[];
  memories: unknown[];
  memoryVersions: unknown[];
  approvals: unknown[];
  artifactSets: unknown[];
  artifactFiles: unknown[];
  artifactVersions: unknown[];
  verifications: unknown[];
  runs: unknown[];
  proofEvents: unknown[];
  proofReceipts: unknown[];
  settings: Record<string, unknown>;
  sourceRecords?: unknown[];
  channelWatches?: unknown[];
  integrity: {
    canonicalization: 'JCS-RFC8785';
    hashAlgorithm: 'SHA-256';
    payloadSha256: string;
  };
}

const INTEGRITY_EXCLUSIONS = ['integrity'];

/** Serialize one workspace, with a recomputable payload hash. */
export async function exportWorkspace(workspaceId: string): Promise<Result<WorkspaceExport>> {
  const db = getDb();
  const workspace = await db.workspaces.get(workspaceId);
  if (!workspace) return notFound('Workspace', workspaceId);

  const byWorkspace = <T>(rows: T[]): T[] => rows;
  const load = async (table: { where: (index: string) => { equals: (value: string) => { toArray: () => Promise<unknown[]> } } }) =>
    byWorkspace(await table.where('workspaceId').equals(workspaceId).toArray());

  const data: WorkspaceExport = {
    schemaVersion: WORKSPACE_EXPORT_VERSION,
    exportId: newId('ws'),
    exportedAt: isoNow(),
    workspace: workspace as unknown as Record<string, unknown>,
    missions: await load(db.missions),
    missionTasks: await load(db.missionTasks),
    lessons: await load(db.lessons),
    transcriptSegments: await load(db.transcriptSegments),
    observations: await load(db.observations),
    evidence: await load(db.evidence),
    skillGraphs: await load(db.skillGraphs),
    skillVersions: await load(db.skillVersions),
    memories: await load(db.memories),
    memoryVersions: await load(db.memoryVersions),
    approvals: await load(db.approvals),
    artifactSets: await load(db.artifactSets),
    artifactFiles: await load(db.artifactFiles),
    artifactVersions: await load(db.artifactVersions),
    verifications: await load(db.verifications),
    runs: await load(db.runs),
    proofEvents: await load(db.proofEvents),
    proofReceipts: await load(db.receipts),
    settings: {},
    sourceRecords: await load(db.sourceRecords),
    channelWatches: await load(db.channelWatches),
    integrity: {
      canonicalization: 'JCS-RFC8785',
      hashAlgorithm: 'SHA-256',
      payloadSha256: '',
    },
  };

  data.integrity.payloadSha256 = await sha256CanonicalExcluding(
    data as unknown as Record<string, unknown>,
    INTEGRITY_EXCLUSIONS,
  );

  const portableShape = validateArchiveShape(data);
  if (!portableShape.ok) {
    return invalid(`This space cannot be exported yet: ${portableShape.error.message}`);
  }
  const portableReferences = validateArchiveReferences(data);
  if (!portableReferences.ok) {
    return invalid(`This space cannot be exported yet: ${portableReferences.error.message}`);
  }
  const portableIntegrity = await validateArchiveDerivedIntegrity(data);
  if (!portableIntegrity.ok) {
    return invalid(`This space cannot be exported yet: ${portableIntegrity.error.message}`);
  }
  if (new TextEncoder().encode(JSON.stringify(data)).byteLength > MAX_WORKSPACE_IMPORT_FILE_BYTES) {
    return invalid('This space is larger than the 64 MiB portable export limit. Remove large files or export them separately.');
  }

  await appendProofEvents(workspaceId, [
    {
      type: 'export.created',
      actorType: 'system',
      objectType: 'workspace',
      objectId: workspaceId,
      summary: `Workspace exported (${data.missions.length} missions, hash ${data.integrity.payloadSha256.slice(0, 12)}…)`,
    },
  ]);

  return ok(data);
}

export const MAX_WORKSPACE_IMPORT_FILE_BYTES = 64 * 1024 * 1024;
export const WORKSPACE_ARCHIVE_FILE_ACCEPT = '.json';

type ReadableWorkspaceArchiveFile = Pick<File, 'name' | 'size' | 'arrayBuffer'>;

type WorkspaceArchiveFileRead =
  | { ok: true; value: string }
  | { ok: false; error: string };

/** Reject unsupported or oversized exports before allocating their contents. */
export async function readWorkspaceArchiveFile(file: ReadableWorkspaceArchiveFile): Promise<WorkspaceArchiveFileRead> {
  if (!file.name.toLowerCase().endsWith('.json')) return { ok: false, error: 'Choose a Cherry .json export.' };
  if (file.size === 0) return { ok: false, error: 'That Cherry export is empty. Choose another file.' };
  if (file.size > MAX_WORKSPACE_IMPORT_FILE_BYTES) {
    return { ok: false, error: 'That file is larger than 64 MiB. Choose a smaller Cherry export.' };
  }
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return { ok: false, error: 'That Cherry export could not be read. Choose it again.' };
  }
  try {
    return { ok: true, value: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, error: 'That Cherry export is not valid UTF-8 JSON. Export it again and retry.' };
  }
}
const ARRAY_LIMITS: Array<[keyof WorkspaceExport, number]> = [
  ['missions', 1000],
  ['missionTasks', 10000],
  ['lessons', 1000],
  ['transcriptSegments', 200000],
  ['observations', 100000],
  ['evidence', 100000],
  ['skillGraphs', 1000],
  ['skillVersions', 10000],
  ['memories', 100000],
  ['memoryVersions', 100000],
  ['approvals', 100000],
  ['artifactSets', 1000],
  ['artifactFiles', 20000],
  ['artifactVersions', 100000],
  ['verifications', 10000],
  ['runs', 10000],
  ['proofEvents', 200000],
  ['proofReceipts', 10000],
  ['sourceRecords', 10000],
  ['channelWatches', 10000],
];

type ArchiveRow = Record<string, unknown>;

function isRecord(value: unknown): value is ArchiveRow {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function hasString(value: ArchiveRow, key: string): boolean {
  return typeof value[key] === 'string' && (value[key] as string).length > 0;
}

function hasPositiveRevision(value: ArchiveRow): boolean {
  return Number.isInteger(value['revision']) && Number(value['revision']) >= 1;
}

function requireArrayFields(value: ArchiveRow, fields: readonly string[]): boolean {
  return fields.every((field) => Array.isArray(value[field]));
}

function isStringArray(value: unknown, max = 10000): value is string[] {
  return Array.isArray(value) && value.length <= max && value.every((entry) => typeof entry === 'string');
}

function isOneOf(value: unknown, choices: readonly string[]): value is string {
  return typeof value === 'string' && choices.includes(value);
}

function isFiniteNumber(value: unknown, minimum?: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && (minimum === undefined || value >= minimum);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function isPrivateSourceHost(hostname: string): boolean {
  return !isPublicNetworkHost(hostname);
}

function validSourceNetworkShape(row: ArchiveRow): boolean {
  const kind = row['kind'];
  const rawUrl = row['url'];
  const channelId = row['youtubeChannelId'];
  if (channelId !== undefined && channelId !== null) {
    if (kind !== 'youtube' || typeof channelId !== 'string' || !parseYouTubeChannelId(channelId).ok) return false;
  }
  if (rawUrl === null) return kind !== 'youtube';
  if (typeof rawUrl !== 'string' || rawUrl.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || isPrivateSourceHost(url.hostname)) return false;
  if (kind === 'youtube') return parseYouTubeUrl(rawUrl).ok;
  return true;
}

function isOptionalNullableId(value: unknown): boolean {
  return value === undefined || value === null || isValidId(value);
}

function isOptionalNullableIso(value: unknown): boolean {
  return value === undefined || value === null || isIsoDate(value);
}

function validStringRecord(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every((entry) => (
    entry === null
    || typeof entry === 'string'
    || typeof entry === 'number' && Number.isFinite(entry)
    || typeof entry === 'boolean'
    || Array.isArray(entry)
    || isRecord(entry)
  ));
}

function validJsonSchemaObject(value: unknown): boolean {
  return isRecord(value)
    && (value['type'] === undefined || typeof value['type'] === 'string')
    && (value['properties'] === undefined || isRecord(value['properties']))
    && (value['required'] === undefined || isStringArray(value['required'], 1000))
    && (value['additionalProperties'] === undefined || typeof value['additionalProperties'] === 'boolean');
}

function validMemorySelector(value: unknown): boolean {
  return isRecord(value)
    && isStringArray(value['types'], 16)
    && (value['types'] as string[]).every((entry) => isOneOf(entry, ['identity', 'preference', 'project', 'procedure', 'correction', 'policy', 'episode']))
    && isStringArray(value['scopes'], 16)
    && (value['scopes'] as string[]).every((entry) => isOneOf(entry, ['global', 'workspace', 'project', 'mission', 'run']))
    && (value['tags'] === undefined || isStringArray(value['tags'], 100));
}

function validSkillGraphShape(value: unknown): value is ArchiveRow {
  if (!isRecord(value)) return false;
  if (
    value['schemaVersion'] !== '1.0.0'
    || !isValidId(value['id'])
    || !isValidId(value['workspaceId'])
    || !hasString(value, 'name')
    || !hasString(value, 'purpose')
    || !hasString(value, 'version')
    || !hasPositiveRevision(value)
    || !isOneOf(value['status'], ['draft', 'proposed', 'ready_for_review', 'approved', 'rejected', 'deprecated'])
    || !validJsonSchemaObject(value['inputSchema'])
    || !isRecord(value['memoryPolicy'])
    || !requireArrayFields(value, ['nodes', 'edges', 'tools', 'guardrails', 'humanGates', 'evaluations', 'targets'])
  ) return false;

  const memoryPolicy = value['memoryPolicy'];
  if (
    memoryPolicy['requireApproval'] !== true
    || !isStringArray(memoryPolicy['allowedScopes'], 16)
    || !(memoryPolicy['allowedScopes'] as string[]).every((entry) => isOneOf(entry, ['global', 'workspace', 'project', 'mission', 'run']))
    || !isStringArray(memoryPolicy['allowedSensitivity'], 8)
    || !(memoryPolicy['allowedSensitivity'] as string[]).every((entry) => isOneOf(entry, ['public', 'private', 'sensitive']))
    || !Array.isArray(memoryPolicy['selectors'])
    || !(memoryPolicy['selectors'] as unknown[]).every(validMemorySelector)
  ) return false;
  if (value['outputSchema'] !== undefined && !validJsonSchemaObject(value['outputSchema'])) return false;
  if (value['knowledge'] !== undefined && !Array.isArray(value['knowledge'])) return false;
  if (value['triggers'] !== undefined && !Array.isArray(value['triggers'])) return false;
  if (value['missionId'] !== undefined && value['missionId'] !== null && !isValidId(value['missionId'])) return false;
  if (value['slug'] !== undefined && typeof value['slug'] !== 'string') return false;
  if (!isIsoDate(value['createdAt']) || !isIsoDate(value['updatedAt'])) return false;
  if (value['approvedRevision'] !== undefined && value['approvedRevision'] !== null && (!Number.isInteger(value['approvedRevision']) || Number(value['approvedRevision']) < 1)) return false;
  if (value['approvedBy'] !== undefined && value['approvedBy'] !== null && typeof value['approvedBy'] !== 'string') return false;
  if (value['approvedAt'] !== undefined && value['approvedAt'] !== null && !isIsoDate(value['approvedAt'])) return false;
  if (value['versionHash'] !== undefined && (typeof value['versionHash'] !== 'string' || !/^[a-f0-9]{64}$/.test(value['versionHash']))) return false;

  for (const trigger of (value['triggers'] as unknown[] | undefined) ?? []) {
    if (
      !isRecord(trigger)
      || !isValidId(trigger['id'])
      || !isOneOf(trigger['type'], ['manual', 'schedule', 'event', 'host-invocation'])
      || !hasString(trigger, 'description')
      || (trigger['config'] !== undefined && !isRecord(trigger['config']))
    ) return false;
  }

  for (const node of value['nodes'] as unknown[]) {
    if (
      !isRecord(node)
      || !isValidId(node['id'])
      || !isOneOf(node['kind'], ['research', 'decision', 'design', 'build', 'action', 'approval', 'verification', 'export'])
      || !hasString(node, 'title')
      || !hasString(node, 'goal')
      || (node['instructions'] !== undefined && !isStringArray(node['instructions'], 1000))
      || !isStringArray(node['requires'], 1000)
      || !isStringArray(node['produces'], 1000)
      || !isStringArray(node['allowedToolIds'], 1000)
      || !isStringArray(node['evidenceIds'], 10000)
      || !Array.isArray(node['memorySelectors'])
      || !(node['memorySelectors'] as unknown[]).every(validMemorySelector)
      || !isStringArray(node['assertionIds'], 1000)
      || !isStringArray(node['humanGateIds'], 1000)
      || !isRecord(node['onFailure'])
      || !isRecord(node['position'])
    ) return false;
    const failure = node['onFailure'];
    const position = node['position'];
    if (
      !isOneOf(failure['strategy'], ['stop', 'retry', 'return-to-node', 'request-approval'])
      || (failure['maxAttempts'] !== undefined && (!Number.isInteger(failure['maxAttempts']) || Number(failure['maxAttempts']) < 1))
      || (failure['targetNodeId'] !== undefined && failure['targetNodeId'] !== null && !isValidId(failure['targetNodeId']))
      || typeof position['x'] !== 'number'
      || !Number.isFinite(position['x'])
      || typeof position['y'] !== 'number'
      || !Number.isFinite(position['y'])
      || (node['timeoutMs'] !== undefined && (!Number.isInteger(node['timeoutMs']) || Number(node['timeoutMs']) < 1))
    ) return false;
  }
  for (const edge of value['edges'] as unknown[]) {
    if (
      !isRecord(edge)
      || !isValidId(edge['id'])
      || !hasString(edge, 'source')
      || !hasString(edge, 'target')
      || !isOneOf(edge['type'], ['dependency', 'success', 'failure', 'approval', 'data'])
      || (edge['label'] !== undefined && typeof edge['label'] !== 'string')
    ) return false;
  }
  for (const tool of value['tools'] as unknown[]) {
    if (
      !isRecord(tool)
      || !isValidId(tool['id'])
      || !hasString(tool, 'name')
      || !hasString(tool, 'description')
      || !isOneOf(tool['access'], ['read', 'write', 'consequential'])
      || !validJsonSchemaObject(tool['inputSchema'])
      || (tool['outputSchema'] !== undefined && !validJsonSchemaObject(tool['outputSchema']))
      || (tool['provider'] !== undefined && !isOneOf(tool['provider'], ['cherry', 'webmcp', 'mcp', 'host', 'runner']))
    ) return false;
  }
  for (const guardrail of value['guardrails'] as unknown[]) {
    if (
      !isRecord(guardrail)
      || !isValidId(guardrail['id'])
      || !hasString(guardrail, 'title')
      || !isOneOf(guardrail['effect'], ['allow', 'deny', 'require-approval', 'require-verification'])
      || typeof guardrail['condition'] !== 'string'
      || !isOneOf(guardrail['scope'], ['global', 'workspace', 'project', 'mission', 'run', 'node'])
      || (guardrail['sourceEvidenceIds'] !== undefined && !isStringArray(guardrail['sourceEvidenceIds'], 10000))
    ) return false;
  }
  for (const gate of value['humanGates'] as unknown[]) {
    if (
      !isRecord(gate)
      || !isValidId(gate['id'])
      || !hasString(gate, 'title')
      || !hasString(gate, 'reason')
      || !isOneOf(gate['requiredRevisionType'], ['mission', 'skillgraph', 'artifact-set', 'memory', 'runner-job'])
      || !isOneOf(gate['action'], ['approve', 'publish', 'execute', 'export', 'delete', 'share'])
      || (gate['expiresAfterSeconds'] !== undefined && (!Number.isInteger(gate['expiresAfterSeconds']) || Number(gate['expiresAfterSeconds']) < 1))
    ) return false;
  }
  for (const evaluation of value['evaluations'] as unknown[]) {
    if (
      !isRecord(evaluation)
      || !isValidId(evaluation['id'])
      || !hasString(evaluation, 'name')
      || !isOneOf(evaluation['type'], ['schema', 'graph', 'file', 'dom', 'runtime', 'accessibility', 'policy', 'hash', 'command', 'manual'])
      || !isOneOf(evaluation['severity'], ['blocking', 'error', 'warning', 'info'])
      || !isRecord(evaluation['config'])
      || (evaluation['sourceEvidenceIds'] !== undefined && !isStringArray(evaluation['sourceEvidenceIds'], 10000))
    ) return false;
  }
  if (!(value['targets'] as unknown[]).every((target) => isOneOf(target, ['agent-skills', 'codex', 'claude-code', 'webmcp', 'prompt-pack']))) return false;
  if (value['knowledge'] !== undefined && !(value['knowledge'] as unknown[]).every((entry) => (
    isRecord(entry)
    && isValidId(entry['evidenceId'])
    && hasString(entry, 'use')
    && isOneOf(entry['trust'], ['untrusted', 'reviewed', 'approved'])
    && (entry['timestampSeconds'] === undefined || typeof entry['timestampSeconds'] === 'number' && Number.isFinite(entry['timestampSeconds']) && entry['timestampSeconds'] >= 0)
  ))) return false;
  const structuralIssues = validateSkillGraph(value as unknown as SkillGraph)
    .filter((issue) => issue.code.endsWith('_missing') || issue.code === 'dependency_cycle');
  return structuralIssues.length === 0;
}

function validMissionShape(row: ArchiveRow): boolean {
  const states = ['DRAFT', 'LEARNING', 'PLANNING', 'AWAITING_APPROVAL', 'EXECUTING', 'VERIFYING', 'COMPLETE', 'BLOCKED', 'CANCELLED'];
  return hasString(row, 'title')
    && hasString(row, 'objective')
    && typeof row['agentRole'] === 'string'
    && isStringArray(row['definitionOfDone'], 1000)
    && isStringArray(row['constraints'], 1000)
    && isStringArray(row['nonGoals'], 1000)
    && isStringArray(row['allowedToolIds'], 1000)
    && isStringArray(row['requiredMemoryIds'], 10000)
    && isOneOf(row['riskLevel'], ['low', 'medium', 'high'])
    && isOneOf(row['state'], states)
    && Array.isArray(row['stateHistory'])
    && (row['stateHistory'] as unknown[]).every((entry) => isRecord(entry)
      && (entry['from'] === null || isOneOf(entry['from'], states))
      && isOneOf(entry['to'], states)
      && isIsoDate(entry['at'])
      && isOneOf(entry['actorType'], ['human', 'agent', 'system', 'runner'])
      && (entry['reason'] === undefined || typeof entry['reason'] === 'string'))
    && isOptionalNullableId(row['lessonId'])
    && isOptionalNullableId(row['skillGraphId'])
    && isOptionalNullableId(row['artifactSetId']);
}

function validLessonShape(row: ArchiveRow): boolean {
  const transcriptSources = ['user_text', 'user_upload', 'creator_authorized_captions', 'local_transcription', 'runner_fetch', 'unknown'];
  return hasString(row, 'title')
    && isOneOf(row['kind'], ['youtube', 'manual'])
    && (row['kind'] !== 'youtube' || typeof row['videoId'] === 'string' && /^[A-Za-z0-9_-]{11}$/.test(row['videoId']))
    && isFiniteNumber(row['lastPositionSeconds'], 0)
    && isOptionalNullableId(row['missionId'])
    && (row['videoId'] === undefined || isNullableString(row['videoId']))
    && (row['canonicalUrl'] === undefined || isNullableString(row['canonicalUrl']))
    && (row['creator'] === undefined || isNullableString(row['creator']))
    && (row['durationSeconds'] === undefined || row['durationSeconds'] === null || isFiniteNumber(row['durationSeconds'], 0))
    && isOptionalNullableIso(row['permissionAcknowledgedAt'])
    && (row['permissionNote'] === undefined || typeof row['permissionNote'] === 'string')
    && (row['transcriptSource'] === undefined || row['transcriptSource'] === null || isOneOf(row['transcriptSource'], transcriptSources))
    && isOptionalNullableIso(row['transcriptImportedAt'])
    && Array.isArray(row['coverageCriteria'])
    && (row['coverageCriteria'] as unknown[]).every((criterion) => isRecord(criterion)
      && isValidId(criterion['id'])
      && hasString(criterion, 'label')
      && isFiniteNumber(criterion['startSeconds'], 0)
      && isFiniteNumber(criterion['endSeconds'], 0)
      && Number(criterion['endSeconds']) >= Number(criterion['startSeconds'])
      && isStringArray(criterion['satisfiedByObservationIds'], 10000));
}

function validEvidenceShape(row: ArchiveRow): boolean {
  return isOptionalNullableId(row['missionId'])
    && isOptionalNullableId(row['lessonId'])
    && isOneOf(row['sourceType'], ['video', 'transcript', 'document', 'repository', 'webpage', 'observation', 'tool_output', 'user_statement', 'run_result'])
    && (row['sourceUri'] === undefined || isNullableString(row['sourceUri']))
    && (row['sourceTitle'] === undefined || isNullableString(row['sourceTitle']))
    && (row['sourceCreator'] === undefined || isNullableString(row['sourceCreator']))
    && (row['timestampSeconds'] === undefined || row['timestampSeconds'] === null || isFiniteNumber(row['timestampSeconds'], 0))
    && hasString(row, 'claim')
    && (row['detail'] === undefined || typeof row['detail'] === 'string')
    && isOneOf(row['provenanceMethod'], ['user_typed', 'user_upload', 'creator_authorized_captions', 'local_transcription', 'agent_observation', 'tool_result', 'unknown'])
    && isOneOf(row['trust'], ['untrusted', 'reviewed', 'approved'])
    && isFiniteNumber(row['confidence'], 0)
    && Number(row['confidence']) <= 1
    && isOneOf(row['transferability'], ['transferable', 'source_specific', 'unknown'])
    && isStringArray(row['usedByNodeIds'], 10000)
    && (row['contentHash'] === undefined || typeof row['contentHash'] === 'string' && /^[a-f0-9]{64}$/.test(row['contentHash']))
    && Array.isArray(row['history'])
    && (row['history'] as unknown[]).every((entry) => isRecord(entry)
      && isIsoDate(entry['at'])
      && isOneOf(entry['action'], ['created', 'updated', 'trust_changed', 'deleted'])
      && isOneOf(entry['actorType'], ['human', 'agent', 'system', 'runner'])
      && typeof entry['summary'] === 'string');
}

function validMemoryShape(value: unknown): value is ArchiveRow {
  if (!isRecord(value)) return false;
  return value['schemaVersion'] === '1.0.0'
    && isValidId(value['id'])
    && isValidId(value['workspaceId'])
    && isOptionalNullableId(value['missionId'])
    && isOptionalNullableId(value['runId'])
    && (value['projectId'] === undefined || isNullableString(value['projectId']))
    && isOneOf(value['type'], ['identity', 'preference', 'project', 'procedure', 'correction', 'policy', 'episode'])
    && hasString(value, 'title')
    && hasString(value, 'content')
    && isOneOf(value['status'], ['proposed', 'approved', 'rejected', 'superseded', 'expired', 'deleted'])
    && isOneOf(value['scope'], ['global', 'workspace', 'project', 'mission', 'run'])
    && isOneOf(value['sensitivity'], ['public', 'private', 'sensitive'])
    && isFiniteNumber(value['confidence'], 0)
    && Number(value['confidence']) <= 1
    && (value['tags'] === undefined || isStringArray(value['tags'], 1000))
    && Array.isArray(value['provenance'])
    && (value['provenance'] as unknown[]).every((entry) => isRecord(entry)
      && isValidId(entry['id'])
      && isOneOf(entry['sourceType'], ['human', 'video-transcript', 'video-visual', 'webpage', 'repository', 'document', 'tool-result', 'run', 'correction', 'import'])
      && (entry['sourceId'] === undefined || isNullableString(entry['sourceId']))
      && (entry['uri'] === undefined || isNullableString(entry['uri']))
      && (entry['timestampSeconds'] === undefined || isFiniteNumber(entry['timestampSeconds'], 0))
      && isOneOf(entry['trust'], ['untrusted', 'reviewed', 'approved'])
      && isIsoDate(entry['capturedAt'])
      && typeof entry['description'] === 'string'
      && (entry['contentHash'] === undefined || typeof entry['contentHash'] === 'string' && /^[a-f0-9]{64}$/.test(entry['contentHash'])))
    && (value['derivedFromMemoryIds'] === undefined || isStringArray(value['derivedFromMemoryIds'], 10000))
    && isOptionalNullableId(value['supersedesId'])
    && isOptionalNullableId(value['supersededById'])
    && hasPositiveRevision(value)
    && (value['approvedRevision'] === undefined || value['approvedRevision'] === null || Number.isInteger(value['approvedRevision']) && Number(value['approvedRevision']) >= 1)
    && (value['approvedBy'] === undefined || isNullableString(value['approvedBy']))
    && isOptionalNullableIso(value['approvedAt'])
    && isOptionalNullableIso(value['expiresAt'])
    && isOptionalNullableIso(value['reviewAt'])
    && isOptionalNullableIso(value['lastUsedAt'])
    && (value['useCount'] === undefined || isNonNegativeInteger(value['useCount']))
    && isIsoDate(value['createdAt'])
    && isIsoDate(value['updatedAt'])
    && (value['pinned'] === undefined || typeof value['pinned'] === 'boolean');
}

function validProofReceiptShape(row: ArchiveRow): boolean {
  const canonicalization = row['canonicalization'];
  if (
    row['schemaVersion'] !== '1.0.0'
    || !isValidId(row['receiptId'])
    || !isValidId(row['missionId'])
    || !isValidId(row['skillGraphId'])
    || !isOptionalNullableId(row['runId'])
    || !hasString(row, 'skillGraphVersion')
    || (row['skillGraphRevision'] !== undefined && (!Number.isInteger(row['skillGraphRevision']) || Number(row['skillGraphRevision']) < 1))
    || !isOneOf(row['status'], ['verified', 'failed', 'blocked', 'cancelled'])
    || !isRecord(canonicalization)
    || canonicalization['algorithm'] !== 'JCS-RFC8785'
    || canonicalization['hashAlgorithm'] !== 'SHA-256'
    || !Array.isArray(canonicalization['exclusions'])
    || (canonicalization['exclusions'] as unknown[]).length !== 1
    || canonicalization['exclusions'][0] !== 'receiptHash'
    || typeof row['receiptHash'] !== 'string'
    || !/^[a-f0-9]{64}$/.test(row['receiptHash'])
    || !isIsoDate(row['createdAt'])
  ) return false;

  const events = row['events'];
  const approvals = row['approvals'];
  const artifacts = row['artifacts'];
  const assertions = row['assertions'];
  const repairs = row['failuresAndRepairs'];
  const exports = row['exports'];
  if (![events, approvals, artifacts, assertions, repairs, exports].every(Array.isArray)) return false;
  if (!(events as unknown[]).every((entry) => isRecord(entry)
    && isValidId(entry['id'])
    && Number.isInteger(entry['sequence'])
    && Number(entry['sequence']) >= 1
    && typeof entry['type'] === 'string'
    && isOneOf(entry['actorType'], ['human', 'agent', 'system', 'runner', 'provider'])
    && (entry['actorId'] === undefined || isNullableString(entry['actorId']))
    && isIsoDate(entry['occurredAt'])
    && typeof entry['objectType'] === 'string'
    && typeof entry['objectId'] === 'string'
    && typeof entry['summary'] === 'string'
    && (entry['payloadHash'] === undefined || entry['payloadHash'] === null || typeof entry['payloadHash'] === 'string' && /^[a-f0-9]{64}$/.test(entry['payloadHash'])))) return false;
  if (!(approvals as unknown[]).every((entry) => isRecord(entry)
    && isValidId(entry['id'])
    && isOneOf(entry['objectType'], ['mission', 'skillgraph', 'artifact-set', 'memory', 'runner-job', 'routine', 'export'])
    && typeof entry['objectId'] === 'string'
    && Number.isInteger(entry['objectRevision'])
    && Number(entry['objectRevision']) >= 1
    && isOneOf(entry['decision'], ['approved', 'rejected'])
    && typeof entry['decidedBy'] === 'string'
    && isIsoDate(entry['decidedAt'])
    && (entry['comment'] === undefined || typeof entry['comment'] === 'string')
    && (entry['contentHash'] === undefined || typeof entry['contentHash'] === 'string' && /^[a-f0-9]{64}$/.test(entry['contentHash'])))) return false;
  if (!(artifacts as unknown[]).every((entry) => isRecord(entry)
    && typeof entry['path'] === 'string'
    && typeof entry['mediaType'] === 'string'
    && isNonNegativeInteger(entry['sizeBytes'])
    && typeof entry['sha256'] === 'string'
    && /^[a-f0-9]{64}$/.test(entry['sha256'])
    && (entry['artifactRevision'] === undefined || Number.isInteger(entry['artifactRevision']) && Number(entry['artifactRevision']) >= 1))) return false;
  if (!(assertions as unknown[]).every((entry) => isRecord(entry)
    && isValidId(entry['id'])
    && hasString(entry, 'name')
    && typeof entry['type'] === 'string'
    && typeof entry['severity'] === 'string'
    && isOneOf(entry['status'], ['passed', 'failed', 'blocked', 'skipped'])
    && isIsoDate(entry['startedAt'])
    && isIsoDate(entry['finishedAt'])
    && isStringArray(entry['evidence'], 10000)
    && (entry['errorCode'] === undefined || isNullableString(entry['errorCode'])))) return false;
  if (!(repairs as unknown[]).every((entry) => isRecord(entry)
    && isValidId(entry['failureAssertionId'])
    && isIsoDate(entry['failedAt'])
    && (entry['repairEventIds'] === undefined || isStringArray(entry['repairEventIds'], 10000))
    && typeof entry['repairSummary'] === 'string'
    && isValidId(entry['reverifiedAssertionId']))) return false;
  if (!(exports as unknown[]).every((entry) => isRecord(entry)
    && isOneOf(entry['type'], ['workspace', 'agent-skill', 'codex', 'claude-code', 'proof', 'artifact'])
    && typeof entry['fileName'] === 'string'
    && isNonNegativeInteger(entry['sizeBytes'])
    && typeof entry['sha256'] === 'string'
    && /^[a-f0-9]{64}$/.test(entry['sha256']))) return false;
  if (row['sources'] !== undefined && (!Array.isArray(row['sources']) || !(row['sources'] as unknown[]).every((entry) => isRecord(entry)
    && isValidId(entry['id'])
    && isOneOf(entry['type'], ['human', 'video', 'transcript', 'webpage', 'document', 'repository', 'tool-result', 'memory'])
    && (entry['uri'] === undefined || isNullableString(entry['uri']))
    && (entry['timestampSeconds'] === undefined || isFiniteNumber(entry['timestampSeconds'], 0))
    && isOneOf(entry['trust'], ['untrusted', 'reviewed', 'approved'])
    && typeof entry['description'] === 'string'
    && (entry['contentHash'] === undefined || isNullableString(entry['contentHash']))))) return false;
  if (row['provider'] !== undefined && (!isRecord(row['provider'])
    || !isOneOf(row['provider']['kind'], ['manual', 'webmcp-host', 'codex-cli', 'claude-cli', 'local-model', 'runner'])
    || !isOneOf(row['provider']['status'], ['not-used', 'completed', 'failed', 'cancelled', 'blocked'])
    || row['provider']['verifiedSeparately'] !== true
    || (row['provider']['version'] !== undefined && typeof row['provider']['version'] !== 'string')
    || (row['provider']['exitCode'] !== undefined && row['provider']['exitCode'] !== null && !Number.isInteger(row['provider']['exitCode'])))) return false;
  if (row['truncation'] !== undefined && (!isRecord(row['truncation'])
    || typeof row['truncation']['truncated'] !== 'boolean'
    || !isNonNegativeInteger(row['truncation']['omittedCount']))) return false;
  return true;
}

function validArchiveRow(key: keyof WorkspaceExport, row: ArchiveRow): boolean {
  switch (key) {
    case 'missions': return validMissionShape(row);
    case 'missionTasks': return isValidId(row['missionId'])
      && isNonNegativeInteger(row['order'])
      && hasString(row, 'title')
      && typeof row['detail'] === 'string'
      && isStringArray(row['dependsOn'], 10000)
      && isOneOf(row['status'], ['pending', 'in_progress', 'done', 'blocked'])
      && (row['resultSummary'] === undefined || typeof row['resultSummary'] === 'string');
    case 'lessons': return validLessonShape(row);
    case 'transcriptSegments': return isValidId(row['lessonId'])
      && isNonNegativeInteger(row['index'])
      && isFiniteNumber(row['startSeconds'], 0)
      && isFiniteNumber(row['endSeconds'], 0)
      && Number(row['endSeconds']) >= Number(row['startSeconds'])
      && typeof row['text'] === 'string'
      && isOneOf(row['source'], ['user_text', 'user_upload', 'creator_authorized_captions', 'local_transcription', 'runner_fetch', 'unknown']);
    case 'observations': return isValidId(row['lessonId'])
      && isFiniteNumber(row['timestampSeconds'], 0)
      && isOneOf(row['kind'], ['spoken', 'visual', 'inferred'])
      && typeof row['text'] === 'string'
      && isOneOf(row['transferability'], ['transferable', 'source_specific', 'unknown'])
      && isOneOf(row['uncertainty'], ['confident', 'uncertain', 'needs_review'])
      && isOptionalNullableId(row['evidenceId'])
      && isOneOf(row['actorType'], ['human', 'agent']);
    case 'evidence': return validEvidenceShape(row);
    case 'skillGraphs': return validSkillGraphShape(row);
    case 'skillVersions': return isValidId(row['skillGraphId'])
      && hasPositiveRevision(row)
      && hasString(row, 'version')
      && isOneOf(row['status'], ['draft', 'proposed', 'ready_for_review', 'approved', 'rejected', 'deprecated'])
      && validSkillGraphShape(row['snapshot'])
      && (row['snapshot'] as ArchiveRow)['id'] === row['skillGraphId']
      && (row['snapshot'] as ArchiveRow)['revision'] === row['revision']
      && typeof row['versionHash'] === 'string'
      && /^[a-f0-9]{64}$/.test(row['versionHash'])
      && typeof row['changeSummary'] === 'string'
      && isOneOf(row['actorType'], ['human', 'agent', 'system']);
    case 'memories': return validMemoryShape(row);
    case 'memoryVersions': return isValidId(row['memoryId'])
      && hasPositiveRevision(row)
      && validMemoryShape(row['snapshot'])
      && (row['snapshot'] as ArchiveRow)['id'] === row['memoryId']
      && (row['snapshot'] as ArchiveRow)['revision'] === row['revision']
      && typeof row['changeSummary'] === 'string';
    case 'approvals': return isOneOf(row['objectType'], ['skillgraph', 'memory', 'consequential_action', 'runner_job', 'routine'])
      && isValidId(row['objectId'])
      && hasPositiveRevision({ revision: row['objectRevision'] })
      && isOneOf(row['decision'], ['approved', 'rejected', 'pending'])
      && isIsoDate(row['requestedAt'])
      && typeof row['requestedBy'] === 'string'
      && typeof row['requestReason'] === 'string'
      && (row['decidedBy'] === undefined || typeof row['decidedBy'] === 'string')
      && (row['decidedAt'] === undefined || isIsoDate(row['decidedAt']))
      && (row['comment'] === undefined || typeof row['comment'] === 'string')
      && (row['contentHash'] === undefined || typeof row['contentHash'] === 'string' && /^[a-f0-9]{64}$/.test(row['contentHash']));
    case 'artifactSets': return isValidId(row['missionId'])
      && hasString(row, 'name')
      && hasString(row, 'entryPath');
    case 'artifactFiles': return isValidId(row['artifactSetId'])
      && hasString(row, 'path')
      && hasString(row, 'mediaType')
      && typeof row['content'] === 'string'
      && isNonNegativeInteger(row['sizeBytes'])
      && typeof row['sha256'] === 'string'
      && /^[a-f0-9]{64}$/.test(row['sha256'])
      && isOneOf(row['updatedBy'], ['human', 'agent', 'runner', 'system']);
    case 'artifactVersions': return isValidId(row['artifactFileId'])
      && isValidId(row['artifactSetId'])
      && hasString(row, 'path')
      && typeof row['content'] === 'string'
      && isNonNegativeInteger(row['sizeBytes'])
      && typeof row['sha256'] === 'string'
      && /^[a-f0-9]{64}$/.test(row['sha256'])
      && typeof row['changeSummary'] === 'string';
    case 'verifications': return isValidId(row['missionId'])
      && isOptionalNullableId(row['skillGraphId'])
      && (row['skillGraphRevision'] === undefined || row['skillGraphRevision'] === null || Number.isInteger(row['skillGraphRevision']) && Number(row['skillGraphRevision']) >= 1)
      && isOptionalNullableId(row['artifactSetId'])
      && isIsoDate(row['startedAt'])
      && isIsoDate(row['finishedAt'])
      && isOneOf(row['status'], ['passed', 'failed'])
      && isNonNegativeInteger(row['blockingFailures'])
      && isNonNegativeInteger(row['totalAssertions'])
      && isOptionalNullableId(row['repairedFromVerificationId'])
      && Array.isArray(row['results'])
      && (row['results'] as unknown[]).every((result) => isRecord(result)
        && isValidId(result['id'])
        && hasString(result, 'name')
        && isOneOf(result['type'], ['schema', 'graph', 'file', 'dom', 'runtime', 'accessibility', 'policy', 'hash', 'command', 'manual'])
        && isOneOf(result['severity'], ['blocking', 'error', 'warning', 'info'])
        && isOneOf(result['status'], ['passed', 'failed', 'blocked', 'skipped'])
        && isIsoDate(result['startedAt'])
        && isIsoDate(result['finishedAt'])
        && isStringArray(result['evidence'], 10000)
        && (result['errorCode'] === undefined || isNullableString(result['errorCode'])));
    case 'runs': return isValidId(row['missionId'])
      && isOneOf(row['adapter'], ['manual', 'cherry-verify', 'cherry-export', 'shell-safe', 'codex-cli', 'claude-cli'])
      && isOneOf(row['status'], ['queued', 'waiting_for_runner', 'setup-required', 'running', 'succeeded', 'failed', 'cancelled', 'reported'])
      && isOneOf(row['mode'], ['manual', 'webmcp', 'runner'])
      && typeof row['summary'] === 'string'
      && isOptionalNullableId(row['receiptId'])
      && isOptionalNullableId(row['verificationId'])
      && ['routineId', 'approvedActionHash', 'detail', 'requestedAt', 'startedAt', 'finishedAt', 'outputSummary', 'error', 'idempotencyKey', 'runnerCapabilityToken', 'runnerJobId'].every((field) => row[field] === undefined || isNullableString(row[field]))
      && (row['routineRevision'] === undefined || Number.isInteger(row['routineRevision']) && Number(row['routineRevision']) >= 1)
      && (row['command'] === undefined || typeof row['command'] === 'string' || isStringArray(row['command'], 1000))
      && (row['provider'] === undefined || isRecord(row['provider'])
        && typeof row['provider']['kind'] === 'string'
        && typeof row['provider']['status'] === 'string'
        && typeof row['provider']['verifiedSeparately'] === 'boolean'
        && (row['provider']['exitCode'] === undefined || Number.isInteger(row['provider']['exitCode'])));
    case 'proofEvents': return isNonNegativeInteger(row['sequence'])
      && Number(row['sequence']) >= 1
      && isOneOf(row['type'], PROOF_EVENT_TYPES)
      && isOneOf(row['actorType'], ['human', 'agent', 'system', 'runner'])
      && isIsoDate(row['occurredAt'])
      && typeof row['objectType'] === 'string'
      && typeof row['objectId'] === 'string'
      && typeof row['summary'] === 'string'
      && (row['actorId'] === undefined || typeof row['actorId'] === 'string')
      && (row['payload'] === undefined || validStringRecord(row['payload']))
      && (row['payloadHash'] === undefined || typeof row['payloadHash'] === 'string' && /^[a-f0-9]{64}$/.test(row['payloadHash']));
    case 'proofReceipts': return validProofReceiptShape(row);
    case 'sourceRecords': return isValidId(row['lessonId'])
      && isOneOf(row['kind'], ['youtube', 'article', 'note', 'file'])
      && isOneOf(row['status'], ['saved', 'ready', 'archived'])
      && hasString(row, 'title')
      && isNullableString(row['creator'])
      && isNullableString(row['url'])
      && validSourceNetworkShape(row)
      && (row['youtubeChannelId'] === undefined || isNullableString(row['youtubeChannelId']))
      && (row['contentFormat'] === null || isOneOf(row['contentFormat'], ['plain', 'markdown', 'json', 'srt', 'vtt']))
      && (row['contentHash'] === null || typeof row['contentHash'] === 'string' && /^[a-f0-9]{64}$/.test(row['contentHash']))
      && isOneOf(row['fetchStatus'], ['not_requested', 'queued', 'fetched', 'blocked', 'failed'])
      && (row['fetchMethod'] === null || isOneOf(row['fetchMethod'], ['user_paste', 'upload', 'local_transcription', 'scrapling_fetch']))
      && isOptionalNullableIso(row['fetchedAt'])
      && isNullableString(row['fetchError'])
      && (row['sourceOrigin'] === undefined || isOneOf(row['sourceOrigin'], ['manual', 'takeout-import', 'rss-watch']))
      && isOptionalNullableIso(row['permissionAcknowledgedAt'])
      && isNullableString(row['permissionNote']);
    case 'channelWatches': return isValidId(row['sourceId'])
      && row['id'] === row['sourceId']
      && typeof row['channelId'] === 'string'
      && (row['channelName'] === null || typeof row['channelName'] === 'string')
      && typeof row['enabled'] === 'boolean'
      && hasPositiveRevision(row)
      && isRecord(row['schedule'])
      && row['schedule']['kind'] === 'interval'
      && row['schedule']['everyMinutes'] === 1440
      && isIsoDate(row['schedule']['startAt'])
      && isStringArray(row['seenVideoIds'], CHANNEL_WATCH_SEEN_VIDEO_ID_LIMIT)
      && isStringArray(row['processedRunnerJobIds'], CHANNEL_WATCH_PROCESSED_JOB_ID_LIMIT)
      && (row['lastProcessedRunnerJobId'] === null || isValidId(row['lastProcessedRunnerJobId']))
      && isOptionalNullableIso(row['lastAttemptedAt'])
      && isOptionalNullableIso(row['lastCheckedAt'])
      && isOptionalNullableIso(row['disabledAt'])
      && isNullableString(row['lastError'])
      && (row['lastFeedHash'] === null || typeof row['lastFeedHash'] === 'string' && /^[a-f0-9]{64}$/.test(row['lastFeedHash']))
      && typeof row['actionHash'] === 'string'
      && /^[a-f0-9]{64}$/.test(row['actionHash']);
    default: return true;
  }
}

const REQUIRED_ROW_ARRAYS: Partial<Record<keyof WorkspaceExport, readonly string[]>> = {
  missions: ['definitionOfDone', 'constraints', 'nonGoals', 'allowedToolIds', 'requiredMemoryIds', 'stateHistory'],
  missionTasks: ['dependsOn'],
  lessons: ['coverageCriteria'],
  evidence: ['usedByNodeIds', 'history'],
  memories: ['provenance'],
  verifications: ['results'],
  proofReceipts: ['events', 'approvals', 'artifacts', 'assertions', 'failuresAndRepairs', 'exports'],
};

const REQUIRED_REVISION_ROWS = new Set<keyof WorkspaceExport>([
  'missions',
  'missionTasks',
  'lessons',
  'evidence',
  'skillGraphs',
  'skillVersions',
  'memories',
  'memoryVersions',
  'artifactSets',
  'artifactFiles',
  'artifactVersions',
  'runs',
  'channelWatches',
]);

const REQUIRED_CREATED_AT_ROWS = new Set<keyof WorkspaceExport>([
  'missions',
  'missionTasks',
  'lessons',
  'observations',
  'evidence',
  'skillGraphs',
  'skillVersions',
  'memories',
  'memoryVersions',
  'artifactSets',
  'artifactFiles',
  'artifactVersions',
  'runs',
  'proofReceipts',
  'sourceRecords',
  'channelWatches',
]);

const REQUIRED_UPDATED_AT_ROWS = new Set<keyof WorkspaceExport>([
  'missions',
  'missionTasks',
  'lessons',
  'observations',
  'evidence',
  'skillGraphs',
  'memories',
  'artifactSets',
  'artifactFiles',
  'runs',
  'sourceRecords',
  'channelWatches',
]);

function validateArchiveShape(value: unknown): Result<WorkspaceExport> {
  if (!isRecord(value)) return invalid('Export root must be an object');
  if (value['schemaVersion'] !== WORKSPACE_EXPORT_VERSION) {
    return invalid(`Unsupported export version ${String(value['schemaVersion'])}`);
  }
  if (!isValidId(value['exportId']) || !isIsoDate(value['exportedAt'])) {
    return invalid('Export metadata is invalid');
  }
  if (!isRecord(value['workspace'])) return invalid('Export has no valid workspace record');
  const workspace = value['workspace'];
  if (
    !isValidId(workspace['id'])
    || !hasString(workspace, 'name')
    || !hasPositiveRevision(workspace)
    || !isIsoDate(workspace['createdAt'])
    || !isIsoDate(workspace['updatedAt'])
  ) return invalid('Export has no valid workspace record');
  if (!isRecord(value['settings'])) return invalid('Export field settings must be an object');

  const integrity = value['integrity'];
  if (
    !isRecord(integrity)
    || integrity['canonicalization'] !== 'JCS-RFC8785'
    || integrity['hashAlgorithm'] !== 'SHA-256'
    || typeof integrity['payloadSha256'] !== 'string'
    || !/^[a-f0-9]{64}$/.test(integrity['payloadSha256'])
  ) return invalid('Export integrity metadata is required for version 1.0.0');

  const workspaceId = workspace['id'];
  const allRecordIds = new Set<string>();
  for (const [key, limit] of ARRAY_LIMITS) {
    const rows = value[key];
    if ((key === 'sourceRecords' || key === 'channelWatches') && rows === undefined) continue;
    if (!Array.isArray(rows)) return invalid(`Export field ${String(key)} must be an array`);
    if (rows.length > limit) return invalid(`Export field ${String(key)} exceeds the limit of ${limit}`);
    const primaryKey = key === 'proofReceipts' ? 'receiptId' : 'id';
    const ids = new Set<string>();
    for (const [index, row] of rows.entries()) {
      if (!isRecord(row)) return invalid(`Export field ${String(key)} contains an invalid row at ${index}`);
      const id = row[primaryKey];
      if (!isValidId(id)) return invalid(`Export field ${String(key)} contains an invalid ${primaryKey}`);
      if (ids.has(id)) return invalid(`Export field ${String(key)} contains duplicate id ${id}`);
      if (key !== 'channelWatches' && allRecordIds.has(id)) return invalid(`Export contains a duplicate record id ${id}`);
      ids.add(id);
      if (key !== 'channelWatches') allRecordIds.add(id);
      if (row['workspaceId'] !== workspaceId) {
        return invalid(`Export field ${String(key)} contains a row from another workspace`);
      }
      const requiredArrays = REQUIRED_ROW_ARRAYS[key];
      if (requiredArrays && !requireArrayFields(row, requiredArrays)) {
        return invalid(`Export field ${String(key)} contains a row with invalid array fields`);
      }
      if (row['revision'] !== undefined && !hasPositiveRevision(row)) {
        return invalid(`Export field ${String(key)} contains an invalid revision`);
      }
      if (REQUIRED_REVISION_ROWS.has(key) && !hasPositiveRevision(row)) {
        return invalid(`Export field ${String(key)} requires a revision`);
      }
      for (const dateKey of ['createdAt', 'updatedAt'] as const) {
        if (row[dateKey] !== undefined && !isIsoDate(row[dateKey])) {
          return invalid(`Export field ${String(key)} contains an invalid ${dateKey}`);
        }
      }
      if (REQUIRED_CREATED_AT_ROWS.has(key) && !isIsoDate(row['createdAt'])) {
        return invalid(`Export field ${String(key)} requires createdAt`);
      }
      if (REQUIRED_UPDATED_AT_ROWS.has(key) && !isIsoDate(row['updatedAt'])) {
        return invalid(`Export field ${String(key)} requires updatedAt`);
      }
      if (!validArchiveRow(key, row)) {
        return invalid(`Export field ${String(key)} contains a malformed record`);
      }
      if (key === 'skillGraphs' && !validSkillGraphShape(row)) {
        return invalid('Export contains an invalid skill');
      }
      if (key === 'skillVersions') {
        if (
          !isValidId(row['skillGraphId'])
          || !validSkillGraphShape(row['snapshot'])
          || (row['snapshot'] as ArchiveRow)['id'] !== row['skillGraphId']
          || (row['snapshot'] as ArchiveRow)['workspaceId'] !== workspaceId
          || (row['snapshot'] as ArchiveRow)['revision'] !== row['revision']
        ) return invalid('Export contains an invalid skill version');
      }
      if (key === 'memoryVersions') {
        if (
          !isValidId(row['memoryId'])
          || !isRecord(row['snapshot'])
          || (row['snapshot'] as ArchiveRow)['workspaceId'] !== workspaceId
        ) return invalid('Export contains an invalid memory version');
      }
      if (key === 'memories' && (row['tags'] !== undefined && !Array.isArray(row['tags']) || row['derivedFromMemoryIds'] !== undefined && !Array.isArray(row['derivedFromMemoryIds']))) {
        return invalid('Export contains an invalid memory');
      }
      if (key === 'proofReceipts' && row['sources'] !== undefined && !Array.isArray(row['sources'])) {
        return invalid('Export contains an invalid proof receipt');
      }
    }
  }

  return ok(value as unknown as WorkspaceExport);
}

function archiveRows(archive: WorkspaceExport, key: keyof WorkspaceExport): ArchiveRow[] {
  const value = archive[key];
  return Array.isArray(value) ? value as ArchiveRow[] : [];
}

function rowIds(archive: WorkspaceExport, key: keyof WorkspaceExport, idKey = 'id'): Set<string> {
  return new Set(archiveRows(archive, key).map((row) => String(row[idKey])));
}

function validateArchiveReferences(archive: WorkspaceExport): Result<void> {
  const missions = rowIds(archive, 'missions');
  const tasks = rowIds(archive, 'missionTasks');
  const lessons = rowIds(archive, 'lessons');
  const lessonById = new Map(archiveRows(archive, 'lessons').map((lesson) => [String(lesson['id']), lesson]));
  const skillGraphs = rowIds(archive, 'skillGraphs');
  const memories = rowIds(archive, 'memories');
  const deletedMemoryIds = new Set(
    archiveRows(archive, 'memoryVersions')
      .filter((version) => isRecord(version['snapshot']) && version['snapshot']['status'] === 'deleted')
      .map((version) => String(version['memoryId'])),
  );
  const knownMemoryIds = new Set([...memories, ...deletedMemoryIds]);
  const artifactSets = rowIds(archive, 'artifactSets');
  const artifactFileSets = new Map(archiveRows(archive, 'artifactFiles').map((file) => [String(file['id']), String(file['artifactSetId'])]));
  const verifications = rowIds(archive, 'verifications');
  const runs = rowIds(archive, 'runs');
  const receipts = rowIds(archive, 'proofReceipts', 'receiptId');
  const sources = rowIds(archive, 'sourceRecords');

  const optionalRef = (row: ArchiveRow, field: string, ids: Set<string>): boolean => {
    const value = row[field];
    return value === undefined || value === null || typeof value === 'string' && ids.has(value);
  };
  const requiredRef = (row: ArchiveRow, field: string, ids: Set<string>): boolean => {
    const value = row[field];
    return typeof value === 'string' && ids.has(value);
  };

  for (const mission of archiveRows(archive, 'missions')) {
    if (
      !optionalRef(mission, 'lessonId', lessons)
      || !optionalRef(mission, 'skillGraphId', skillGraphs)
      || !optionalRef(mission, 'artifactSetId', artifactSets)
      || !(mission['requiredMemoryIds'] as unknown[]).every((id) => typeof id === 'string' && knownMemoryIds.has(id))
    ) return invalid('Export contains a dangling project reference');
  }
  for (const task of archiveRows(archive, 'missionTasks')) {
    if (!requiredRef(task, 'missionId', missions) || !(task['dependsOn'] as unknown[]).every((id) => typeof id === 'string' && tasks.has(id))) {
      return invalid('Export contains a dangling project task reference');
    }
  }
  for (const lesson of archiveRows(archive, 'lessons')) {
    if (!optionalRef(lesson, 'missionId', missions)) return invalid('Export contains a dangling source reference');
  }
  for (const segment of archiveRows(archive, 'transcriptSegments')) {
    if (!requiredRef(segment, 'lessonId', lessons)) return invalid('Export contains a dangling transcript reference');
  }
  for (const observation of archiveRows(archive, 'observations')) {
    if (!requiredRef(observation, 'lessonId', lessons)) {
      return invalid('Export contains a dangling observation reference');
    }
  }
  for (const record of archiveRows(archive, 'evidence')) {
    if (!optionalRef(record, 'missionId', missions) || !optionalRef(record, 'lessonId', lessons)) {
      return invalid('Export contains a dangling evidence reference');
    }
  }
  for (const graph of archiveRows(archive, 'skillGraphs')) {
    if (!optionalRef(graph, 'missionId', missions)) return invalid('Export contains a dangling skill reference');
    const nodeIds = new Set((graph['nodes'] as ArchiveRow[]).map((node) => String(node['id'])));
    for (const edge of graph['edges'] as ArchiveRow[]) {
      if (!nodeIds.has(String(edge['source'])) || !nodeIds.has(String(edge['target']))) {
        return invalid('Export contains a dangling skill edge');
      }
    }
  }
  for (const version of archiveRows(archive, 'skillVersions')) {
    if (!requiredRef(version, 'skillGraphId', skillGraphs)) return invalid('Export contains a dangling skill version');
  }
  for (const memory of archiveRows(archive, 'memories')) {
    if (!optionalRef(memory, 'missionId', missions) || !optionalRef(memory, 'runId', runs)) return invalid('Export contains a dangling memory reference');
    for (const field of ['derivedFromMemoryIds'] as const) {
      if (!((memory[field] as unknown[] | undefined) ?? []).every((id) => typeof id === 'string' && knownMemoryIds.has(id))) {
        return invalid('Export contains a dangling memory reference');
      }
    }
    if (!optionalRef(memory, 'supersedesId', knownMemoryIds) || !optionalRef(memory, 'supersededById', knownMemoryIds)) {
      return invalid('Export contains a dangling memory reference');
    }
  }
  for (const version of archiveRows(archive, 'memoryVersions')) {
    if (!requiredRef(version, 'memoryId', knownMemoryIds)) return invalid('Export contains a dangling memory version');
  }
  for (const approval of archiveRows(archive, 'approvals')) {
    if (approval['objectType'] === 'skillgraph' && !requiredRef(approval, 'objectId', skillGraphs)) return invalid('Export contains a dangling skill approval');
    if (approval['objectType'] === 'memory' && !requiredRef(approval, 'objectId', knownMemoryIds)) return invalid('Export contains a dangling memory approval');
  }
  for (const set of archiveRows(archive, 'artifactSets')) {
    if (!requiredRef(set, 'missionId', missions)) return invalid('Export contains a dangling file-space reference');
  }
  for (const file of archiveRows(archive, 'artifactFiles')) {
    if (!requiredRef(file, 'artifactSetId', artifactSets)) return invalid('Export contains a dangling file reference');
  }
  for (const version of archiveRows(archive, 'artifactVersions')) {
    if (!requiredRef(version, 'artifactSetId', artifactSets)) {
      return invalid('Export contains a dangling file version');
    }
    const currentArtifactSetId = artifactFileSets.get(String(version['artifactFileId']));
    if (currentArtifactSetId && currentArtifactSetId !== version['artifactSetId']) {
      return invalid('Export contains a mismatched file version');
    }
  }
  for (const verification of archiveRows(archive, 'verifications')) {
    if (
      !requiredRef(verification, 'missionId', missions)
      || !optionalRef(verification, 'skillGraphId', skillGraphs)
      || !optionalRef(verification, 'artifactSetId', artifactSets)
      || !optionalRef(verification, 'repairedFromVerificationId', verifications)
    ) return invalid('Export contains a dangling check reference');
  }
  for (const run of archiveRows(archive, 'runs')) {
    if (!requiredRef(run, 'missionId', missions) || !optionalRef(run, 'verificationId', verifications) || !optionalRef(run, 'receiptId', receipts)) {
      return invalid('Export contains a dangling run reference');
    }
  }
  for (const receipt of archiveRows(archive, 'proofReceipts')) {
    if (!requiredRef(receipt, 'missionId', missions) || !requiredRef(receipt, 'skillGraphId', skillGraphs) || !optionalRef(receipt, 'runId', runs)) {
      return invalid('Export contains a dangling proof reference');
    }
  }
  for (const source of archiveRows(archive, 'sourceRecords')) {
    if (!requiredRef(source, 'lessonId', lessons)) return invalid('Export contains a dangling saved-source reference');
    const lesson = lessonById.get(String(source['lessonId']));
    if (!lesson) return invalid('Export contains a dangling saved-source reference');
    if (source['kind'] === 'youtube') {
      const parsedUrl = typeof source['url'] === 'string' ? parseYouTubeUrl(source['url']) : null;
      if (!parsedUrl?.ok || lesson['kind'] !== 'youtube') {
        return invalid('Export contains a mismatched YouTube source');
      }
    } else if (lesson['kind'] !== 'manual') {
      return invalid('Export contains a mismatched saved source');
    }
  }
  for (const watch of archiveRows(archive, 'channelWatches')) {
    if (!requiredRef(watch, 'sourceId', sources)) return invalid('Export contains a dangling channel-watch reference');
  }

  return ok(undefined);
}

async function validateArchiveDerivedIntegrity(archive: WorkspaceExport): Promise<Result<void>> {
  for (const graph of archive.skillGraphs as ArchiveRow[]) {
    if (
      typeof graph['versionHash'] !== 'string'
      || graph['versionHash'] !== await sha256Canonical({ ...graph, versionHash: undefined })
    ) return invalid('Export contains a skill with an invalid version hash');
  }
  for (const version of archive.skillVersions as ArchiveRow[]) {
    const snapshot = version['snapshot'] as ArchiveRow;
    const computed = await sha256Canonical({ ...snapshot, versionHash: undefined });
    if (snapshot['versionHash'] !== computed || version['versionHash'] !== computed) {
      return invalid('Export contains a skill version with an invalid hash');
    }
  }
  for (const set of archiveRows(archive, 'artifactSets')) {
    const path = validateArtifactPath(String(set['entryPath']));
    if (!path.ok || path.value.path !== set['entryPath']) {
      return invalid('Export contains an invalid file-space entry path');
    }
  }
  const artifactSetUsage = new Map<string, { count: number; bytes: number; paths: Set<string> }>();
  for (const key of ['artifactFiles', 'artifactVersions'] as const) {
    for (const file of archiveRows(archive, key)) {
      const content = String(file['content']);
      const sizeBytes = new TextEncoder().encode(content).byteLength;
      const path = validateArtifactPath(String(file['path']));
      if (
        !path.ok
        || path.value.path !== file['path']
        || sizeBytes > MAX_ARTIFACT_FILE_BYTES
        || file['sizeBytes'] !== sizeBytes
        || file['sha256'] !== await sha256Text(content)
      ) return invalid(`Export field ${key} contains invalid file integrity`);
      if (key === 'artifactFiles') {
        if (file['mediaType'] !== path.value.mediaType) {
          return invalid('Export contains a file with an invalid media type');
        }
        const artifactSetId = String(file['artifactSetId']);
        const usage = artifactSetUsage.get(artifactSetId) ?? { count: 0, bytes: 0, paths: new Set<string>() };
        if (usage.paths.has(path.value.path)) return invalid('Export contains duplicate file paths');
        usage.paths.add(path.value.path);
        usage.count += 1;
        usage.bytes += sizeBytes;
        if (usage.count > MAX_ARTIFACT_FILES || usage.bytes > MAX_ARTIFACT_SET_BYTES) {
          return invalid('Export exceeds the file-space limits');
        }
        artifactSetUsage.set(artifactSetId, usage);
      }
    }
  }
  for (const receipt of archive.proofReceipts as ProofReceipt[]) {
    const computed = await sha256CanonicalExcluding(
      receipt as unknown as Record<string, unknown>,
      RECEIPT_HASH_EXCLUSIONS,
    );
    if (computed !== receipt.receiptHash) return invalid('Export contains an invalid proof hash');
  }
  return ok(undefined);
}

export type ShippedExampleKind = 'golden-loop' | 'starter-library';

export interface WorkspaceImportResult {
  workspaceId: string;
  name: string;
  hashVerified: true;
  status: 'imported' | 'already-imported';
}

const SHIPPED_EXAMPLE_IDENTITIES: Record<ShippedExampleKind, {
  payloadSha256: string;
  workspaceName: string;
  descriptionMarker: string;
}> = {
  'golden-loop': {
    payloadSha256: '9b3a8e1102fdf4b6fff5f0779b9ba9a8a831a2706796de18ef3d32a9cff019b6',
    workspaceName: 'EXAMPLE — Learn a landing page workflow',
    descriptionMarker: 'Shipped labelled example workspace',
  },
  'starter-library': {
    payloadSha256: '7388560a0b9f3ef7d1caf2f82bd713cf1b614f3915a7a88c3e819a6da5862d9d',
    workspaceName: 'EXAMPLE — Creator skills starter library',
    descriptionMarker: 'starter-library-v1',
  },
};

export const TRUSTED_EXAMPLE_ARCHIVE_HASHES = Object.values(SHIPPED_EXAMPLE_IDENTITIES)
  .map((identity) => identity.payloadSha256);

type ArchiveIdDomain =
  | 'workspace'
  | 'mission'
  | 'missionTask'
  | 'lesson'
  | 'transcriptSegment'
  | 'observation'
  | 'evidence'
  | 'skillGraph'
  | 'skillVersion'
  | 'memory'
  | 'memoryVersion'
  | 'approval'
  | 'artifactSet'
  | 'artifactFile'
  | 'artifactVersion'
  | 'verification'
  | 'run'
  | 'proofEvent'
  | 'receipt'
  | 'source';

const ARCHIVE_ID_PREFIX: Record<ArchiveIdDomain, IdPrefix> = {
  workspace: 'ws',
  mission: 'ms',
  missionTask: 'tk',
  lesson: 'ls',
  transcriptSegment: 'seg',
  observation: 'obs',
  evidence: 'ev',
  skillGraph: 'sg',
  skillVersion: 'sv',
  memory: 'mem',
  memoryVersion: 'mem',
  approval: 'ap',
  artifactSet: 'as',
  artifactFile: 'af',
  artifactVersion: 'af',
  verification: 'vr',
  run: 'run',
  proofEvent: 'pe',
  receipt: 'rc',
  source: 'src',
};

function scopedArchiveId(domain: ArchiveIdDomain, id: string): string {
  return `${domain}\0${id}`;
}

function proofObjectDomain(objectType: unknown): ArchiveIdDomain | null {
  const domains: Record<string, ArchiveIdDomain> = {
    workspace: 'workspace',
    mission: 'mission',
    project: 'mission',
    lesson: 'lesson',
    source: 'source',
    channel_watch: 'source',
    observation: 'observation',
    evidence: 'evidence',
    skillgraph: 'skillGraph',
    skill: 'skillGraph',
    memory: 'memory',
    'artifact-set': 'artifactSet',
    'artifact-file': 'artifactFile',
    verification: 'verification',
    run: 'run',
    receipt: 'receipt',
  };
  return typeof objectType === 'string' ? domains[objectType] ?? null : null;
}

function remapArchiveReferences(archive: WorkspaceExport, idMap: ReadonlyMap<string, string>): WorkspaceExport {
  const mapped = structuredClone(archive);
  const mapValue = (domain: ArchiveIdDomain, value: unknown): unknown => typeof value === 'string'
    ? idMap.get(scopedArchiveId(domain, value)) ?? value
    : value;
  const mapField = (record: ArchiveRow, field: string, domain: ArchiveIdDomain): void => {
    if (record[field] !== undefined && record[field] !== null) record[field] = mapValue(domain, record[field]);
  };
  const mapArray = (record: ArchiveRow, field: string, domain: ArchiveIdDomain): void => {
    if (Array.isArray(record[field])) record[field] = (record[field] as unknown[]).map((value) => mapValue(domain, value));
  };
  const mapBase = (record: ArchiveRow, domain: ArchiveIdDomain, primaryKey = 'id'): void => {
    mapField(record, primaryKey, domain);
    mapField(record, 'workspaceId', 'workspace');
  };
  const mapGraph = (graph: ArchiveRow): void => {
    mapBase(graph, 'skillGraph');
    mapField(graph, 'missionId', 'mission');
    for (const node of graph['nodes'] as ArchiveRow[]) mapArray(node, 'evidenceIds', 'evidence');
    for (const reference of (graph['knowledge'] as ArchiveRow[] | undefined) ?? []) mapField(reference, 'evidenceId', 'evidence');
    for (const guardrail of graph['guardrails'] as ArchiveRow[]) mapArray(guardrail, 'sourceEvidenceIds', 'evidence');
    for (const evaluation of graph['evaluations'] as ArchiveRow[]) mapArray(evaluation, 'sourceEvidenceIds', 'evidence');
  };
  const mapMemory = (memory: ArchiveRow): void => {
    mapBase(memory, 'memory');
    mapField(memory, 'missionId', 'mission');
    mapField(memory, 'runId', 'run');
    mapArray(memory, 'derivedFromMemoryIds', 'memory');
    mapField(memory, 'supersedesId', 'memory');
    mapField(memory, 'supersededById', 'memory');
    for (const source of memory['provenance'] as ArchiveRow[]) {
      mapField(source, 'sourceId', source['sourceType'] === 'run' ? 'run' : 'source');
    }
  };
  const mapObjectId = (record: ArchiveRow): void => {
    const domain = proofObjectDomain(record['objectType']);
    if (domain) mapField(record, 'objectId', domain);
  };

  mapField(mapped.workspace, 'id', 'workspace');
  for (const row of mapped.missions as ArchiveRow[]) {
    mapBase(row, 'mission'); mapField(row, 'lessonId', 'lesson'); mapField(row, 'skillGraphId', 'skillGraph'); mapField(row, 'artifactSetId', 'artifactSet'); mapArray(row, 'requiredMemoryIds', 'memory');
  }
  for (const row of mapped.missionTasks as ArchiveRow[]) {
    mapBase(row, 'missionTask'); mapField(row, 'missionId', 'mission'); mapArray(row, 'dependsOn', 'missionTask');
  }
  for (const row of mapped.lessons as ArchiveRow[]) {
    mapBase(row, 'lesson'); mapField(row, 'missionId', 'mission');
    for (const criterion of row['coverageCriteria'] as ArchiveRow[]) mapArray(criterion, 'satisfiedByObservationIds', 'observation');
  }
  for (const row of mapped.transcriptSegments as ArchiveRow[]) { mapBase(row, 'transcriptSegment'); mapField(row, 'lessonId', 'lesson'); }
  for (const row of mapped.observations as ArchiveRow[]) { mapBase(row, 'observation'); mapField(row, 'lessonId', 'lesson'); mapField(row, 'evidenceId', 'evidence'); }
  for (const row of mapped.evidence as ArchiveRow[]) { mapBase(row, 'evidence'); mapField(row, 'missionId', 'mission'); mapField(row, 'lessonId', 'lesson'); }
  for (const row of mapped.skillGraphs as ArchiveRow[]) mapGraph(row);
  for (const row of mapped.skillVersions as ArchiveRow[]) {
    mapBase(row, 'skillVersion'); mapField(row, 'skillGraphId', 'skillGraph'); mapGraph(row['snapshot'] as ArchiveRow);
  }
  for (const row of mapped.memories as ArchiveRow[]) mapMemory(row);
  for (const row of mapped.memoryVersions as ArchiveRow[]) {
    mapBase(row, 'memoryVersion'); mapField(row, 'memoryId', 'memory'); mapMemory(row['snapshot'] as ArchiveRow);
  }
  for (const row of mapped.approvals as ArchiveRow[]) { mapBase(row, 'approval'); mapObjectId(row); }
  for (const row of mapped.artifactSets as ArchiveRow[]) { mapBase(row, 'artifactSet'); mapField(row, 'missionId', 'mission'); }
  for (const row of mapped.artifactFiles as ArchiveRow[]) { mapBase(row, 'artifactFile'); mapField(row, 'artifactSetId', 'artifactSet'); }
  for (const row of mapped.artifactVersions as ArchiveRow[]) { mapBase(row, 'artifactVersion'); mapField(row, 'artifactFileId', 'artifactFile'); mapField(row, 'artifactSetId', 'artifactSet'); }
  for (const row of mapped.verifications as ArchiveRow[]) {
    mapBase(row, 'verification'); mapField(row, 'missionId', 'mission'); mapField(row, 'skillGraphId', 'skillGraph'); mapField(row, 'artifactSetId', 'artifactSet'); mapField(row, 'repairedFromVerificationId', 'verification');
  }
  for (const row of mapped.runs as ArchiveRow[]) {
    mapBase(row, 'run'); mapField(row, 'missionId', 'mission'); mapField(row, 'receiptId', 'receipt'); mapField(row, 'verificationId', 'verification');
  }
  for (const row of mapped.proofEvents as ArchiveRow[]) {
    mapBase(row, 'proofEvent'); mapObjectId(row);
  }
  for (const row of mapped.proofReceipts as ArchiveRow[]) {
    mapBase(row, 'receipt', 'receiptId'); mapField(row, 'missionId', 'mission'); mapField(row, 'runId', 'run'); mapField(row, 'skillGraphId', 'skillGraph');
    for (const event of row['events'] as ArchiveRow[]) { mapField(event, 'id', 'proofEvent'); mapObjectId(event); }
    for (const approval of row['approvals'] as ArchiveRow[]) { mapField(approval, 'id', 'approval'); mapObjectId(approval); }
    for (const source of (row['sources'] as ArchiveRow[] | undefined) ?? []) {
      if (source['type'] === 'memory') mapField(source, 'id', 'memory');
      else if (source['type'] === 'transcript') mapField(source, 'id', 'transcriptSegment');
      else mapField(source, 'id', 'source');
    }
    for (const failure of row['failuresAndRepairs'] as ArchiveRow[]) mapArray(failure, 'repairEventIds', 'proofEvent');
  }
  for (const row of mapped.sourceRecords ?? [] as ArchiveRow[]) { mapBase(row as ArchiveRow, 'source'); mapField(row as ArchiveRow, 'lessonId', 'lesson'); }
  for (const row of mapped.channelWatches ?? [] as ArchiveRow[]) { mapBase(row as ArchiveRow, 'source'); mapField(row as ArchiveRow, 'sourceId', 'source'); }
  return mapped;
}

function downgradeMemoryAuthority(record: MemoryRecord): MemoryRecord {
  return {
    ...record,
    status: record.status === 'approved' || record.status === 'rejected' ? 'proposed' : record.status,
    approvedRevision: null,
    approvedBy: null,
    approvedAt: null,
    runId: null,
    pinned: false,
    lastUsedAt: null,
    useCount: 0,
    provenance: record.provenance.map((source) => ({ ...source, sourceType: 'import', trust: 'untrusted' })),
  };
}

async function normalizeImportedAuthorityAndHashes(
  archive: WorkspaceExport,
  preserveLabelledExampleState: boolean,
): Promise<void> {
  const importedAt = isoNow();
  for (const row of archive.skillGraphs as ArchiveRow[]) {
    if (!preserveLabelledExampleState) {
      row['status'] = 'draft';
      row['approvedRevision'] = null;
      row['approvedBy'] = null;
      row['approvedAt'] = null;
      row['knowledge'] = ((row['knowledge'] as ArchiveRow[] | undefined) ?? []).map((reference) => ({ ...reference, trust: 'untrusted' }));
    }
    row['versionHash'] = await sha256Canonical({ ...row, versionHash: undefined });
  }

  for (const row of archive.skillVersions as ArchiveRow[]) {
    const snapshot = row['snapshot'] as ArchiveRow;
    if (!preserveLabelledExampleState) {
      snapshot['status'] = 'draft';
      snapshot['approvedRevision'] = null;
      snapshot['approvedBy'] = null;
      snapshot['approvedAt'] = null;
      snapshot['knowledge'] = ((snapshot['knowledge'] as ArchiveRow[] | undefined) ?? []).map((reference) => ({ ...reference, trust: 'untrusted' }));
      row['status'] = 'draft';
      row['actorType'] = 'system';
      row['changeSummary'] = 'Imported as an unapproved local copy';
    }
    snapshot['versionHash'] = await sha256Canonical({ ...snapshot, versionHash: undefined });
    row['versionHash'] = snapshot['versionHash'];
  }

  if (!preserveLabelledExampleState) {
    const lessonsWithTranscript = new Set((archive.transcriptSegments as ArchiveRow[]).map((segment) => String(segment['lessonId'])));
    archive.approvals = [];
    archive.missions = (archive.missions as ArchiveRow[]).map((mission) => ({
      ...mission,
      state: 'DRAFT',
      stateHistory: [{ from: null, to: 'DRAFT', at: importedAt, actorType: 'system', reason: 'Imported as a local draft' }],
    }));
    archive.missionTasks = (archive.missionTasks as ArchiveRow[]).map(({ resultSummary: _resultSummary, ...task }) => ({ ...task, status: 'pending' }));
    archive.evidence = (archive.evidence as ArchiveRow[]).map((record) => ({
      ...record,
      trust: 'untrusted',
      provenanceMethod: 'unknown',
      transferability: 'unknown',
      history: [{ at: importedAt, action: 'trust_changed', actorType: 'system', summary: 'Imported as untrusted external evidence' }],
    }));
    archive.lessons = (archive.lessons as ArchiveRow[]).map((lesson) => ({
      ...lesson,
      permissionAcknowledgedAt: null,
      permissionNote: 'Imported without carrying over a permission acknowledgement',
      transcriptSource: lessonsWithTranscript.has(String(lesson['id'])) ? 'unknown' : null,
      transcriptImportedAt: lessonsWithTranscript.has(String(lesson['id'])) ? importedAt : null,
    }));
    archive.transcriptSegments = (archive.transcriptSegments as ArchiveRow[]).map((segment) => ({
      ...segment,
      source: 'unknown',
    }));
    archive.sourceRecords = (archive.sourceRecords ?? []).map((value) => {
      const { sourceOrigin: _sourceOrigin, ...source } = value as ArchiveRow;
      return {
        ...source,
        fetchStatus: 'not_requested',
        fetchMethod: null,
        fetchedAt: null,
        fetchError: null,
        contentHash: null,
        permissionAcknowledgedAt: null,
        permissionNote: 'Imported without carrying over a permission acknowledgement',
      };
    });
    archive.memories = (archive.memories as MemoryRecord[]).map(downgradeMemoryAuthority);
    archive.memoryVersions = (archive.memoryVersions as MemoryVersion[]).map((version) => ({
      ...version,
      snapshot: downgradeMemoryAuthority(version.snapshot),
      changeSummary: 'Imported as an unapproved local copy',
    }));
    archive.verifications = [];
    archive.runs = [];
    archive.proofEvents = [];
    archive.proofReceipts = [];
    archive.channelWatches = (archive.channelWatches ?? []).map((value) => {
      const watch = value as ArchiveRow;
      return {
        ...watch,
        enabled: false,
        disabledAt: importedAt,
        lastAttemptedAt: null,
        lastCheckedAt: null,
        lastError: null,
        lastFeedHash: null,
        lastProcessedRunnerJobId: null,
        processedRunnerJobIds: [],
      };
    });
  } else {
    const graphs = new Map((archive.skillGraphs as ArchiveRow[]).map((graph) => [String(graph['id']), graph]));
    archive.approvals = (archive.approvals as ApprovalRecord[]).map((approval) => {
      if (approval.objectType !== 'skillgraph' || approval.decision !== 'approved') return approval;
      const graph = graphs.get(approval.objectId);
      return graph ? { ...approval, contentHash: String(graph['versionHash']) } : approval;
    });
    archive.memories = (archive.memories as MemoryRecord[]).map((memory) => memory.status === 'approved'
      ? { ...memory, approvedBy: SYNTHETIC_SAMPLE_APPROVER }
      : memory);
    archive.memoryVersions = (archive.memoryVersions as MemoryVersion[]).map((version) => ({
      ...version,
      snapshot: version.snapshot.status === 'approved'
        ? { ...version.snapshot, approvedBy: SYNTHETIC_SAMPLE_APPROVER }
        : version.snapshot,
    }));
  }

  for (const receipt of archive.proofReceipts as ProofReceipt[]) {
    receipt.receiptHash = await sha256CanonicalExcluding(
      receipt as unknown as Record<string, unknown>,
      RECEIPT_HASH_EXCLUSIONS,
    );
  }
}

/**
 * Validates and imports an exported workspace as a NEW workspace. The payload
 * is fully validated (shape, hash, limits) before anything is written; a
 * corrupt archive changes nothing.
 */
async function importWorkspaceWithPolicy(
  raw: string,
  shippedExampleKind?: ShippedExampleKind,
): Promise<Result<WorkspaceImportResult>> {
  if (
    raw.length > MAX_WORKSPACE_IMPORT_FILE_BYTES
    || new TextEncoder().encode(raw).byteLength > MAX_WORKSPACE_IMPORT_FILE_BYTES
  ) return invalid('Import exceeds the 64 MiB limit');

  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch (error) {
    return invalid(`Import is not valid JSON: ${(error as Error).message}`);
  }

  const shape = validateArchiveShape(value);
  if (!shape.ok) return shape;
  let parsed = shape.value;
  const workspace = parsed.workspace;

  const recomputed = await sha256CanonicalExcluding(
    parsed as unknown as Record<string, unknown>,
    INTEGRITY_EXCLUSIONS,
  );
  if (recomputed !== parsed.integrity.payloadSha256) {
    return invalid('Export integrity hash does not match its content; the file was modified or corrupted', {
      stored: parsed.integrity.payloadSha256,
      recomputed,
    });
  }
  const derivedIntegrity = await validateArchiveDerivedIntegrity(parsed);
  if (!derivedIntegrity.ok) return derivedIntegrity;
  const references = validateArchiveReferences(parsed);
  if (!references.ok) return references;
  const hashVerified = true;
  const shippedIdentity = shippedExampleKind ? SHIPPED_EXAMPLE_IDENTITIES[shippedExampleKind] : null;
  const preserveLabelledExampleState = shippedIdentity !== null
    && parsed.integrity.payloadSha256 === shippedIdentity.payloadSha256
    && parsed.workspace['name'] === shippedIdentity.workspaceName
    && typeof parsed.workspace['description'] === 'string'
    && parsed.workspace['description'].includes(shippedIdentity.descriptionMarker);
  if (shippedExampleKind && !preserveLabelledExampleState) {
    return invalid(`The ${shippedExampleKind} example does not match Cherry's shipped identity`);
  }
  if (preserveLabelledExampleState) {
    const graphs = parsed.skillGraphs as ArchiveRow[];
    const approvals = parsed.approvals as ArchiveRow[];
    if (
      graphs.some((graph) => graph['status'] === 'approved' && graph['approvedBy'] !== SYNTHETIC_SAMPLE_APPROVER)
      || approvals.some((approval) => approval['decision'] === 'approved' && approval['decidedBy'] !== SYNTHETIC_SAMPLE_APPROVER)
    ) return invalid('The shipped example contains an unlabelled approval');
  }

  const deterministicPortableWorkspaceId = shippedExampleKind
    ? null
    : `ws-import-${parsed.integrity.payloadSha256}`;
  if (deterministicPortableWorkspaceId) {
    const existingImport = await getDb().workspaces.get(deterministicPortableWorkspaceId);
    if (existingImport) {
      return ok({
        workspaceId: existingImport.id,
        name: existingImport.name,
        hashVerified: true,
        status: 'already-imported',
      });
    }
  }

  // Remap EVERY record id so an import never collides with existing state,
  // while preserving internal references (mission.lessonId, snapshots, events).
  const idMap = new Map<string, string>();
  if (deterministicPortableWorkspaceId) {
    idMap.set(scopedArchiveId('workspace', String(workspace.id)), deterministicPortableWorkspaceId);
  }
  const claimId = (domain: ArchiveIdDomain, value: unknown): void => {
    if (typeof value !== 'string' || !isValidId(value)) return;
    const key = scopedArchiveId(domain, value);
    if (!idMap.has(key)) idMap.set(key, newId(ARCHIVE_ID_PREFIX[domain]));
  };
  claimId('workspace', workspace.id);
  const primaryIds: Array<[keyof WorkspaceExport, ArchiveIdDomain, string?]> = [
    ['missions', 'mission'],
    ['missionTasks', 'missionTask'],
    ['lessons', 'lesson'],
    ['transcriptSegments', 'transcriptSegment'],
    ['observations', 'observation'],
    ['evidence', 'evidence'],
    ['skillGraphs', 'skillGraph'],
    ['skillVersions', 'skillVersion'],
    ['memories', 'memory'],
    ['memoryVersions', 'memoryVersion'],
    ['approvals', 'approval'],
    ['artifactSets', 'artifactSet'],
    ['artifactFiles', 'artifactFile'],
    ['artifactVersions', 'artifactVersion'],
    ['verifications', 'verification'],
    ['runs', 'run'],
    ['proofEvents', 'proofEvent'],
    ['proofReceipts', 'receipt', 'receiptId'],
    ['sourceRecords', 'source'],
    // A channel watch intentionally shares its primary id with its source.
    ['channelWatches', 'source'],
  ];
  for (const [key, domain, primaryKey = 'id'] of primaryIds) {
    for (const row of (parsed[key] as unknown[]) ?? []) {
      const record = row as Record<string, unknown>;
      claimId(domain, record[primaryKey]);
    }
  }
  // Preserve legal tombstones and deleted-evidence gaps without allowing their
  // historical ids to alias records that already exist in this browser.
  for (const version of parsed.memoryVersions as ArchiveRow[]) claimId('memory', version['memoryId']);
  for (const version of parsed.artifactVersions as ArchiveRow[]) claimId('artifactFile', version['artifactFileId']);
  for (const observation of parsed.observations as ArchiveRow[]) claimId('evidence', observation['evidenceId']);
  const claimGraphEvidence = (graph: ArchiveRow): void => {
    for (const node of graph['nodes'] as ArchiveRow[]) {
      for (const evidenceId of node['evidenceIds'] as unknown[]) claimId('evidence', evidenceId);
    }
    for (const reference of (graph['knowledge'] as ArchiveRow[] | undefined) ?? []) claimId('evidence', reference['evidenceId']);
    for (const guardrail of graph['guardrails'] as ArchiveRow[]) {
      for (const evidenceId of (guardrail['sourceEvidenceIds'] as unknown[] | undefined) ?? []) claimId('evidence', evidenceId);
    }
    for (const evaluation of graph['evaluations'] as ArchiveRow[]) {
      for (const evidenceId of (evaluation['sourceEvidenceIds'] as unknown[] | undefined) ?? []) claimId('evidence', evidenceId);
    }
  };
  for (const graph of parsed.skillGraphs as ArchiveRow[]) claimGraphEvidence(graph);
  for (const version of parsed.skillVersions as ArchiveRow[]) claimGraphEvidence(version['snapshot'] as ArchiveRow);
  parsed = remapArchiveReferences(parsed, idMap);
  const newWorkspaceId = idMap.get(scopedArchiveId('workspace', String(workspace['id'])))!;
  const remap = (rows: unknown[]): unknown[] => rows;
  await normalizeImportedAuthorityAndHashes(parsed, preserveLabelledExampleState);
  const validOptionalIso = (candidate: unknown): boolean => candidate === null || isIsoDate(candidate);
  const importedSources = new Map<string, Record<string, unknown>>();
  for (const row of parsed.sourceRecords ?? []) {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      const source = row as Record<string, unknown>;
      if (typeof source['id'] === 'string') importedSources.set(source['id'], source);
    }
  }

  for (const row of parsed.channelWatches ?? []) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return invalid('Export contains an invalid channel watch');
    const watch = row as Record<string, unknown>;
    const schedule = watch['schedule'];
    const scheduleRecord = schedule && typeof schedule === 'object' && !Array.isArray(schedule)
      ? schedule as Record<string, unknown>
      : null;
    const scheduleStartAt = scheduleRecord?.['startAt'];
    const parsedChannel = typeof watch['channelId'] === 'string' ? parseYouTubeChannelId(watch['channelId']) : null;
    const seenVideoIds = watch['seenVideoIds'];
    const processedJobIds = watch['processedRunnerJobIds'];
    const source = typeof watch['sourceId'] === 'string' ? importedSources.get(watch['sourceId']) : undefined;
    if (
      !isValidId(watch['id'])
      || !isValidId(watch['sourceId'])
      || watch['id'] !== watch['sourceId']
      || watch['workspaceId'] !== newWorkspaceId
      || !parsedChannel?.ok
      || typeof watch['revision'] !== 'number'
      || !Number.isInteger(watch['revision'])
      || watch['revision'] < 1
      || typeof watch['enabled'] !== 'boolean'
      || !schedule
      || typeof schedule !== 'object'
      || Array.isArray(schedule)
      || scheduleRecord?.['kind'] !== 'interval'
      || scheduleRecord['everyMinutes'] !== 1440
      || typeof scheduleStartAt !== 'string'
      || !isIsoDate(scheduleStartAt)
      || !Array.isArray(seenVideoIds)
      || seenVideoIds.length > CHANNEL_WATCH_SEEN_VIDEO_ID_LIMIT
      || !seenVideoIds.every((id) => typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id))
      || new Set(seenVideoIds).size !== seenVideoIds.length
      || !Array.isArray(processedJobIds)
      || processedJobIds.length > CHANNEL_WATCH_PROCESSED_JOB_ID_LIMIT
      || !processedJobIds.every((id) => typeof id === 'string' && isValidId(id))
      || new Set(processedJobIds).size !== processedJobIds.length
      || (watch['lastProcessedRunnerJobId'] !== null && !isValidId(watch['lastProcessedRunnerJobId']))
      || (processedJobIds.length === 0 ? watch['lastProcessedRunnerJobId'] !== null : watch['lastProcessedRunnerJobId'] !== processedJobIds.at(-1))
      || (watch['channelName'] !== null && (typeof watch['channelName'] !== 'string' || watch['channelName'].length > 200))
      || !validOptionalIso(watch['lastAttemptedAt'])
      || !validOptionalIso(watch['lastCheckedAt'])
      || !validOptionalIso(watch['disabledAt'])
      || (watch['lastError'] !== null && (typeof watch['lastError'] !== 'string' || watch['lastError'].length > 1000))
      || (watch['lastFeedHash'] !== null && (typeof watch['lastFeedHash'] !== 'string' || !/^[a-f0-9]{64}$/.test(watch['lastFeedHash'])))
      || !isIsoDate(watch['createdAt'])
      || !isIsoDate(watch['updatedAt'])
      || (watch['enabled'] === true && watch['disabledAt'] !== null)
      || !source
      || source['workspaceId'] !== newWorkspaceId
      || source['kind'] !== 'youtube'
      || source['youtubeChannelId'] !== parsedChannel.value.channelId
      || (watch['enabled'] === true && source['status'] === 'archived')
    ) {
      return invalid('Export contains an invalid channel watch');
    }
    watch['channelId'] = parsedChannel.value.channelId;
    watch['actionHash'] = await sha256Canonical({
      channelId: watch['channelId'],
      revision: watch['revision'],
      schedule: watch['schedule'],
      sourceId: watch['sourceId'],
      workspaceId: watch['workspaceId'],
    });
  }

  const now = isoNow();
  const { isExample: _archiveExampleFlag, ...portableWorkspace } = parsed.workspace as Record<string, unknown>;
  const importedWorkspace = {
    ...portableWorkspace,
    id: newWorkspaceId,
    name: `${String(workspace['name'])}${preserveLabelledExampleState ? '' : ' (imported)'}`,
    updatedAt: now,
    ...(preserveLabelledExampleState ? { isExample: true } : {}),
  };

  const importEvents: NewProofEvent[] = [
    {
      type: 'workspace.imported',
      actorType: 'human',
      objectType: 'workspace',
      objectId: newWorkspaceId,
      summary: `Workspace imported from export ${parsed.exportId} (hash verified)`,
      payload: {
        sourceExportId: parsed.exportId,
        sourcePayloadSha256: parsed.integrity.payloadSha256,
        importPolicy: preserveLabelledExampleState ? 'labelled-example-v1' : 'portable-untrusted-v2',
      },
    },
  ];
  for (const row of parsed.channelWatches ?? []) {
    const watch = row as Record<string, unknown>;
    importEvents.push({
      type: 'channel_watch.created',
      actorType: 'human',
      objectType: 'channel_watch',
      objectId: String(watch['id']),
      summary: `Channel watch restored from import for ${String(watch['channelId'])}`,
      payload: {
        channelId: String(watch['channelId']),
        sourceId: String(watch['sourceId']),
        revision: Number(watch['revision']),
        actionHash: String(watch['actionHash']),
        imported: true,
      },
    });
  }

  try {
  await withWorkspaceTx(
    newWorkspaceId,
    [
      'workspaces',
      'missions',
      'missionTasks',
      'lessons',
      'transcriptSegments',
      'observations',
      'evidence',
      'skillGraphs',
      'skillVersions',
      'memories',
      'memoryVersions',
      'approvals',
      'artifactSets',
      'artifactFiles',
      'artifactVersions',
      'verifications',
      'runs',
      'proofEvents',
      'receipts',
      'sourceRecords',
      'channelWatches',
    ],
    async (ctx) => {
      await ctx.db.workspaces.add(importedWorkspace as never);
      await ctx.db.missions.bulkAdd(remap(parsed.missions) as never[]);
      await ctx.db.missionTasks.bulkAdd(remap(parsed.missionTasks ?? []) as never[]);
      await ctx.db.lessons.bulkAdd(remap(parsed.lessons) as never[]);
      await ctx.db.transcriptSegments.bulkAdd(remap(parsed.transcriptSegments ?? []) as never[]);
      await ctx.db.observations.bulkAdd(remap(parsed.observations ?? []) as never[]);
      await ctx.db.evidence.bulkAdd(remap(parsed.evidence) as never[]);
      await ctx.db.skillGraphs.bulkAdd(remap(parsed.skillGraphs) as never[]);
      await ctx.db.skillVersions.bulkAdd(remap(parsed.skillVersions ?? []) as never[]);
      await ctx.db.memories.bulkAdd(remap(parsed.memories) as never[]);
      await ctx.db.memoryVersions.bulkAdd(remap(parsed.memoryVersions ?? []) as never[]);
      await ctx.db.approvals.bulkAdd(remap(parsed.approvals ?? []) as never[]);
      await ctx.db.artifactSets.bulkAdd(remap(parsed.artifactSets) as never[]);
      await ctx.db.artifactFiles.bulkAdd(remap(parsed.artifactFiles ?? []) as never[]);
      await ctx.db.artifactVersions.bulkAdd(remap(parsed.artifactVersions ?? []) as never[]);
      await ctx.db.verifications.bulkAdd(remap(parsed.verifications ?? []) as never[]);
      await ctx.db.runs.bulkAdd(remap(parsed.runs) as never[]);
      await ctx.db.proofEvents.bulkAdd(remap(parsed.proofEvents ?? []) as never[]);
      await ctx.db.receipts.bulkAdd(remap(parsed.proofReceipts ?? []) as never[]);
      await ctx.db.sourceRecords.bulkAdd(remap(parsed.sourceRecords ?? []) as never[]);
      await ctx.db.channelWatches.bulkAdd(remap(parsed.channelWatches ?? []) as never[]);
      for (const event of importEvents) ctx.emit(event);
    },
  );
  } catch (error) {
    return invalid(
      'Import failed and nothing was saved. Try again or choose a different Cherry export.',
      { cause: (error as Error).message },
    );
  }

  return ok({ workspaceId: newWorkspaceId, name: String(importedWorkspace['name']), hashVerified, status: 'imported' });
}

/** Import a user-selected archive with every approval/trust capability reset. */
export function importWorkspace(
  raw: string,
): Promise<Result<WorkspaceImportResult>> {
  return importWorkspaceWithPolicy(raw);
}

/** Preserve sample authority only for one exact, registered, labelled fixture. */
export function importShippedExampleWorkspace(
  raw: string,
  kind: ShippedExampleKind,
): Promise<Result<WorkspaceImportResult>> {
  return importWorkspaceWithPolicy(raw, kind);
}
