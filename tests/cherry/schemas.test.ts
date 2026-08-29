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
import { createArtifactSet, writeArtifactFile } from '../../src/cherry/artifacts/artifact-service.ts';
import { runVerification } from '../../src/cherry/verify/verification-service.ts';
import { createProofReceipt } from '../../src/cherry/proof/proof-service.ts';
import { unwrap } from '../../src/cherry/core/result.ts';

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
