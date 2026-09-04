import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { freshDb } from '../setup.ts';
import { WebMcpRegistrationManager } from '../../src/cherry/webmcp/registration-manager.ts';
import type { ToolContext } from '../../src/cherry/webmcp/tool-definitions.ts';
import { createMission, createWorkspace } from '../../src/cherry/mission/mission-service.ts';
import {
  draftSkillGraph,
  getSkillGraph,
  requestSkillGraphApproval,
} from '../../src/cherry/skillgraph/skillgraph-service.ts';
import { getDb } from '../../src/cherry/persistence/cherry-db.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import { minimalToolInput } from './tool-input-fixtures.ts';

/**
 * `tool-input-strictness.test.ts` proves the `guarded()` wrapper rejects unknown
 * keys. This file proves every REGISTERED tool actually goes through it, and
 * that what each one publishes to a host matches what it enforces at runtime.
 *
 * The gap this closes was real: a live host sent `{"humanApproved": true}` to
 * get_skill and the key was silently stripped. Nothing was approved, but an
 * agent could not tell that from the response. A registry-wide walk is the only
 * way to know the fix holds for the next tool someone adds, not just for the
 * one tool that exposed it.
 */

function makeContext(): ToolContext & { workspaceId: string | null; missionId: string | null } {
  const context = {
    workspaceId: null as string | null,
    missionId: null as string | null,
    getActiveWorkspaceId() {
      return context.workspaceId;
    },
    getActiveMissionId() {
      return context.missionId;
    },
  };
  return context;
}

interface ToolResultShape {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

function parseResult(result: unknown): Record<string, unknown> {
  const shaped = result as ToolResultShape;
  return JSON.parse(shaped.content[0]!.text) as Record<string, unknown>;
}

interface PublishedSchema {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * Building the registry touches no database, so the tool names are available at
 * collection time and each tool gets its own named case.
 */
const TOOL_NAMES = new WebMcpRegistrationManager(makeContext())
  .listDefinitions()
  .map((definition) => definition.name);

const UNKNOWN_KEY = 'cherryUnknownProbe';
const FORGED_APPROVAL_KEYS = ['humanApproved', 'approved', 'humanConfirmed'] as const;

describe('published tool schemas', () => {
  beforeEach(() => {
    freshDb();
  });

  it('registers at least the documented tool surface', () => {
    // A registry that silently emptied would make every walk below vacuous.
    expect(TOOL_NAMES.length).toBeGreaterThan(20);
    expect(new Set(TOOL_NAMES).size).toBe(TOOL_NAMES.length);
  });

  it('every definition is a closed object schema backed by a ZodObject', () => {
    for (const definition of new WebMcpRegistrationManager(makeContext()).listDefinitions()) {
      const schema = definition.inputSchema as PublishedSchema;
      expect(schema.type, definition.name).toBe('object');
      // additionalProperties:false is the promise; the ZodObject is what keeps
      // it, because only a ZodObject can be made strict by `guarded()`.
      expect(schema.additionalProperties, definition.name).toBe(false);
      expect(definition.zodSchema instanceof z.ZodObject, definition.name).toBe(true);

      // A required property that does not exist is a schema a host cannot fill.
      for (const required of schema.required ?? []) {
        expect(Object.keys(schema.properties ?? {}), `${definition.name}.${required}`).toContain(required);
      }
    }
  });

  it.each(TOOL_NAMES)('rejects an unknown property on %s', async (name) => {
    const manager = new WebMcpRegistrationManager(makeContext());
    const definition = manager.listDefinitions().find((candidate) => candidate.name === name)!;
    // Minimal VALID input plus one key the schema never declared: the tool must
    // fail on the extra key rather than quietly ignoring it.
    const input = { ...minimalToolInput(definition), [UNKNOWN_KEY]: 'not in the published schema' };

    const result = parseResult(await manager.executeLocal(name, input));
    expect(result.error, name).toBe('validation');
  });

  it.each(FORGED_APPROVAL_KEYS)(
    'rejects a forged %s property on every tool and leaves persisted state untouched',
    async (forgedKey) => {
      const workspace = unwrap(await createWorkspace({ name: 'Forged approval walk' }));
      const mission = unwrap(
        await createMission({
          workspaceId: workspace.id,
          title: 'Forged approval mission',
          objective: 'Give every tool a real target to aim the forged key at',
          definitionOfDone: ['Nothing changes'],
        }),
      );
      const graph = unwrap(
        await draftSkillGraph({
          workspaceId: workspace.id,
          name: 'Forged approval skill',
          purpose: 'Stay exactly as unapproved as it started',
          nodes: [{ kind: 'action', title: 'Do the work', goal: 'Produce the artifact' }],
        }),
      );
      const requested = unwrap(await requestSkillGraphApproval(graph.id, 'pending on purpose', 'user'));

      const graphBefore = await getSkillGraph(graph.id);
      const approvalsBefore = await getDb().approvals.toArray();

      const context = makeContext();
      context.workspaceId = workspace.id;
      context.missionId = mission.id;
      const manager = new WebMcpRegistrationManager(context);
      const ids = {
        skillId: graph.id,
        skillGraphId: graph.id,
        approvalId: requested.approval.id,
        missionId: mission.id,
      };

      for (const definition of manager.listDefinitions()) {
        const input = { ...minimalToolInput(definition, ids), [forgedKey]: true };
        const result = parseResult(await manager.executeLocal(definition.name, input));
        expect(result.error, `${definition.name} accepted ${forgedKey}`).toBe('validation');
      }

      // Rejection has to be total: no tool ran, so nothing moved. If a single
      // handler had executed with the forged key stripped, the graph or the
      // approval queue would show it.
      expect(await getSkillGraph(graph.id)).toEqual(graphBefore);
      expect(await getDb().approvals.toArray()).toEqual(approvalsBefore);
      expect(graphBefore?.status).not.toBe('approved');
      expect(graphBefore?.approvedRevision).toBeNull();
    },
  );

  it('returns a structurally stable error shape from every tool', async () => {
    const manager = new WebMcpRegistrationManager(makeContext());
    for (const definition of manager.listDefinitions()) {
      const shaped = (await manager.executeLocal(definition.name, {
        [UNKNOWN_KEY]: true,
      })) as ToolResultShape;

      // A host parses these; an error that was not JSON, or that omitted the
      // code, would leave an agent guessing what went wrong.
      expect(shaped.isError, definition.name).toBe(true);
      const parsed = JSON.parse(shaped.content[0]!.text) as Record<string, unknown>;
      expect(typeof parsed.error, definition.name).toBe('string');
      expect(typeof parsed.message, definition.name).toBe('string');
      if ('details' in parsed) {
        expect(typeof parsed.details, definition.name).toBe('object');
        expect(parsed.details, definition.name).not.toBeNull();
      }
    }
  });
});
