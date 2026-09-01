import { beforeEach, describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { freshDb } from '../setup.ts';
import workspaceSchema from '../../schemas/cherry-workspace.schema.json';
import proofSchema from '../../schemas/cherry-proof.schema.json';
import memorySchema from '../../schemas/cherry-memory.schema.json';
import skillgraphSchema from '../../schemas/cherry-skillgraph.schema.json';
import { createMission, createWorkspace, updateMission } from '../../src/cherry/mission/mission-service.ts';
import { draftSkillGraph, decideSkillGraphApproval, requestSkillGraphApproval } from '../../src/cherry/skillgraph/skillgraph-service.ts';
import { proposeMemory } from '../../src/cherry/memory/memory-service.ts';
import { createArtifactSet, purgeArtifactVersionContents, writeArtifactFile } from '../../src/cherry/artifacts/artifact-service.ts';
import { runVerification } from '../../src/cherry/verify/verification-service.ts';
import { createProofReceipt } from '../../src/cherry/proof/proof-service.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import { exportWorkspace } from '../../src/cherry/persistence/workspace-archive.ts';
import { getDb } from '../../src/cherry/persistence/cherry-db.ts';
import { draftRoutine } from '../../src/cherry/workforce/routines-service.ts';
import {
  addWorkMessage,
  createStarterCrew,
  createWorkItem,
  proposeHandoff,
} from '../../src/cherry/workforce/workforce-service.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function makeAjv() {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  return ajv;
}

describe('canonical schemas validate real Cherry output', () => {
  beforeEach(() => {
    freshDb();
  });

  it('all four schemas compile under JSON Schema Draft 2020-12', () => {
    const ajv = makeAjv();
    for (const schema of [workspaceSchema, proofSchema, memorySchema, skillgraphSchema]) {
      expect(() => ajv.compile(schema as never)).not.toThrow();
    }
  });

  it('a real v1.1 whole-workspace export validates against cherry-workspace.schema.json', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Portable schema workspace' }));
    const mission = unwrap(await createMission({
      workspaceId: workspace.id,
      title: 'Portable schema project',
      objective: 'Validate the current archive contract',
      definitionOfDone: ['The canonical schema accepts the real export'],
    }));
    const artifactSet = unwrap(await createArtifactSet(workspace.id, mission.id, 'Portable artifacts'));
    unwrap(await writeArtifactFile(artifactSet.id, 'notes.txt', 'Current files are exported separately from their file space.', 'human'));
    unwrap(await purgeArtifactVersionContents(workspace.id, 'human'));
    const exported = unwrap(await exportWorkspace(workspace.id));

    const validate = makeAjv().compile(workspaceSchema as never);
    expect(validate(exported), JSON.stringify(validate.errors)).toBe(true);
    expect(validate.errors ?? []).toEqual([]);
    expect((exported.artifactVersions[0] as Record<string, unknown>)['content']).toBeNull();
  });

  it('the two shipped legacy v1.0 archives remain schema-valid unchanged', () => {
    const validate = makeAjv().compile(workspaceSchema as never);
    for (const fileName of ['example-workspace.json', 'starter-library-workspace.json']) {
      const fixture = JSON.parse(readFileSync(resolve(process.cwd(), 'public', 'examples', fileName), 'utf8')) as unknown;
      expect(validate(fixture), `${fileName}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  it('rejects malformed portable records at the JSON Schema boundary', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Strict archive schema' }));
    const mission = unwrap(await createMission({
      workspaceId: workspace.id,
      title: 'Strict project',
      objective: 'Reject incomplete records before import',
      definitionOfDone: ['Malformed records fail validation'],
    }));
    const artifactSet = unwrap(await createArtifactSet(workspace.id, mission.id, 'Strict artifacts'));
    unwrap(await writeArtifactFile(artifactSet.id, 'notes.txt', 'schema boundary', 'human'));
    const exported = unwrap(await exportWorkspace(workspace.id));
    const validate = makeAjv().compile(workspaceSchema as never);
    const clone = () => structuredClone(exported) as typeof exported;

    const missingMissionTitle = clone();
    delete (missingMissionTitle.missions[0] as Record<string, unknown>)['title'];
    expect(validate(missingMissionTitle)).toBe(false);

    const incompleteRoutine = clone();
    incompleteRoutine.routines!.push({ id: 'rt-incomplete', workspaceId: workspace.id });
    expect(validate(incompleteRoutine)).toBe(false);

    const nonCanonicalTimestamp = clone();
    nonCanonicalTimestamp.exportedAt = exported.exportedAt.replace(/\.\d{3}Z$/, 'Z');
    expect(validate(nonCanonicalTimestamp)).toBe(false);

    const unsafeArtifactPath = clone();
    (unsafeArtifactPath.artifactFiles[0] as Record<string, unknown>)['path'] = '../notes.txt';
    expect(validate(unsafeArtifactPath)).toBe(false);

    const unknownWorkspaceField = clone();
    (unknownWorkspaceField.workspace as unknown as Record<string, unknown>)['unexpected'] = true;
    expect(validate(unknownWorkspaceField)).toBe(false);
  });

  it('validates current workforce records and rejects missing authority fields', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Workforce schema workspace' }));
    const mission = unwrap(await createMission({
      workspaceId: workspace.id,
      title: 'Workforce schema project',
      objective: 'Exercise every portable workforce definition',
      definitionOfDone: ['All workforce records validate'],
    }));
    const drafted = unwrap(await draftSkillGraph({
      workspaceId: workspace.id,
      missionId: mission.id,
      name: 'Workforce schema skill',
      purpose: 'Back the portable routine',
      nodes: [{ kind: 'build', title: 'Build', goal: 'Produce the result' }],
    }));
    unwrap(await updateMission(mission.id, { skillGraphId: drafted.id }));
    const request = unwrap(await requestSkillGraphApproval(drafted.id, 'Review workforce fixture', 'user'));
    const graph = unwrap(await decideSkillGraphApproval(request.approval.id, 'approved', 'user')).graph;
    const { crew, profiles } = unwrap(await createStarterCrew(workspace.id));
    const item = unwrap(await createWorkItem({
      workspaceId: workspace.id,
      title: 'Portable task',
      objective: 'Exercise portable workforce records',
      definitionOfDone: ['The record validates'],
      crewId: crew.id,
      assignedAgentIds: [profiles[0]!.id],
    }));
    unwrap(await addWorkMessage(workspace.id, item.id, {
      actorType: 'agent',
      actorId: profiles[0]!.id,
      kind: 'checkpoint',
      body: 'Schema checkpoint',
    }));
    unwrap(await proposeHandoff(workspace.id, {
      workItemId: item.id,
      fromAgentId: profiles[0]!.id,
      toAgentId: profiles[1]!.id,
      reason: 'Continue the schema fixture',
    }));
    await getDb().executionHosts.add({
      id: 'local-runner',
      workspaceId: workspace.id,
      kind: 'local-runner',
      name: 'Local runner',
      status: 'unpaired',
      capabilities: [],
      lastSeenAt: null,
      publicConfig: {},
      revision: 1,
    });
    unwrap(await draftRoutine({ workspaceId: workspace.id, skillGraphId: graph.id, name: 'Schema routine' }));

    const exported = unwrap(await exportWorkspace(workspace.id));
    const validate = makeAjv().compile(workspaceSchema as never);
    expect(validate(exported), JSON.stringify(validate.errors)).toBe(true);

    const requiredFields = [
      ['agentProfiles', 'status'],
      ['crews', 'coordinatorAgentId'],
      ['workItems', 'priority'],
      ['workMessages', 'kind'],
      ['handoffs', 'toAgentId'],
      ['executionHosts', 'capabilities'],
      ['routines', 'schedule'],
    ] as const;
    for (const [collection, field] of requiredFields) {
      const malformed = structuredClone(exported);
      delete ((malformed[collection] as unknown[])[0] as Record<string, unknown>)[field];
      expect(validate(malformed), `${collection}.${field} must be required`).toBe(false);
    }

    const invalidSchedule = structuredClone(exported);
    (invalidSchedule.routines![0] as Record<string, unknown>)['schedule'] = {
      kind: 'interval',
      everyMinutes: 0,
      startAt: '2026-09-01T12:00:00.000Z',
    };
    expect(validate(invalidSchedule)).toBe(false);
  });

  it('a real proof receipt validates against cherry-proof.schema.json', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Schema workspace' }));
    const mission = unwrap(
      await createMission({
        workspaceId: workspace.id,
        title: 'Schema mission',
        objective: 'Produce a schema-valid receipt',
        definitionOfDone: ['Receipt validates'],
      }),
    );
    const graph = unwrap(
      await draftSkillGraph({
        workspaceId: workspace.id,
        missionId: mission.id,
        name: 'Schema skill',
        purpose: 'Validate output shapes',
        nodes: [{ kind: 'build', title: 'Build', goal: 'Do the thing' }],
      }),
    );
    const artifactSet = unwrap(await createArtifactSet(workspace.id, mission.id, 'Artifacts'));
    unwrap(await updateMission(mission.id, { skillGraphId: graph.id, artifactSetId: artifactSet.id }));
    unwrap(await writeArtifactFile(artifactSet.id, 'index.html', '<html lang="en"><head><title>t</title></head><body><main><h1>h</h1></main></body></html>', 'human'));
    unwrap(await runVerification({ missionId: mission.id }));
    const receipt = unwrap(await createProofReceipt(mission.id));

    const validate = makeAjv().compile(proofSchema as never);
    const valid = validate(JSON.parse(JSON.stringify(receipt)));
    expect(validate.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });

  it('a real approved skill graph validates against cherry-skillgraph.schema.json', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Graph workspace' }));
    const graph = unwrap(
      await draftSkillGraph({
        workspaceId: workspace.id,
        name: 'Graph skill',
        purpose: 'Validate the graph shape',
        nodes: [{ kind: 'build', title: 'Build', goal: 'Do it' }],
      }),
    );
    const request = unwrap(await requestSkillGraphApproval(graph.id, 'review', 'user'));
    const decided = unwrap(await decideSkillGraphApproval(request.approval.id, 'approved', 'user'));

    const validate = makeAjv().compile(skillgraphSchema as never);
    const record = JSON.parse(JSON.stringify(decided.graph)) as Record<string, unknown>;
    delete record['versionHash']; // implementation detail beyond the canonical schema
    const valid = validate(record);
    expect(validate.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });

  it('a real memory record validates against cherry-memory.schema.json', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Memory workspace' }));
    const memory = unwrap(
      await proposeMemory({
        workspaceId: workspace.id,
        type: 'preference',
        title: 'Schema memory',
        content: 'Validate me',
        scope: 'workspace',
        provenance: [{ sourceType: 'human', trust: 'reviewed', description: 'typed by user' }],
      }),
    );
    const validate = makeAjv().compile(memorySchema as never);
    const record = JSON.parse(JSON.stringify(memory)) as Record<string, unknown>;
    delete record['pinned']; // UI convenience flag beyond the canonical schema
    const valid = validate(record);
    expect(validate.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });

  it('invalid fixtures fail with expected errors', () => {
    const ajv = makeAjv();
    const validateMemory = ajv.compile(memorySchema as never);
    expect(validateMemory({ schemaVersion: '1.0.0' })).toBe(false);
    expect((validateMemory.errors ?? []).length).toBeGreaterThan(0);

    const validateProof = ajv.compile(proofSchema as never);
    expect(validateProof({ schemaVersion: '9.0.0', receiptId: 'x' })).toBe(false);

    const validateGraph = ajv.compile(skillgraphSchema as never);
    expect(validateGraph({ schemaVersion: '1.0.0', id: 'sg-1', nodes: [] })).toBe(false);
  });
});
