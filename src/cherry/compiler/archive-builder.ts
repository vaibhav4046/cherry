import JSZip from 'jszip';
import { getDb } from '../persistence/cherry-db.ts';
import { withWorkspaceTx } from '../persistence/transactions.ts';
import { sha256Bytes, sha256Canonical } from '../core/hash.ts';
import { ok, type Result } from '../core/result.ts';
import { invalid, notFound, approvalRequired } from '../core/errors.ts';
import type { SkillGraph } from '../skillgraph/skillgraph-model.ts';
import { listMemories } from '../memory/memory-service.ts';
import { listSkillEvidence } from '../skillgraph/skill-evidence.ts';
import { createProofReceipt } from '../proof/proof-service.ts';
import {
  buildEvidenceMarkdown,
  buildMemoryPolicyMarkdown,
  buildOriginalityPolicyMarkdown,
  buildSafetyPolicyMarkdown,
  buildSkillMarkdown,
  skillDirectoryName,
} from './skill-markdown.ts';
import { buildClaudeTarget, buildCodexTarget, buildVerifyScript } from './target-files.ts';
import {
  isSyntheticSampleGraph,
  labelSyntheticSampleMarkdown,
  SYNTHETIC_SAMPLE_NOTICE,
} from '../skillgraph/sample-state.ts';

export interface CompiledBundle {
  fileName: string;
  blob: Blob;
  sizeBytes: number;
  sha256: string;
  fileList: string[];
  receiptId: string;
}

/**
 * Compiles a real skill archive from current persisted state. Requires an
 * approved SkillGraph at its exact approved revision.
 */
export async function compileSkillBundle(skillGraphId: string): Promise<Result<CompiledBundle>> {
  const db = getDb();
  const graph = await db.skillGraphs.get(skillGraphId);
  if (!graph) return notFound('SkillGraph', skillGraphId);
  if (graph.status !== 'approved' || graph.approvedRevision !== graph.revision) {
    return approvalRequired('The skill graph must be approved at its current revision before compiling', {
      status: graph.status,
      revision: graph.revision,
      approvedRevision: graph.approvedRevision ?? null,
    });
  }

  if (!graph.missionId) return invalid('A verified mission is required before compiling this skill');
  const mission = await db.missions.get(graph.missionId);
  if (!mission) return notFound('Mission', graph.missionId);
  if (mission.skillGraphId !== graph.id) {
    return invalid('This mission is no longer bound to the requested skill');
  }
  const evidence = await listSkillEvidence(graph);
  const memories = await listMemories(graph.workspaceId, { status: 'approved' });

  const receiptResult = await createProofReceipt(graph.missionId);
  if (!receiptResult.ok) return receiptResult;
  const receipt = receiptResult.value;
  if (
    receipt.status !== 'verified'
    || receipt.skillGraphId !== graph.id
    || receipt.skillGraphRevision !== graph.revision
  ) {
    return invalid('Run checks against the current skill and files before compiling');
  }

  const directory = skillDirectoryName(graph);
  const sample = isSyntheticSampleGraph(graph);
  const labelSample = (content: string) => sample ? labelSyntheticSampleMarkdown(content) : content;
  const zip = new JSZip();
  const root = zip.folder(directory)!;

  const skillMd = labelSample(buildSkillMarkdown(graph, evidence, memories));
  root.file('SKILL.md', skillMd);
  root.file(
    'cherry.json',
    JSON.stringify(
      {
        generator: 'cherry',
        generatorVersion: '1.0.0',
        skillGraphId: graph.id,
        skillVersion: graph.version,
        skillRevision: graph.revision,
        approvedBy: graph.approvedBy,
        approvedAt: graph.approvedAt,
        sample,
        approvalKind: sample ? 'synthetic-sample-state' : 'human-decision',
        ...(sample ? { sampleNotice: SYNTHETIC_SAMPLE_NOTICE } : {}),
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  root.file('skillgraph.json', JSON.stringify(graph, null, 2));
  root.file('mission.json', JSON.stringify(mission, null, 2));
  root.file('receipt.json', JSON.stringify(receipt, null, 2));

  root.file(
    'agents/openai.yaml',
    [
      `name: ${directory}`,
      `description: ${graph.purpose.replace(/\n/g, ' ').slice(0, 300)}`,
      'entrypoint: SKILL.md',
      'kind: agent-skill',
      '',
    ].join('\n'),
  );

  root.file('references/evidence.md', buildEvidenceMarkdown(evidence));
  root.file('references/memory-policy.md', buildMemoryPolicyMarkdown(graph, memories));
  root.file(
    'references/principles.md',
    [
      '# Transferable principles',
      '',
      ...evidence
        .filter((record) => record.transferability === 'transferable')
        .map((record) => `- ${record.claim}`),
      '',
    ].join('\n'),
  );
  root.file(
    'references/observations.json',
    JSON.stringify(
      evidence.map((record) => ({
        id: record.id,
        claim: record.claim,
        sourceType: record.sourceType,
        timestampSeconds: record.timestampSeconds ?? null,
        trust: record.trust,
        transferability: record.transferability,
      })),
      null,
      2,
    ),
  );

  root.file('policies/safety.md', buildSafetyPolicyMarkdown(graph));
  root.file('policies/originality.md', buildOriginalityPolicyMarkdown());
  root.file(
    'policies/approvals.md',
    labelSample([
      '# Approval policy',
      '',
      sample
        ? 'The approval stored in this labelled sample is synthetic reference state, not a live human decision.'
        : `This skill was approved by ${graph.approvedBy ?? 'the user'} at revision ${graph.approvedRevision}.`,
      'Any edit to the skill graph invalidates that approval and requires a new one.',
      ...graph.humanGates.map((gate) => `- Gate: ${gate.title} (${gate.action}) — ${gate.reason}`),
      '',
    ].join('\n')),
  );

  root.file(
    'evals/acceptance-tests.json',
    JSON.stringify(
      graph.evaluations.map((evaluation) => ({
        id: evaluation.id,
        name: evaluation.name,
        type: evaluation.type,
        severity: evaluation.severity,
        config: evaluation.config,
      })),
      null,
      2,
    ),
  );
  root.file(
    'evals/routing-cases.json',
    JSON.stringify(
      {
        shouldTrigger: (graph.triggers ?? []).map((trigger) => trigger.description),
        shouldNotTrigger: ['Unrelated small talk', 'Tasks outside the declared purpose'],
      },
      null,
      2,
    ),
  );

  root.file('scripts/verify.mjs', buildVerifyScript());

  const codex = buildCodexTarget(graph, directory);
  root.file('targets/codex/AGENTS.md', labelSample(codex.agentsMd));
  root.file('targets/codex/install.md', labelSample(codex.installMd));

  const claude = buildClaudeTarget(graph, directory);
  root.file('targets/claude-code/CLAUDE.md', labelSample(claude.claudeMd));
  root.file('targets/claude-code/install.md', labelSample(claude.installMd));
  root.file('targets/claude-code/hooks.example.json', claude.hooksExample);
  root.file('targets/claude-code/agents/cherry-skill-agent.md', labelSample(claude.agentFile));

  // Manifest with per-file hashes so verify.mjs can check integrity offline.
  const fileList: string[] = [];
  const manifest: Record<string, string> = {};
  const paths = Object.keys(zip.files).filter((path) => !zip.files[path]!.dir);
  for (const path of paths.sort()) {
    const content = await zip.files[path]!.async('uint8array');
    const relative = path.startsWith(`${directory}/`) ? path.slice(directory.length + 1) : path;
    if (relative === 'MANIFEST.json') continue;
    manifest[relative] = await sha256Bytes(content);
    fileList.push(relative);
  }
  root.file('MANIFEST.json', JSON.stringify({ algorithm: 'SHA-256', files: manifest }, null, 2));

  const buffer = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const blob = new Blob([buffer.buffer as ArrayBuffer], { type: 'application/zip' });
  const sha256 = await sha256Bytes(buffer);
  const fileName = `${directory}-v${graph.version}.zip`;

  await withWorkspaceTx(graph.workspaceId, [], async (ctx) => {
    ctx.emit({
      type: 'export.created',
      actorType: 'system',
      objectType: 'export',
      objectId: graph.id,
      summary: `Skill bundle ${fileName} compiled (${buffer.length} bytes)`,
      payload: { fileName, sizeBytes: buffer.length, sha256, kind: 'agent-skill' },
    });
  });

  return ok({
    fileName,
    blob,
    sizeBytes: buffer.length,
    sha256,
    fileList: fileList.concat('MANIFEST.json'),
    receiptId: receipt?.receiptId ?? '',
  });
}

/** Quick structural validation used by tests and import. */
export async function validateBundleZip(data: Blob | Uint8Array): Promise<Result<{ directory: string; files: string[] }>> {
  const zip = await JSZip.loadAsync(data as never);
  const paths = Object.keys(zip.files).filter((path) => !zip.files[path]!.dir);
  if (paths.length === 0) return invalid('Archive is empty');

  for (const path of paths) {
    if (path.includes('..') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
      return invalid(`Archive contains an unsafe path: ${path}`);
    }
  }

  const rootDirs = new Set(paths.map((path) => path.split('/')[0]!));
  if (rootDirs.size !== 1) return invalid('Archive must contain exactly one top-level skill directory');
  const directory = [...rootDirs][0]!;

  const required = ['SKILL.md', 'cherry.json', 'skillgraph.json', 'scripts/verify.mjs', 'MANIFEST.json'];
  for (const requiredFile of required) {
    if (!zip.file(`${directory}/${requiredFile}`)) {
      return invalid(`Archive is missing required file ${requiredFile}`);
    }
  }

  const skillMd = await zip.file(`${directory}/SKILL.md`)!.async('string');
  const nameMatch = /^---\n(?:.*\n)*?name:\s*([a-z0-9-]+)\s*\n(?:.*\n)*?---/m.exec(skillMd);
  if (!nameMatch) return invalid('SKILL.md has no valid frontmatter name');
  if (nameMatch[1] !== directory) {
    return invalid(`SKILL.md name "${nameMatch[1]}" does not match directory "${directory}"`);
  }

  const graphJson = await zip.file(`${directory}/skillgraph.json`)!.async('string');
  let graph: SkillGraph;
  try {
    graph = JSON.parse(graphJson) as SkillGraph;
  } catch {
    return invalid('skillgraph.json is not valid JSON');
  }
  await sha256Canonical(graph); // ensures it is canonicalizable

  return ok({ directory, files: paths.map((path) => path.slice(directory.length + 1)) });
}
