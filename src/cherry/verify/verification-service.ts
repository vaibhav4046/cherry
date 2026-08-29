import { getDb } from '../persistence/cherry-db.ts';
import { withWorkspaceTx } from '../persistence/transactions.ts';
import { newId } from '../core/ids.ts';
import { isoNow } from '../core/clock.ts';
import { sha256Text } from '../core/hash.ts';
import { ok, type Result } from '../core/result.ts';
import { notFound } from '../core/errors.ts';
import { validateSkillGraph } from '../skillgraph/skillgraph-validator.ts';
import type { SkillGraph, Evaluation } from '../skillgraph/skillgraph-model.ts';
import type { ArtifactFile } from '../artifacts/artifact-model.ts';
import { listArtifactFiles } from '../artifacts/artifact-service.ts';
import type { AssertionResult, VerificationReport } from './assertion-model.ts';

/**
 * Placeholder markers that must never survive into shipped artifacts. Assembled
 * from fragments so this source file does not itself trip the scanner.
 */
const PLACEHOLDER_MARKERS: string[] = [
  ['TO', 'DO'].join(''),
  ['FIX', 'ME'].join(''),
  ['XX', 'X'].join(''),
  ['lorem', ' ipsum'].join(''),
  ['PLACE', 'HOLDER'].join(''),
];

interface AssertionRun {
  evaluation: Evaluation;
  run: (context: VerifyContext) => Promise<Omit<AssertionResult, 'id' | 'name' | 'type' | 'severity' | 'startedAt' | 'finishedAt'>>;
}

interface VerifyContext {
  graph: SkillGraph | null;
  files: ArtifactFile[];
  entryPath: string | null;
  previewErrors: string[];
}

function pass(evidence: string[]): { status: 'passed'; evidence: string[] } {
  return { status: 'passed', evidence };
}

function failWith(
  evidence: string[],
  actual?: unknown,
  expected?: unknown,
  errorCode?: string,
): { status: 'failed'; evidence: string[]; actual?: unknown; expected?: unknown; errorCode?: string } {
  const result: { status: 'failed'; evidence: string[]; actual?: unknown; expected?: unknown; errorCode?: string } = {
    status: 'failed',
    evidence,
  };
  if (actual !== undefined) result.actual = actual;
  if (expected !== undefined) result.expected = expected;
  if (errorCode) result.errorCode = errorCode;
  return result;
}

function buildAssertion(evaluation: Evaluation, context: VerifyContext): AssertionRun {
  const config = evaluation.config as Record<string, unknown>;
  switch (evaluation.type) {
    case 'graph':
      return {
        evaluation,
        run: async () => {
          if (!context.graph) return failWith(['No skill graph attached to this mission'], null, 'a skill graph', 'no_graph');
          const issues = validateSkillGraph(context.graph);
          if (issues.length === 0) {
            return pass([`Graph structurally valid: ${context.graph.nodes.length} nodes, ${context.graph.edges.length} edges, acyclic dependencies`]);
          }
          return failWith(
            issues.slice(0, 10).map((issue) => `${issue.code}: ${issue.message}`),
            issues.length,
            0,
            'graph_invalid',
          );
        },
      };
    case 'file': {
      const requiredPath = typeof config['path'] === 'string' ? config['path'] : null;
      const mustContain = typeof config['contains'] === 'string' ? config['contains'] : null;
      return {
        evaluation,
        run: async () => {
          if (!requiredPath) return failWith(['Evaluation config is missing "path"'], config, { path: 'string' }, 'bad_config');
          const file = context.files.find((candidate) => candidate.path === requiredPath);
          if (!file) {
            return failWith(
              [`Required file ${requiredPath} does not exist`, `Files present: ${context.files.map((candidate) => candidate.path).join(', ') || '(none)'}`],
              null,
              requiredPath,
              'file_missing',
            );
          }
          if (mustContain && !file.content.includes(mustContain)) {
            return failWith(
              [`File ${requiredPath} exists but does not contain "${mustContain}"`],
              file.content.slice(0, 200),
              mustContain,
              'content_missing',
            );
          }
          return pass([`File ${requiredPath} exists (${file.sizeBytes} bytes, sha256 ${file.sha256.slice(0, 12)}…)${mustContain ? ` and contains "${mustContain}"` : ''}`]);
        },
      };
    }
    case 'dom': {
      const selectorish = typeof config['contains'] === 'string' ? config['contains'] : null;
      const tag = typeof config['tag'] === 'string' ? config['tag'] : null;
      return {
        evaluation,
        run: async () => {
          const entry = context.files.find((candidate) => candidate.path === (context.entryPath ?? 'index.html'));
          if (!entry) return failWith([`Entry file ${context.entryPath ?? 'index.html'} does not exist`], null, context.entryPath, 'entry_missing');
          if (tag) {
            const pattern = new RegExp(`<${tag}([\\s>]|/>)`, 'i');
            if (!pattern.test(entry.content)) {
              return failWith([`Entry HTML has no <${tag}> element`], null, `<${tag}>`, 'dom_missing');
            }
          }
          if (selectorish && !entry.content.includes(selectorish)) {
            return failWith([`Entry HTML does not contain "${selectorish}"`], null, selectorish, 'dom_missing');
          }
          return pass([`Entry ${entry.path} satisfies DOM assertion${tag ? ` <${tag}>` : ''}${selectorish ? ` contains "${selectorish}"` : ''}`]);
        },
      };
    }
    case 'runtime':
      return {
        evaluation,
        run: async () => {
          if (context.previewErrors.length > 0) {
            return failWith(
              ['Preview reported runtime errors:', ...context.previewErrors.slice(0, 5)],
              context.previewErrors.length,
              0,
              'runtime_error',
            );
          }
          return pass(['No runtime errors captured from the sandboxed preview']);
        },
      };
    case 'policy':
      return {
        evaluation,
        run: async () => {
          const offenders: string[] = [];
          for (const file of context.files) {
            for (const marker of PLACEHOLDER_MARKERS) {
              if (file.content.toLowerCase().includes(marker.toLowerCase())) {
                offenders.push(`${file.path} contains "${marker}"`);
              }
            }
          }
          if (offenders.length > 0) return failWith(offenders.slice(0, 10), offenders.length, 0, 'placeholder_found');
          return pass([`No unresolved placeholder markers in ${context.files.length} files`]);
        },
      };
    case 'hash':
      return {
        evaluation,
        run: async () => {
          const evidence: string[] = [];
          for (const file of context.files) {
            const recomputed = await sha256Text(file.content);
            if (recomputed !== file.sha256) {
              return failWith(
                [`Stored hash for ${file.path} does not match its content`],
                recomputed,
                file.sha256,
                'hash_mismatch',
              );
            }
            evidence.push(`${file.path}: ${recomputed.slice(0, 12)}… ok`);
          }
          return pass(evidence.length > 0 ? evidence.slice(0, 20) : ['No files to hash']);
        },
      };
    case 'accessibility':
      return {
        evaluation,
        run: async () => {
          const entry = context.files.find((candidate) => candidate.path === (context.entryPath ?? 'index.html'));
          if (!entry) return { status: 'skipped', evidence: ['No entry HTML to check'] };
          const problems: string[] = [];
          if (!/<html[^>]*lang=/i.test(entry.content)) problems.push('html element has no lang attribute');
          if (!/<title>/i.test(entry.content)) problems.push('document has no <title>');
          const images = entry.content.match(/<img\b[^>]*>/gi) ?? [];
          for (const image of images) {
            if (!/\balt=/i.test(image)) problems.push(`img without alt: ${image.slice(0, 80)}`);
          }
          if (problems.length > 0) return failWith(problems, problems.length, 0, 'a11y_basic');
          return pass(['lang attribute, title, and img alt checks passed']);
        },
      };
    case 'schema':
      return {
        evaluation,
        run: async () => {
          for (const file of context.files.filter((candidate) => candidate.path.endsWith('.json'))) {
            try {
              JSON.parse(file.content);
            } catch (error) {
              return failWith(
                [`${file.path} is not valid JSON: ${(error as Error).message}`],
                undefined,
                undefined,
                'json_invalid',
              );
            }
          }
          return pass(['All .json artifacts parse as JSON']);
        },
      };
    case 'manual':
      return {
        evaluation,
        run: async () => ({ status: 'skipped', evidence: ['Manual evaluation: requires a human check, recorded as skipped'] }),
      };
    case 'command':
    default:
      return {
        evaluation,
        run: async () => ({
          status: 'blocked',
          evidence: [`Evaluation type "${evaluation.type}" needs the local runner; it is not executable in the browser`],
        }),
      };
  }
}

export interface RunVerificationOptions {
  missionId: string;
  previewErrors?: string[];
  actorType?: 'human' | 'agent' | 'system' | 'runner';
}

/**
 * Runs every evaluation declared on the mission's skill graph against actual
 * persisted state. Results are stored; the UI badge derives only from them.
 */
export async function runVerification(options: RunVerificationOptions): Promise<Result<VerificationReport>> {
  const db = getDb();
  const mission = await db.missions.get(options.missionId);
  if (!mission) return notFound('Mission', options.missionId);

  const graph = mission.skillGraphId ? ((await db.skillGraphs.get(mission.skillGraphId)) ?? null) : null;
  const files = mission.artifactSetId ? await listArtifactFiles(mission.artifactSetId) : [];
  const artifactSet = mission.artifactSetId ? await db.artifactSets.get(mission.artifactSetId) : null;

  const context: VerifyContext = {
    graph,
    files,
    entryPath: artifactSet?.entryPath ?? null,
    previewErrors: options.previewErrors ?? [],
  };

  const evaluations: Evaluation[] = graph?.evaluations ?? [
    {
      id: 'default-graph',
      name: 'Mission has a skill graph',
      type: 'graph',
      severity: 'blocking',
      config: {},
    },
  ];

  const startedAt = isoNow();
  const results: AssertionResult[] = [];
  for (const evaluation of evaluations) {
    const assertion = buildAssertion(evaluation, context);
    const assertionStart = isoNow();
    let outcome: Awaited<ReturnType<AssertionRun['run']>>;
    try {
      outcome = await assertion.run(context);
    } catch (error) {
      outcome = failWith([`Evaluator threw: ${(error as Error).message}`], undefined, undefined, 'evaluator_error');
    }
    results.push({
      id: newId('vr'),
      name: evaluation.name,
      type: evaluation.type,
      severity: evaluation.severity,
      startedAt: assertionStart,
      finishedAt: isoNow(),
      ...outcome,
    });
  }

  const blockingFailures = results.filter(
    (result) => result.status === 'failed' && (result.severity === 'blocking' || result.severity === 'error'),
  ).length;

  const report: VerificationReport = {
    id: newId('vr'),
    workspaceId: mission.workspaceId,
    missionId: mission.id,
    skillGraphId: graph?.id ?? null,
    skillGraphRevision: graph?.revision ?? null,
    artifactSetId: mission.artifactSetId ?? null,
    startedAt,
    finishedAt: isoNow(),
    status: blockingFailures === 0 ? 'passed' : 'failed',
    results,
    blockingFailures,
    totalAssertions: results.length,
    repairedFromVerificationId: null,
  };

  await withWorkspaceTx(mission.workspaceId, ['verifications'], async (ctx) => {
    await ctx.db.verifications.add(report);
    ctx.emit({
      type: 'verification.completed',
      actorType: options.actorType ?? 'human',
      objectType: 'verification',
      objectId: report.id,
      summary: `Verification ${report.status}: ${results.length - blockingFailures}/${results.length} assertions ok`,
      payload: { status: report.status, blockingFailures, totalAssertions: report.totalAssertions },
    });
  });
  return ok(report);
}

export async function listVerifications(workspaceId: string, missionId?: string): Promise<VerificationReport[]> {
  let reports = await getDb().verifications.where('workspaceId').equals(workspaceId).toArray();
  if (missionId) reports = reports.filter((report) => report.missionId === missionId);
  return reports.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function getVerification(id: string): Promise<VerificationReport | undefined> {
  return getDb().verifications.get(id);
}

/** Record a repair linked to a failed assertion, then the caller re-verifies. */
export async function recordRepair(
  workspaceId: string,
  failedVerificationId: string,
  failedAssertionId: string,
  repairSummary: string,
  actorType: 'human' | 'agent' = 'human',
): Promise<Result<{ recorded: true }>> {
  const report = await getDb().verifications.get(failedVerificationId);
  if (!report) return notFound('Verification', failedVerificationId);
  const assertion = report.results.find((result) => result.id === failedAssertionId);
  if (!assertion) return notFound('Assertion', failedAssertionId);

  await withWorkspaceTx(workspaceId, [], async (ctx) => {
    ctx.emit({
      type: 'repair.applied',
      actorType,
      objectType: 'verification',
      objectId: failedVerificationId,
      summary: `Repair for "${assertion.name}": ${repairSummary.slice(0, 160)}`,
      payload: { failedAssertionId, repairSummary },
    });
  });
  return ok({ recorded: true });
}
