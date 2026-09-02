import Dexie, { type Table } from 'dexie';
import type { AgentProfile, Crew, ExecutionHost, HandoffRecord, Routine, WorkItem, WorkMessage } from '../workforce/workforce-model.ts';
import type { ProofEvent } from '../core/domain-event.ts';
import type { WorkspaceRecord, SettingRecord } from '../mission/mission-model.ts';
import type { Mission, MissionTask } from '../mission/mission-model.ts';
import type { Lesson, TranscriptSegment, Observation } from '../watch/watch-model.ts';
import type { EvidenceRecord } from '../evidence/evidence-model.ts';
import type { SkillGraph, SkillGraphVersion } from '../skillgraph/skillgraph-model.ts';
import type { MemoryRecord, MemoryVersion } from '../memory/memory-model.ts';
import type { ApprovalRecord } from '../approval/approval-model.ts';
import type { ArtifactSet, ArtifactFile, ArtifactVersion } from '../artifacts/artifact-model.ts';
import type { VerificationReport } from '../verify/assertion-model.ts';
import type { ProofReceipt } from '../proof/proof-model.ts';
import type { RunRecord } from '../mission/mission-model.ts';
import type { SourceRecord } from '../source/source-model.ts';
import type { ChannelWatch } from '../source/channel-watch-model.ts';
import type { SkillProposal } from '../source/proposal-model.ts';
import type { EvaluationReport, MissionPlan } from '../workforce/mission-plan-model.ts';
import { CHERRY_DB_MIGRATIONS, CHERRY_DB_VERSION } from './migrations.ts';

export class CherryDatabase extends Dexie {
  workspaces!: Table<WorkspaceRecord, string>;
  missions!: Table<Mission, string>;
  missionTasks!: Table<MissionTask, string>;
  lessons!: Table<Lesson, string>;
  transcriptSegments!: Table<TranscriptSegment, string>;
  observations!: Table<Observation, string>;
  evidence!: Table<EvidenceRecord, string>;
  skillGraphs!: Table<SkillGraph, string>;
  skillVersions!: Table<SkillGraphVersion, string>;
  memories!: Table<MemoryRecord, string>;
  memoryVersions!: Table<MemoryVersion, string>;
  approvals!: Table<ApprovalRecord, string>;
  artifactSets!: Table<ArtifactSet, string>;
  artifactFiles!: Table<ArtifactFile, string>;
  artifactVersions!: Table<ArtifactVersion, string>;
  verifications!: Table<VerificationReport, string>;
  runs!: Table<RunRecord, string>;
  proofEvents!: Table<ProofEvent, string>;
  receipts!: Table<ProofReceipt, string>;
  settings!: Table<SettingRecord, string>;
  agentProfiles!: Table<AgentProfile, string>;
  crews!: Table<Crew, string>;
  workItems!: Table<WorkItem, string>;
  workMessages!: Table<WorkMessage, string>;
  handoffs!: Table<HandoffRecord, string>;
  executionHosts!: Table<ExecutionHost, string>;
  routines!: Table<Routine, string>;
  sourceRecords!: Table<SourceRecord, string>;
  channelWatches!: Table<ChannelWatch, string>;
  skillProposals!: Table<SkillProposal, string>;
  missionPlans!: Table<MissionPlan, string>;
  evaluationReports!: Table<EvaluationReport, string>;

  constructor(name = 'cherry') {
    super(name);
    for (const migration of CHERRY_DB_MIGRATIONS) {
      const version = this.version(migration.version).stores(migration.stores);
      if (migration.upgrade) {
        version.upgrade(migration.upgrade);
      }
    }
  }
}

let database: CherryDatabase | null = null;

export function getDb(): CherryDatabase {
  if (!database) {
    database = new CherryDatabase();
  }
  return database;
}

/** Tests and workspace import use isolated databases. */
export function setDb(next: CherryDatabase | null): void {
  database = next;
}

export function schemaVersion(): number {
  return CHERRY_DB_VERSION;
}

export const ALL_STORES = [
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
  'settings',
  'sourceRecords',
  'channelWatches',
  'skillProposals',
  'agentProfiles',
  'crews',
  'workItems',
  'workMessages',
  'handoffs',
  'executionHosts',
  'routines',
  'missionPlans',
  'evaluationReports',
] as const;
