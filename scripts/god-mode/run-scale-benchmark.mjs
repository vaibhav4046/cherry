#!/usr/bin/env node
/**
 * God Mode scale benchmark.
 *
 * Generates the deterministic corpus (or reuses --corpus), ingests it in
 * bounded batches through the storage pipeline, runs the answer-key queries,
 * exercises restart recovery and cancellation on separate stores, and writes
 * <out>/god-mode-scale.json and <out>/god-mode-scale.md. Missed targets are
 * reported, never hidden. Hard invariants set the exit code.
 *
 * child_process is imported here for exactly one call, `git rev-parse HEAD`,
 * made before any record is read. The modules that touch record bodies
 * (runner/lib/storage/*.mjs and generate-corpus.mjs) never import it, and the
 * static check below proves that on every run.
 *
 *   node scripts/god-mode/run-scale-benchmark.mjs --documents 1000 --media 1000 --seed 20260902 [--out docs/release/benchmarks] [--batch 50] [--corpus <dir>] [--keep]
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, tmpdir, totalmem } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { IngestPipeline, listSources } from '../../runner/lib/storage/ingest-pipeline.mjs';
import { RecordIndex, TRUST_LEVELS } from '../../runner/lib/storage/record-index.mjs';
import { DEFAULT_SEED, generateCorpus } from './generate-corpus.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const STORAGE_DIR = join(repoRoot, 'runner', 'lib', 'storage');
const THREE_HOURS_SECONDS = 3 * 60 * 60;
const TOP_K = 5;
const TARGETS = Object.freeze({ retrievalP95Ms: 1000, retrievalSuccessRate: 0.95, ingestP95Ms: 100 });
const FORBIDDEN_TOKENS = [
  { token: 'eval(', pattern: /\beval\s*\(/ },
  { token: 'new Function', pattern: /\bnew\s+Function\b/ },
  { token: 'Function(', pattern: /\bFunction\s*\(/ },
  { token: 'child_process', pattern: /child_process/ },
  { token: 'node:vm', pattern: /['"]node:vm['"]/ },
  { token: 'fetch(', pattern: /\bfetch\s*\(/ },
  { token: 'dynamic import()', pattern: /\bimport\s*\(/ },
  { token: 'node:http(s)', pattern: /node:https?\b/ },
  { token: 'node:net', pattern: /node:net\b/ },
  { token: 'WebSocket', pattern: /\bWebSocket\b/ },
];
const NO_EXECUTION_STATEMENT =
  'The modules that read record bodies (runner/lib/storage/*.mjs and scripts/god-mode/generate-corpus.mjs) never import child_process, vm, http, net or WebSocket and never call eval, Function, fetch or a dynamic import. No ingested body can reach an execution or network path because none exists in that code. The benchmark driver imports child_process for one call, git rev-parse HEAD, made before any record is read.';

export async function runBenchmark({
  documents = 1000,
  media = 1000,
  seed = DEFAULT_SEED,
  out = 'docs/release/benchmarks',
  batch = 50,
  corpus = null,
  tmpRoot = process.env.CHERRY_SCALE_TMP || tmpdir(),
  quiet = false,
  keep = false,
  command = null,
} = {}) {
  const log = quiet ? () => {} : (line) => console.log(line);
  const temporaries = [];
  const makeTemp = (label) => {
    const dir = mkdtempSync(join(tmpRoot, `cherry-scale-${label}-`));
    temporaries.push(dir);
    return dir;
  };
  const startedAt = new Date().toISOString();
  const machine = machineFacts();
  try {
    let corpusDir = corpus ? resolve(corpus) : null;
    let manifest;
    let generationMs = 0;
    let corpusSource;
    if (corpusDir && existsSync(join(corpusDir, 'manifest.json'))) {
      manifest = JSON.parse(readFileSync(join(corpusDir, 'manifest.json'), 'utf8'));
      corpusSource = 'reused --corpus directory';
      log(`reusing corpus at ${corpusDir} (${manifest.totals.records} records)`);
    } else {
      corpusDir = corpusDir ?? makeTemp('corpus');
      const started = performance.now();
      manifest = generateCorpus({ outDir: corpusDir, documents, media, seed });
      generationMs = performance.now() - started;
      corpusSource = corpus ? 'generated into --corpus directory' : 'generated into a temporary directory, deleted after the run';
      log(`generated ${manifest.totals.records} records (${formatBytes(manifest.totals.bytes)}) in ${generationMs.toFixed(0)} ms`);
    }
    const byId = new Map(manifest.records.map((entry) => [entry.id, entry]));
    const manifestSha256 = createHash('sha256').update(readFileSync(join(corpusDir, 'manifest.json'))).digest('hex');
    const sources = listSources(corpusDir);

    const storeDir = makeTemp('store');
    const storeBytesBefore = directoryBytes(storeDir);
    const main = await measuredRun({ storeDir, sources, batch });
    log(`ingested ${main.summary.processed} records in ${main.totalMs.toFixed(0)} ms (${(main.summary.processed / (main.totalMs / 1000)).toFixed(1)} records/s)`);
    const checks = await checkAgainstManifest(main.pipeline, main.summary, manifest);
    const retrieval = runRetrieval(main.pipeline.index, manifest, byId);
    log(`retrieval ${retrieval.hits}/${retrieval.queries} in top ${TOP_K}, p95 ${retrieval.latencyMs.p95} ms`);
    const disk = {
      storeBytesBefore,
      storeBytesAfter: directoryBytes(storeDir),
      indexBytes: statSync(join(storeDir, 'metadata', 'records.jsonl')).size,
      objects: countObjects(main.pipeline.cas),
    };
    disk.growthBytes = disk.storeBytesAfter - disk.storeBytesBefore;
    const restartRecovery = await restartScenario({ storeDir: makeTemp('restart'), sources, batch, reference: main.idToHash });
    log(`restart recovery: crashed at record ${restartRecovery.crashedAtRecord}, resumed with ${restartRecovery.duplicateAcceptedRecords} duplicate accepted records`);
    const cancellation = await cancellationScenario({ storeDir: makeTemp('cancel'), sources, batch });
    log(`cancellation: aborted at record ${cancellation.abortedAtRecord}, index consistent ${cancellation.consistent}`);
    const noExecutionPath = staticNoExecutionCheck();

    const ingest = {
      totalMs: round(main.totalMs),
      recordsPerSecond: round(main.summary.processed / (main.totalMs / 1000)),
      processed: main.summary.processed,
      accepted: main.summary.accepted,
      batchSize: batch,
      batches: main.summary.batches,
      latencyMs: percentiles(main.latencies),
      memory: main.memory,
      disk,
      generationMs: round(generationMs),
      ...checks,
    };
    const targets = buildTargets({ ingest, retrieval, restartRecovery, cancellation, noExecutionPath });
    const report = {
      schemaVersion: 1,
      title: 'God Mode scale benchmark',
      scope: `A ${manifest.totals.records}-record local benchmark on one machine. It is not evidence for any larger claim.`,
      startedAt,
      finishedAt: new Date().toISOString(),
      command: command ?? defaultCommand({ documents, media, seed, out, batch }),
      machine,
      corpus: {
        seed: manifest.seed,
        manifestSha256,
        documents: manifest.counts.documents,
        media: manifest.counts.media,
        records: manifest.totals.records,
        bytes: manifest.totals.bytes,
        categories: manifest.categories,
        source: corpusSource,
        ingestOrder: 'sorted by record id; ids are a seeded permutation, so originals do not necessarily precede their duplicates',
      },
      ingest,
      retrieval,
      restartRecovery,
      cancellation,
      noExecutionPath,
      targets,
      invariantsHold: targets.filter((target) => target.kind === 'invariant').every((target) => target.met),
    };
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'god-mode-scale.json'), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(join(out, 'god-mode-scale.md'), renderMarkdown(report));
    log(renderSummary(report));
    return report;
  } finally {
    if (!keep) {
      for (const dir of temporaries) {
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch {
          /* windows file locks */
        }
      }
    }
  }
}

async function measuredRun({ storeDir, sources, batch }) {
  const pipeline = new IngestPipeline({ storeDir });
  const samples = [process.memoryUsage()];
  const started = performance.now();
  const summary = await pipeline.run(sources, {
    batchSize: batch,
    onBatch: ({ memory }) => {
      samples.push(memory);
    },
  });
  const totalMs = performance.now() - started;
  const idToHash = new Map([...pipeline.index.records()].map((record) => [record.id, record.contentHash]));
  return {
    pipeline,
    summary,
    totalMs,
    latencies: summary.outcomes.map((outcome) => outcome.latencyMs),
    memory: {
      peakRssBytes: Math.max(...samples.map((sample) => sample.rss)),
      peakHeapUsedBytes: Math.max(...samples.map((sample) => sample.heapUsed)),
      samples: samples.length,
      sampling: 'process.memoryUsage() before the run and after every batch',
    },
    idToHash,
  };
}

async function checkAgainstManifest(pipeline, summary, manifest) {
  const { index, cas } = pipeline;
  const outcomes = new Map(summary.outcomes.map((outcome) => [outcome.id, outcome]));
  const category = (name) => manifest.records.filter((entry) => entry.category === name);

  const injectedExact = category('exact_duplicate');
  let eliminated = 0;
  for (const entry of injectedExact) {
    const statuses = [outcomes.get(entry.id)?.status, outcomes.get(entry.duplicateOf)?.status].sort();
    if (statuses[0] === 'accepted' && statuses[1] === 'duplicate' && index.findByContentHash(entry.sha256)) eliminated += 1;
  }
  const exactDuplicates = {
    injected: injectedExact.length,
    eliminated,
    percentage: injectedExact.length ? round((100 * eliminated) / injectedExact.length) : 100,
    duplicateOutcomes: summary.duplicates,
    note: 'a pair counts as eliminated when exactly one member is accepted, the other is reported duplicate, and one object holds the shared hash',
  };

  const injectedNear = category('near_duplicate');
  let linked = 0;
  for (const entry of injectedNear) {
    const mine = index.findById(entry.id);
    const original = index.findById(entry.nearDuplicateOf);
    if (mine && original && (mine.nearDuplicateOf === original.id || original.nearDuplicateOf === mine.id)) linked += 1;
  }
  const totalLinks = [...index.records()].filter((record) => record.nearDuplicateOf).length;
  const nearDuplicates = {
    injected: injectedNear.length,
    linked,
    totalLinks,
    falseLinks: totalLinks - linked,
    method: 'bottom-32 sketch of word 5-shingles selects candidates; exact shingle Jaccard over both bodies must exceed 0.9',
  };

  const isolatedRecords = summary.outcomes
    .filter((outcome) => outcome.status === 'isolated')
    .map((outcome) => ({ id: outcome.id, kind: outcome.kind, reason: outcome.reason, detail: outcome.detail ?? '' }));
  const byReason = {};
  for (const item of isolatedRecords) byReason[item.reason] = (byReason[item.reason] ?? 0) + 1;
  const expectedIsolated = manifest.records.filter((entry) => entry.expectedOutcome === 'isolated');
  const isolated = {
    count: isolatedRecords.length,
    injected: expectedIsolated.length,
    isolatedWithExpectedReason: expectedIsolated.filter((entry) => outcomes.get(entry.id)?.status === 'isolated' && outcomes.get(entry.id)?.reason === entry.expectedReason).length,
    byReason,
    records: isolatedRecords,
    note: 'each corrupt record is reported individually and the batch continues',
  };

  const hostileEntries = category('hostile');
  let inert = 0;
  let verbatim = 0;
  for (const entry of hostileEntries) {
    const stored = index.findById(entry.id);
    if (!stored || stored.trust !== 'untrusted') continue;
    inert += 1;
    if (stored.contentHash === entry.sha256 && (await cas.verify(stored.contentHash)).ok) verbatim += 1;
  }
  const hostile = {
    injected: hostileEntries.length,
    acceptedAsInertText: inert,
    storedVerbatim: verbatim,
    note: 'verbatim means the stored object re-hashes to the SHA-256 of the source bytes; trust stays untrusted; no classifier runs',
  };

  let keyChecked = 0;
  let keyMatched = 0;
  for (const entry of manifest.records) {
    if (!entry.expectedKeys) continue;
    const stored = index.findById(entry.id);
    if (!stored) continue;
    keyChecked += 1;
    if (sameSet(stored.meta.keys, entry.expectedKeys)) keyMatched += 1;
  }
  const keyExtraction = { checked: keyChecked, matched: keyMatched, rate: keyChecked ? round(keyMatched / keyChecked, 4) : 1 };

  let missing = 0;
  for (const record of index.records()) if (!record.sourceId || !TRUST_LEVELS.includes(record.trust)) missing += 1;
  const provenance = { acceptedRecords: index.count(), missingSourceIdOrTrust: missing };

  const malformed = category('malformed');
  const malformedFlagged = malformed.filter((entry) => {
    const stored = index.findById(entry.id);
    return stored && entry.expectedWarnings.every((warning) => stored.meta.warnings.includes(warning));
  }).length;
  const longEntries = category('long');
  const longOk = longEntries.filter((entry) => index.findById(entry.id)?.meta.durationSeconds > THREE_HOURS_SECONDS).length;
  const metadataOnly = category('metadata_only');
  const metadataOnlyOk = metadataOnly.filter((entry) => index.findById(entry.id)?.contentHash === entry.sha256).length;
  const largeEntries = category('large');
  const largeOk = largeEntries.filter((entry) => index.findById(entry.id)?.contentHash === entry.sha256).length;
  const unicodeEntries = category('unicode');
  const unicodeOk = unicodeEntries.filter((entry) => index.findById(entry.id)?.contentHash === entry.sha256).length;

  return {
    exactDuplicates,
    nearDuplicates,
    isolated,
    hostile,
    keyExtraction,
    provenance,
    media: {
      malformed: { injected: malformed.length, acceptedWithExpectedWarnings: malformedFlagged },
      long: { injected: longEntries.length, acceptedOverThreeHours: longOk },
      metadataOnly: { injected: metadataOnly.length, acceptedWithMetadataHash: metadataOnlyOk },
    },
    documents: {
      large: { injected: largeEntries.length, acceptedWithSourceHash: largeOk },
      unicode: { injected: unicodeEntries.length, acceptedWithSourceHash: unicodeOk },
    },
    maxSingleRecordBytes: Math.max(0, ...summary.outcomes.map((outcome) => outcome.byteLength ?? 0)),
  };
}

function runRetrieval(index, manifest, byId) {
  const latencies = [];
  let queries = 0;
  let hits = 0;
  const sampleMisses = [];
  for (const entry of manifest.records) {
    for (const query of entry.queries ?? []) {
      queries += 1;
      const expected = byId.get(query.expectedId);
      const canonical = index.findByContentHash(expected.sha256)?.id ?? null;
      const started = performance.now();
      const top = index.search(query.query, { limit: TOP_K });
      latencies.push(performance.now() - started);
      if (canonical && top.some((hit) => hit.record.id === canonical)) hits += 1;
      else if (sampleMisses.length < 10) sampleMisses.push({ query: query.query, expectedId: canonical ?? query.expectedId, top: top.map((hit) => hit.record.id) });
    }
  }
  return {
    queries,
    hits,
    successRate: queries ? round(hits / queries, 4) : 0,
    topK: TOP_K,
    latencyMs: percentiles(latencies),
    method: 'BM25 over tokenised title and tags only; bodies are never indexed for search',
    sampleMisses,
  };
}

async function restartScenario({ storeDir, sources, batch, reference }) {
  const crashedAtRecord = Math.min(sources.length, 3 * batch + Math.floor(batch / 3));
  let seen = 0;
  const first = new IngestPipeline({ storeDir });
  let crashed = false;
  try {
    await first.run(sources, {
      batchSize: batch,
      onRecord: () => {
        seen += 1;
        if (seen === crashedAtRecord) throw new Error('simulated crash');
      },
    });
  } catch (error) {
    if (!/simulated crash/.test(error.message)) throw error;
    crashed = true;
  }
  const acceptedBeforeCrash = first.index.count();
  const resumed = new IngestPipeline({ storeDir });
  const summary = await resumed.run(sources, { batchSize: batch });
  const records = [...resumed.index.records()];
  const ids = new Set(records.map((record) => record.id));
  const hashes = new Set(records.map((record) => record.contentHash));
  const idToHash = new Map(records.map((record) => [record.id, record.contentHash]));
  const matchesUninterruptedRun = idToHash.size === reference.size && [...reference].every(([id, hash]) => idToHash.get(id) === hash);
  return {
    method: 'throw from the per-record hook mid-batch, construct a fresh pipeline over the same store directory, run every source again',
    crashed,
    crashedAtRecord,
    batchesCompletedBeforeCrash: Math.floor((crashedAtRecord - 1) / batch),
    crashedMidBatch: crashedAtRecord % batch !== 0,
    acceptedBeforeCrash,
    recoveredFromIndex: resumed.index.count(),
    skippedOnResume: summary.skipped,
    acceptedAfterResume: records.length,
    duplicateAcceptedRecords: records.length - ids.size + (records.length - hashes.size),
    matchesUninterruptedRun,
  };
}

async function cancellationScenario({ storeDir, sources, batch }) {
  const abortedAtRecord = Math.min(sources.length, 2 * batch + Math.floor(batch / 4));
  const controller = new AbortController();
  let seen = 0;
  const pipeline = new IngestPipeline({ storeDir });
  const summary = await pipeline.run(sources, {
    batchSize: batch,
    signal: controller.signal,
    onRecord: () => {
      seen += 1;
      if (seen === abortedAtRecord) controller.abort();
    },
  });
  const reloaded = new RecordIndex(join(storeDir, 'metadata', 'records.jsonl'));
  return {
    method: 'AbortController aborted from the per-record hook mid-batch; the pipeline checks the signal before every record',
    abortedAtRecord,
    abortedMidBatch: abortedAtRecord % batch !== 0,
    status: summary.status,
    processed: summary.processed,
    acceptedAtAbort: summary.accepted,
    recoveredRecords: reloaded.count(),
    recoverWarnings: reloaded.warnings.length,
    consistent: summary.status === 'cancelled' && summary.processed === abortedAtRecord && reloaded.count() === summary.accepted && reloaded.warnings.length === 0,
  };
}

function staticNoExecutionCheck() {
  const files = [...readdirSync(STORAGE_DIR).map((name) => `runner/lib/storage/${name}`), 'scripts/god-mode/generate-corpus.mjs'];
  const violations = [];
  for (const file of files) {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    for (const { token, pattern } of FORBIDDEN_TOKENS) if (pattern.test(source)) violations.push({ file, token });
  }
  return { files, forbiddenTokens: FORBIDDEN_TOKENS.map((entry) => entry.token), violations, ok: violations.length === 0, statement: NO_EXECUTION_STATEMENT };
}

function buildTargets({ ingest, retrieval, restartRecovery, cancellation, noExecutionPath }) {
  return [
    { kind: 'invariant', name: 'exact duplicates eliminated', target: '100%', actual: `${ingest.exactDuplicates.percentage}% (${ingest.exactDuplicates.eliminated} of ${ingest.exactDuplicates.injected})`, met: ingest.exactDuplicates.percentage === 100 },
    { kind: 'invariant', name: 'near duplicates linked, no false links', target: `${ingest.nearDuplicates.injected} linked, 0 false`, actual: `${ingest.nearDuplicates.linked} linked, ${ingest.nearDuplicates.falseLinks} false`, met: ingest.nearDuplicates.linked === ingest.nearDuplicates.injected && ingest.nearDuplicates.falseLinks === 0 },
    { kind: 'invariant', name: 'corrupt records isolated with the expected reason', target: `${ingest.isolated.injected}`, actual: `${ingest.isolated.isolatedWithExpectedReason} of ${ingest.isolated.injected} (${ingest.isolated.count} isolated in total)`, met: ingest.isolated.isolatedWithExpectedReason === ingest.isolated.injected && ingest.isolated.count === ingest.isolated.injected },
    { kind: 'invariant', name: 'hostile records inert and stored verbatim', target: `${ingest.hostile.injected}`, actual: `${ingest.hostile.acceptedAsInertText} inert, ${ingest.hostile.storedVerbatim} verbatim`, met: ingest.hostile.acceptedAsInertText === ingest.hostile.injected && ingest.hostile.storedVerbatim === ingest.hostile.injected },
    { kind: 'invariant', name: 'restart recovery without duplicate accepted records', target: '0 duplicates, same result as the uninterrupted run', actual: `${restartRecovery.duplicateAcceptedRecords} duplicates, matches ${restartRecovery.matchesUninterruptedRun}`, met: restartRecovery.crashed && restartRecovery.duplicateAcceptedRecords === 0 && restartRecovery.matchesUninterruptedRun },
    { kind: 'invariant', name: 'cancellation leaves the index consistent', target: 'consistent', actual: String(cancellation.consistent), met: cancellation.consistent },
    { kind: 'invariant', name: 'provenance on every accepted record', target: '0 missing', actual: `${ingest.provenance.missingSourceIdOrTrust} missing of ${ingest.provenance.acceptedRecords}`, met: ingest.provenance.missingSourceIdOrTrust === 0 },
    { kind: 'invariant', name: 'no execution or network path for bodies', target: '0 forbidden tokens', actual: `${noExecutionPath.violations.length} violations`, met: noExecutionPath.ok },
    { kind: 'invariant', name: 'entity and step keys extracted as expected', target: '100%', actual: `${ingest.keyExtraction.matched} of ${ingest.keyExtraction.checked}`, met: ingest.keyExtraction.matched === ingest.keyExtraction.checked },
    { kind: 'target', name: `retrieval p95 under ${TARGETS.retrievalP95Ms} ms`, target: `< ${TARGETS.retrievalP95Ms} ms`, actual: `${retrieval.latencyMs.p95} ms`, met: retrieval.latencyMs.p95 < TARGETS.retrievalP95Ms },
    { kind: 'target', name: `retrieval answer key in top ${TOP_K}`, target: `>= ${TARGETS.retrievalSuccessRate * 100}%`, actual: `${round(retrieval.successRate * 100)}% (${retrieval.hits} of ${retrieval.queries})`, met: retrieval.successRate >= TARGETS.retrievalSuccessRate },
    { kind: 'target', name: `ingest p95 under ${TARGETS.ingestP95Ms} ms per record (harness-chosen)`, target: `< ${TARGETS.ingestP95Ms} ms`, actual: `${ingest.latencyMs.p95} ms`, met: ingest.latencyMs.p95 < TARGETS.ingestP95Ms },
  ];
}

function machineFacts() {
  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    /* not a git checkout */
  }
  const [first] = cpus();
  return {
    cpu: first?.model?.trim() ?? 'unknown',
    cores: cpus().length,
    totalMemoryBytes: totalmem(),
    platform: platform(),
    release: release(),
    arch: arch(),
    node: process.version,
    commit,
  };
}

function percentiles(values) {
  if (values.length === 0) return { count: 0, p50: 0, p95: 0, p99: 0, max: 0, mean: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
  return {
    count: sorted.length,
    p50: round(rank(50), 3),
    p95: round(rank(95), 3),
    p99: round(rank(99), 3),
    max: round(sorted[sorted.length - 1], 3),
    mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length, 3),
  };
}

function directoryBytes(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += directoryBytes(path);
    else if (entry.isFile()) total += statSync(path).size;
  }
  return total;
}

function countObjects(cas) {
  let objects = 0;
  let cursor = null;
  do {
    const page = cas.list({ cursor, limit: 500 });
    objects += page.hashes.length;
    cursor = page.nextCursor;
  } while (cursor);
  return objects;
}

function sameSet(a, b) {
  const left = [...a].sort();
  const right = [...b].sort();
  return left.length === right.length && left.every((value, i) => value === right[i]);
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${round(bytes / 1024, 1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${round(bytes / (1024 * 1024), 1)} MiB`;
  return `${round(bytes / (1024 * 1024 * 1024), 2)} GiB`;
}

function defaultCommand({ documents, media, seed, out, batch }) {
  return `node scripts/god-mode/run-scale-benchmark.mjs --documents ${documents} --media ${media} --seed ${seed} --out ${out} --batch ${batch}`;
}

function renderSummary(report) {
  const { ingest, retrieval, restartRecovery, cancellation } = report;
  const lines = [
    '',
    `God Mode scale benchmark (${report.corpus.records} records, seed ${report.corpus.seed}) on ${report.machine.cpu}, node ${report.machine.node}, commit ${report.machine.commit.slice(0, 12)}`,
    `ingest       ${ingest.totalMs} ms total, ${ingest.recordsPerSecond} records/s, p50 ${ingest.latencyMs.p50} ms, p95 ${ingest.latencyMs.p95} ms, p99 ${ingest.latencyMs.p99} ms, batch ${ingest.batchSize}`,
    `memory       peak RSS ${formatBytes(ingest.memory.peakRssBytes)}, peak heap ${formatBytes(ingest.memory.peakHeapUsedBytes)}; store grew ${formatBytes(ingest.disk.growthBytes)} (${ingest.disk.objects} objects)`,
    `duplicates   exact ${ingest.exactDuplicates.eliminated}/${ingest.exactDuplicates.injected} eliminated (${ingest.exactDuplicates.percentage}%), near ${ingest.nearDuplicates.linked}/${ingest.nearDuplicates.injected} linked, ${ingest.nearDuplicates.falseLinks} false links`,
    `isolation    ${ingest.isolated.count} corrupt records isolated (${Object.entries(ingest.isolated.byReason).map(([reason, count]) => `${reason} ${count}`).join(', ')})`,
    `hostile      ${ingest.hostile.acceptedAsInertText}/${ingest.hostile.injected} accepted as inert text, ${ingest.hostile.storedVerbatim} stored verbatim`,
    `retrieval    ${retrieval.hits}/${retrieval.queries} answer keys in top ${retrieval.topK} (${round(retrieval.successRate * 100)}%), p50 ${retrieval.latencyMs.p50} ms, p95 ${retrieval.latencyMs.p95} ms, p99 ${retrieval.latencyMs.p99} ms`,
    `restart      crashed at record ${restartRecovery.crashedAtRecord}, ${restartRecovery.duplicateAcceptedRecords} duplicate accepted records after resume, matches uninterrupted run ${restartRecovery.matchesUninterruptedRun}`,
    `cancel       aborted at record ${cancellation.abortedAtRecord}, index consistent ${cancellation.consistent}`,
    '',
    ...report.targets.map((target) => `${target.met ? 'met   ' : 'MISSED'} [${target.kind}] ${target.name}: ${target.actual} (target ${target.target})`),
    '',
    report.invariantsHold ? 'all invariants hold' : 'INVARIANT FAILURE: see the targets above',
    report.scope,
  ];
  return lines.join('\n');
}

function renderMarkdown(report) {
  const { ingest, retrieval, restartRecovery, cancellation, machine, corpus } = report;
  const row = (label, value) => `| ${label} | ${value} |`;
  const lines = [
    '# God Mode scale benchmark',
    '',
    report.scope,
    '',
    `Generated ${report.finishedAt} by \`${report.command}\` on commit \`${machine.commit}\`.`,
    '',
    '## Machine',
    '',
    '| Fact | Value |',
    '| --- | --- |',
    row('CPU', `${machine.cpu} (${machine.cores} logical cores)`),
    row('Memory', formatBytes(machine.totalMemoryBytes)),
    row('Platform', `${machine.platform} ${machine.release} ${machine.arch}`),
    row('Node', machine.node),
    '',
    '## Corpus',
    '',
    '| Fact | Value |',
    '| --- | --- |',
    row('Seed', corpus.seed),
    row('Manifest SHA-256', `\`${corpus.manifestSha256}\``),
    row('Records', `${corpus.records} (${corpus.documents} documents, ${corpus.media} media)`),
    row('Bytes', formatBytes(corpus.bytes)),
    row('Documents by category', Object.entries(corpus.categories.documents).map(([name, count]) => `${name} ${count}`).join(', ')),
    row('Media by category', Object.entries(corpus.categories.media).map(([name, count]) => `${name} ${count}`).join(', ')),
    row('Source', corpus.source),
    row('Ingest order', corpus.ingestOrder),
    '',
    '## Ingest',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    row('Total wall time', `${ingest.totalMs} ms (corpus generation ${ingest.generationMs} ms, not included)`),
    row('Records per second', ingest.recordsPerSecond),
    row('Per-record latency p50 / p95 / p99 / max', `${ingest.latencyMs.p50} / ${ingest.latencyMs.p95} / ${ingest.latencyMs.p99} / ${ingest.latencyMs.max} ms`),
    row('Batch size / batches', `${ingest.batchSize} / ${ingest.batches}`),
    row('Processed / accepted', `${ingest.processed} / ${ingest.accepted}`),
    row('Peak RSS / peak heap used', `${formatBytes(ingest.memory.peakRssBytes)} / ${formatBytes(ingest.memory.peakHeapUsedBytes)} (${ingest.memory.sampling})`),
    row('Store growth', `${formatBytes(ingest.disk.growthBytes)} (${ingest.disk.objects} objects, index ${formatBytes(ingest.disk.indexBytes)})`),
    row('Max single record', formatBytes(ingest.maxSingleRecordBytes)),
    row('Exact duplicates eliminated', `${ingest.exactDuplicates.eliminated} of ${ingest.exactDuplicates.injected} (${ingest.exactDuplicates.percentage}%)`),
    row('Near duplicates linked', `${ingest.nearDuplicates.linked} of ${ingest.nearDuplicates.injected}, ${ingest.nearDuplicates.falseLinks} false links`),
    row('Corrupt records isolated', `${ingest.isolated.count} (${Object.entries(ingest.isolated.byReason).map(([reason, count]) => `${reason} ${count}`).join(', ')})`),
    row('Hostile records', `${ingest.hostile.acceptedAsInertText} of ${ingest.hostile.injected} accepted as inert text, ${ingest.hostile.storedVerbatim} stored verbatim`),
    row('Entity and step keys', `${ingest.keyExtraction.matched} of ${ingest.keyExtraction.checked} records match the answer key`),
    row('Provenance', `${ingest.provenance.missingSourceIdOrTrust} of ${ingest.provenance.acceptedRecords} accepted records missing sourceId or trust`),
    row('Malformed subtitles', `${ingest.media.malformed.acceptedWithExpectedWarnings} of ${ingest.media.malformed.injected} accepted with the expected warnings`),
    row('Long transcripts', `${ingest.media.long.acceptedOverThreeHours} of ${ingest.media.long.injected} accepted with more than three hours of cues`),
    row('Metadata-only media', `${ingest.media.metadataOnly.acceptedWithMetadataHash} of ${ingest.media.metadataOnly.injected} accepted under the canonical metadata hash`),
    row('Large documents', `${ingest.documents.large.acceptedWithSourceHash} of ${ingest.documents.large.injected} accepted with the source hash`),
    row('Unicode documents', `${ingest.documents.unicode.acceptedWithSourceHash} of ${ingest.documents.unicode.injected} accepted with the source hash`),
    '',
    '## Retrieval',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    row('Queries', retrieval.queries),
    row(`Answer key in top ${retrieval.topK}`, `${retrieval.hits} (${round(retrieval.successRate * 100)}%)`),
    row('Latency p50 / p95 / p99 / max', `${retrieval.latencyMs.p50} / ${retrieval.latencyMs.p95} / ${retrieval.latencyMs.p99} / ${retrieval.latencyMs.max} ms`),
    row('Method', retrieval.method),
    '',
    '## Restart recovery',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    row('Method', restartRecovery.method),
    row('Crashed at record', `${restartRecovery.crashedAtRecord} (${restartRecovery.batchesCompletedBeforeCrash} full batches, mid-batch ${restartRecovery.crashedMidBatch})`),
    row('Accepted before crash / recovered from index', `${restartRecovery.acceptedBeforeCrash} / ${restartRecovery.recoveredFromIndex}`),
    row('Skipped on resume / accepted after resume', `${restartRecovery.skippedOnResume} / ${restartRecovery.acceptedAfterResume}`),
    row('Duplicate accepted records', restartRecovery.duplicateAcceptedRecords),
    row('Matches the uninterrupted run', restartRecovery.matchesUninterruptedRun),
    '',
    '## Cancellation',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    row('Method', cancellation.method),
    row('Aborted at record', `${cancellation.abortedAtRecord} (mid-batch ${cancellation.abortedMidBatch})`),
    row('Status / processed / accepted', `${cancellation.status} / ${cancellation.processed} / ${cancellation.acceptedAtAbort}`),
    row('Index reloaded / recover warnings', `${cancellation.recoveredRecords} / ${cancellation.recoverWarnings}`),
    row('Consistent', cancellation.consistent),
    '',
    '## Targets and invariants',
    '',
    '| Result | Kind | Check | Actual | Target |',
    '| --- | --- | --- | --- | --- |',
    ...report.targets.map((target) => `| ${target.met ? 'met' : 'MISSED'} | ${target.kind} | ${target.name} | ${target.actual} | ${target.target} |`),
    '',
    report.invariantsHold ? 'All invariants hold.' : 'At least one invariant failed; see the table above.',
    '',
    '## No execution path',
    '',
    report.noExecutionPath.statement,
    '',
    `Files checked: ${report.noExecutionPath.files.map((file) => `\`${file}\``).join(', ')}. Forbidden tokens: ${report.noExecutionPath.forbiddenTokens.map((token) => `\`${token}\``).join(', ')}. Violations: ${report.noExecutionPath.violations.length}.`,
    '',
    '## Isolated records',
    '',
    '| Record | Kind | Reason |',
    '| --- | --- | --- |',
    ...ingest.isolated.records.map((item) => `| ${item.id} | ${item.kind} | ${item.reason}${item.detail ? ` (${item.detail})` : ''} |`),
    '',
  ];
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { documents: 1000, media: 1000, seed: DEFAULT_SEED, out: 'docs/release/benchmarks', batch: 50, corpus: null, keep: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--keep') {
      options.keep = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    if (flag === '--documents') options.documents = Number(value);
    else if (flag === '--media') options.media = Number(value);
    else if (flag === '--seed') options.seed = Number(value);
    else if (flag === '--out') options.out = value;
    else if (flag === '--batch') options.batch = Number(value);
    else if (flag === '--corpus') options.corpus = value;
    else throw new Error(`unknown argument ${flag}`);
    i += 1;
  }
  return options;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const options = parseArgs(process.argv.slice(2));
  const script = relative(repoRoot, fileURLToPath(import.meta.url)).replace(/\\/g, '/');
  const command = ['node', script, ...process.argv.slice(2)].join(' ');
  const report = await runBenchmark({ ...options, command });
  process.exitCode = report.invariantsHold ? 0 : 1;
}
