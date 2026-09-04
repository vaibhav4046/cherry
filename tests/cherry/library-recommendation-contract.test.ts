import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { WebMcpRegistrationManager } from '../../src/cherry/webmcp/registration-manager.ts';
import type { ToolContext } from '../../src/cherry/webmcp/tool-definitions.ts';
import { createWorkspace } from '../../src/cherry/mission/mission-service.ts';
import {
  decideSkillGraphApproval,
  draftSkillGraph,
  listApprovals,
  requestSkillGraphApproval,
} from '../../src/cherry/skillgraph/skillgraph-service.ts';
import type { SkillGraph } from '../../src/cherry/skillgraph/skillgraph-model.ts';
import { sha256Text } from '../../src/cherry/core/hash.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import {
  SYNTHETIC_SAMPLE_APPROVER,
  SYNTHETIC_SAMPLE_NOTICE,
} from '../../src/cherry/skillgraph/sample-state.ts';

/**
 * The library tools are the only part of Cherry a visiting agent touches before
 * it trusts anything. Four promises hold that surface up, and this file locks
 * each one down against the real tool layer rather than the service beneath it:
 *
 *  1. A miss is answered honestly — an empty ranking plus a clearly UNRANKED
 *     shelf, never a confident-looking match invented to fill the response.
 *  2. Ranking is deterministic; two identical calls are byte-identical.
 *  3. Paging returns every skill exactly once — no duplicate, no omission.
 *  4. Sample state and live human approvals are never confusable, and the
 *     hashes an agent would pin an install to do not drift between reads.
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

function resultText(result: unknown): string {
  return (result as ToolResultShape).content[0]!.text;
}

const ONE_NODE = [
  { kind: 'action' as const, title: 'Do the work', goal: 'Produce the artifact this skill exists for' },
];

/** Draft a skill and, unless `decidedBy` is null, take it through a decision. */
async function makeSkill(
  workspaceId: string,
  name: string,
  purpose: string,
  decidedBy: string | null = 'user',
): Promise<SkillGraph> {
  const graph = unwrap(await draftSkillGraph({ workspaceId, name, purpose, nodes: ONE_NODE }));
  if (decidedBy === null) return graph;
  const requested = unwrap(await requestSkillGraphApproval(graph.id, 'library contract test', 'user'));
  return unwrap(await decideSkillGraphApproval(requested.approval.id, 'approved', decidedBy)).graph;
}

/** Five unrelated-to-sourdough skills, so a miss is a genuine miss. */
async function makeThumbnailLibrary(): Promise<string[]> {
  const workspace = unwrap(await createWorkspace({ name: 'Creator library' }));
  const ids: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    const graph = await makeSkill(
      workspace.id,
      `Thumbnail hierarchy ${index + 1}`,
      `Design a thumbnail around one dominant focal subject, variant ${index + 1}`,
    );
    ids.push(graph.id);
  }
  return ids;
}

describe('recommend_skills honesty contract', () => {
  beforeEach(() => {
    freshDb();
  });

  it('answers a miss with an empty ranking and an explicitly unranked shelf', async () => {
    await makeThumbnailLibrary();
    const manager = new WebMcpRegistrationManager(makeContext());

    const result = parseResult(
      await manager.executeLocal('recommend_skills', { task: 'proof a sourdough starter overnight' }),
    );

    // The ranking is empty ON PURPOSE. A stretched match here would be the
    // product lying about relevance, which is worse than saying "nothing fits".
    expect(result.recommendations).toEqual([]);
    expect(result.recommendationCount).toBe(0);
    expect(typeof result.librarySize).toBe('number');
    expect(result.librarySize).toBe(5);

    // But an agent holding a real library must never be told the shelf is bare.
    const shelf = result.availableSkills as Array<Record<string, unknown>>;
    expect(Array.isArray(shelf)).toBe(true);
    expect(shelf.length).toBeGreaterThan(0);
    expect(shelf.length).toBeLessThanOrEqual(3);
    expect(shelf.length).toBeLessThanOrEqual(result.librarySize as number);
    for (const entry of shelf) expect(typeof entry.skillId).toBe('string');

    // The note is the part that stops a host from reading the shelf as a match.
    const note = String(result.note);
    expect(note).toMatch(/unranked/i);
    expect(note).toMatch(/not claimed to fit/i);
    expect(note).toContain('recommendations is empty on purpose');
  });

  it('is deterministic: identical inputs produce byte-identical results', async () => {
    await makeThumbnailLibrary();
    const manager = new WebMcpRegistrationManager(makeContext());

    // Deterministic lexical ranking is the claim; a hidden model call or any
    // ordering that depended on iteration luck would break byte equality here.
    const first = resultText(await manager.executeLocal('recommend_skills', { task: 'design a thumbnail' }));
    const second = resultText(await manager.executeLocal('recommend_skills', { task: 'design a thumbnail' }));
    expect(second).toBe(first);

    const missedFirst = resultText(await manager.executeLocal('recommend_skills', { task: 'proof a sourdough starter' }));
    const missedSecond = resultText(await manager.executeLocal('recommend_skills', { task: 'proof a sourdough starter' }));
    expect(missedSecond).toBe(missedFirst);
  });
});

describe('list_skills paging and status contract', () => {
  beforeEach(() => {
    freshDb();
  });

  it('returns every skill exactly once across pages, with no duplicate and no omission', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Large library' }));
    const created: string[] = [];
    for (let index = 0; index < 20; index += 1) {
      // Half approved, half draft: paging must not depend on install readiness,
      // which is also the field the library sorts on.
      const graph = await makeSkill(
        workspace.id,
        `Library skill ${index + 1} with a name long enough to cost real response budget`,
        `Purpose ${index + 1}: a sentence long enough that a page cannot hold the whole library at once.`,
        index % 2 === 0 ? 'user' : null,
      );
      created.push(graph.id);
    }
    const manager = new WebMcpRegistrationManager(makeContext());

    const seen: string[] = [];
    let offset: number | null = 0;
    let pages = 0;
    while (offset !== null) {
      const page = parseResult(await manager.executeLocal('list_skills', { offset }));
      const skills = page.skills as Array<{ skillId: string }>;
      expect(page.totalCount).toBe(20);
      expect(page.offset).toBe(offset);
      expect(page.returnedCount).toBe(skills.length);
      expect(skills.length).toBeGreaterThan(0);
      seen.push(...skills.map((skill) => skill.skillId));
      offset = page.nextOffset as number | null;
      pages += 1;
      // A paging bug that never advanced would otherwise hang the suite.
      expect(pages).toBeLessThan(25);
    }

    expect(pages).toBeGreaterThan(1);
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort()).toEqual([...created].sort());
  });

  it("status 'approved' hides a live skill until a person actually decides", async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Awaiting a person' }));
    const graph = unwrap(
      await draftSkillGraph({
        workspaceId: workspace.id,
        name: 'Retention email sequence',
        purpose: 'Write churn-saving retention emails',
        nodes: ONE_NODE,
      }),
    );
    // Requested, not decided. This is the state an agent must never be able to
    // read as install-ready — asking is not the same as being told yes.
    unwrap(await requestSkillGraphApproval(graph.id, 'ready for a human to look at', 'user'));
    const manager = new WebMcpRegistrationManager(makeContext());

    const pending = parseResult(await manager.executeLocal('list_skills', { status: 'approved' }));
    expect(pending.totalCount).toBe(0);
    expect(pending.skills).toEqual([]);

    // It is still visible unfiltered, correctly marked as not install-ready.
    const unfiltered = parseResult(await manager.executeLocal('list_skills', {}));
    expect(unfiltered.skills).toEqual(
      expect.arrayContaining([expect.objectContaining({ skillId: graph.id, installReady: false })]),
    );

    const [approval] = await listApprovals(workspace.id);
    unwrap(await decideSkillGraphApproval(approval!.id, 'approved', 'user'));

    const approved = parseResult(await manager.executeLocal('list_skills', { status: 'approved' }));
    expect(approved.totalCount).toBe(1);
    expect(approved.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skillId: graph.id, installReady: true, approvalKind: 'human-decision' }),
      ]),
    );
  });
});

describe('sample state versus a live human decision', () => {
  beforeEach(() => {
    freshDb();
  });

  it('labels synthetic samples in list_skills, recommend_skills and get_skill alike', async () => {
    // Both skills live in the same workspace and both are "approved" in the
    // database. Only the durable approver distinguishes them, and every library
    // tool has to carry that distinction — a host that reads one tool and not
    // another must not be able to mistake shipped sample state for a decision.
    const workspace = unwrap(await createWorkspace({ name: 'Mixed provenance' }));
    const sample = await makeSkill(
      workspace.id,
      'Sample thumbnail method',
      'Demonstrate a thumbnail method without claiming a live decision',
      SYNTHETIC_SAMPLE_APPROVER,
    );
    const live = await makeSkill(
      workspace.id,
      'Live thumbnail method',
      'Design a thumbnail this person actually approved',
      'user',
    );
    const manager = new WebMcpRegistrationManager(makeContext());

    const listed = parseResult(await manager.executeLocal('list_skills', {}));
    expect(listed.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skillId: sample.id, sample: true, approvalKind: 'synthetic-sample-state' }),
        expect.objectContaining({ skillId: live.id, sample: false, approvalKind: 'human-decision' }),
      ]),
    );

    const recommended = parseResult(await manager.executeLocal('recommend_skills', { task: 'thumbnail method' }));
    const recommendations = recommended.recommendations as Array<Record<string, unknown>>;
    expect(recommendations.length).toBeGreaterThanOrEqual(2);
    expect(recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skillId: sample.id, sample: true, approvalKind: 'synthetic-sample-state' }),
        expect.objectContaining({ skillId: live.id, sample: false, approvalKind: 'human-decision' }),
      ]),
    );

    const sampleSummary = parseResult(await manager.executeLocal('get_skill', { skillId: sample.id }));
    expect(sampleSummary).toMatchObject({
      sample: true,
      approvalKind: 'synthetic-sample-state',
      sampleNotice: SYNTHETIC_SAMPLE_NOTICE,
    });
    const liveSummary = parseResult(await manager.executeLocal('get_skill', { skillId: live.id }));
    expect(liveSummary).toMatchObject({ sample: false, approvalKind: 'human-decision' });
    expect(liveSummary.sampleNotice).toBeUndefined();

    // The sample label survives into the installable file, not just the summary.
    const sampleFile = parseResult(
      await manager.executeLocal('get_skill', { skillId: sample.id, format: 'skill-md', part: 1 }),
    );
    expect(sampleFile).toMatchObject({ sample: true, approvalKind: 'synthetic-sample-state' });
    const liveFile = parseResult(
      await manager.executeLocal('get_skill', { skillId: live.id, format: 'skill-md', part: 1 }),
    );
    expect(liveFile).toMatchObject({ sample: false, approvalKind: 'human-decision' });
  });
});

describe('revision, approval hash and file hash stability', () => {
  beforeEach(() => {
    freshDb();
  });

  it('advertises a file hash that does not drift and that the reassembled parts reproduce', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Hash stability' }));
    const graph = await makeSkill(
      workspace.id,
      'Cold open scripting',
      'Script a thirty-second cold open that hooks a viewer before the title card',
    );
    const manager = new WebMcpRegistrationManager(makeContext());

    const first = parseResult(await manager.executeLocal('get_skill', { skillId: graph.id, format: 'skill-md' }));
    const second = parseResult(await manager.executeLocal('get_skill', { skillId: graph.id, format: 'skill-md' }));
    // An agent pins an install to this hash. If two identical reads disagreed,
    // every pin would be worthless.
    expect(typeof first.contentSha256).toBe('string');
    expect(second.contentSha256).toBe(first.contentSha256);
    expect(second.revision).toBe(first.revision);
    expect(second.totalParts).toBe(first.totalParts);

    const parts: string[] = [];
    for (let part = 1; part <= (first.totalParts as number); part += 1) {
      const chunk = parseResult(
        await manager.executeLocal('get_skill', { skillId: graph.id, format: 'skill-md', part }),
      );
      expect(chunk.contentSha256).toBe(first.contentSha256);
      parts.push(chunk.content as string);
    }
    // The advertised hash must describe the exact bytes the host receives,
    // not some pre-chunking, pre-redaction version of them.
    expect(await sha256Text(parts.join(''))).toBe(first.contentSha256);

    const listedOnce = parseResult(await manager.executeLocal('list_skills', {}));
    const listedTwice = parseResult(await manager.executeLocal('list_skills', {}));
    const entryOf = (payload: Record<string, unknown>) =>
      (payload.skills as Array<Record<string, unknown>>).find((skill) => skill.skillId === graph.id);
    expect(entryOf(listedOnce)).toMatchObject({ revision: graph.revision, installReady: true });
    expect(typeof entryOf(listedOnce)?.approvalHash).toBe('string');
    expect(entryOf(listedTwice)).toEqual(entryOf(listedOnce));
  });
});
