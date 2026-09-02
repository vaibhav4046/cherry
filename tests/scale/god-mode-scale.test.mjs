/**
 * God Mode scale harness tests.
 *
 * Fast mode (default): 200 documents + 200 media records generated from the
 * same seed logic as the full corpus, ingested through the storage pipeline,
 * every pass condition asserted. Full mode (CHERRY_SCALE_FULL=1) runs the
 * 1,000 + 1,000 corpus. Nothing here touches the network.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, appendFileSync, readdirSync, statSync, existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { ContentStore } from '../../runner/lib/storage/cas.mjs';
import { RecordIndex } from '../../runner/lib/storage/record-index.mjs';
import { IngestPipeline, listSources } from '../../runner/lib/storage/ingest-pipeline.mjs';
import { generateCorpus, DEFAULT_SEED } from '../../scripts/god-mode/generate-corpus.mjs';
import { runBenchmark } from '../../scripts/god-mode/run-scale-benchmark.mjs';
import { runChaos } from '../../scripts/god-mode/run-chaos.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const FULL = process.env.CHERRY_SCALE_FULL === '1';
const COUNTS = FULL ? { documents: 1000, media: 1000 } : { documents: 200, media: 200 };
const TMP_ROOT = process.env.CHERRY_SCALE_TMP || tmpdir();
const scratch = mkdtempSync(join(TMP_ROOT, 'cherry-scale-test-'));
const THREE_HOURS_SECONDS = 3 * 60 * 60;
const KIB = 1024;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function scratchDir(name) {
  const dir = join(scratch, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function record(overrides = {}) {
  return {
    id: 'rec-1',
    kind: 'document',
    contentHash: 'a'.repeat(64),
    sourceId: 'file:documents/rec-1.json',
    trust: 'untrusted',
    byteLength: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
    meta: { title: 'Rotating the ingress certificate for Orion' },
    ...overrides,
  };
}

/** Hash every file under a directory by sorted relative path, for byte-identity checks. */
function treeDigest(dir, base = dir) {
  const parts = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) parts.push(treeDigest(full, base));
    else parts.push(`${full.slice(base.length).replace(/\\/g, '/')}:${sha256(readFileSync(full))}`);
  }
  return sha256(parts.join('\n'));
}

async function collect(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

after(() => {
  try {
    rmSync(scratch, { recursive: true, force: true });
  } catch {
    /* windows file locks */
  }
});

describe('ContentStore', () => {
  test('putBytes is sharded, atomic and idempotent', async () => {
    const cas = new ContentStore(scratchDir('cas-basic'));
    const bytes = Buffer.from('hello cherry\n');
    const first = cas.putBytes(bytes);
    assert.equal(first.hash, sha256(bytes));
    assert.equal(first.byteLength, bytes.length);
    assert.equal(first.created, true);
    const objectPath = join(cas.root, 'objects', 'sha256', first.hash.slice(0, 2), first.hash);
    assert.ok(existsSync(objectPath), 'object lives at objects/sha256/<aa>/<hash>');
    const before = statSync(objectPath).mtimeMs;
    const second = cas.putBytes(bytes);
    assert.equal(second.created, false);
    assert.equal(second.hash, first.hash);
    assert.equal(statSync(objectPath).mtimeMs, before, 'second put writes nothing');
    assert.equal(cas.has(first.hash), true);
    assert.equal(cas.has('0'.repeat(64)), false);
    assert.equal(cas.stat(first.hash).byteLength, bytes.length);
    assert.deepEqual(await collect(cas.readStream(first.hash)), bytes);
    assert.equal((await cas.verify(first.hash)).ok, true);
    assert.equal(readdirSync(join(cas.root, 'tmp')).length, 0, 'no temp files left behind');
  });

  test('putStream hashes while writing and discards the temp file on a duplicate', async () => {
    const cas = new ContentStore(scratchDir('cas-stream'));
    const bytes = Buffer.from('streamed body '.repeat(5000));
    const first = await cas.putStream(Readable.from([bytes.subarray(0, 1000), bytes.subarray(1000)]));
    assert.equal(first.hash, sha256(bytes));
    assert.equal(first.created, true);
    assert.equal(first.byteLength, bytes.length);
    const second = await cas.putStream(Readable.from([bytes]));
    assert.equal(second.created, false);
    assert.equal(readdirSync(join(cas.root, 'tmp')).length, 0);
    assert.deepEqual(await collect(cas.readStream(first.hash)), bytes);
  });

  test('refuses anything that is not 64 lowercase hex', () => {
    const cas = new ContentStore(scratchDir('cas-refuse'));
    for (const bad of ['A'.repeat(64), 'a'.repeat(63), '../../etc/passwd', '', 'g'.repeat(64)]) {
      assert.throws(() => cas.has(bad), /hash/i, `has(${JSON.stringify(bad)})`);
      assert.throws(() => cas.stat(bad), /hash/i);
      assert.throws(() => cas.readStream(bad), /hash/i);
    }
  });

  test('verify detects a corrupted object', async () => {
    const cas = new ContentStore(scratchDir('cas-verify'));
    const { hash } = cas.putBytes(Buffer.from('immutable content'));
    const objectPath = join(cas.root, 'objects', 'sha256', hash.slice(0, 2), hash);
    writeFileSync(objectPath, 'immutable CONTENT');
    const report = await cas.verify(hash);
    assert.equal(report.ok, false);
    assert.equal(report.expected, hash);
    assert.notEqual(report.actual, hash);
  });

  test('list pages with an opaque cursor and never repeats or skips', () => {
    const cas = new ContentStore(scratchDir('cas-list'));
    const expected = new Set();
    for (let i = 0; i < 300; i += 1) expected.add(cas.putBytes(Buffer.from(`object ${i}`)).hash);
    const seen = [];
    let cursor = null;
    let pages = 0;
    do {
      const page = cas.list({ cursor, limit: 37 });
      assert.ok(page.hashes.length <= 37);
      seen.push(...page.hashes);
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor);
    assert.ok(pages >= 9);
    assert.equal(seen.length, expected.size, 'no repeats');
    assert.deepEqual(new Set(seen), expected, 'no skips');
    assert.throws(() => cas.list({ cursor: 'not a cursor' }), /cursor/i);
  });
});

describe('RecordIndex', () => {
  test('append, lookup, count and validation', () => {
    const index = new RecordIndex(join(scratchDir('index-basic'), 'records.jsonl'));
    const stored = index.append(record());
    assert.equal(index.count(), 1);
    assert.equal(index.findByContentHash('a'.repeat(64)).id, 'rec-1');
    assert.equal(index.findById('rec-1').contentHash, 'a'.repeat(64));
    assert.equal(index.findByContentHash('b'.repeat(64)), undefined);
    assert.equal(stored.trust, 'untrusted');
    assert.throws(() => index.append(record()), /id/i, 'duplicate id refused');
    assert.throws(() => index.append(record({ id: 'rec-2', trust: 'trusted' })), /trust/i);
    assert.throws(() => index.append(record({ id: 'rec-3', contentHash: 'zz' })), /contentHash/i);
    assert.throws(() => index.append(record({ id: '../rec-4' })), /id/i);
    assert.throws(() => index.append(record({ id: 'rec-5', byteLength: -1 })), /byteLength/i);
    assert.throws(() => index.append(record({ id: 'rec-6', meta: { blob: 'x'.repeat(64 * KIB) } })), /large/i);
    assert.throws(() => index.findByContentHash('nope'), /hash/i);
    assert.equal(index.count(), 1);
  });

  test('recover tolerates a truncated tail line and keeps appending cleanly', () => {
    const path = join(scratchDir('index-recover'), 'records.jsonl');
    const index = new RecordIndex(path);
    index.append(record({ id: 'rec-1', contentHash: 'a'.repeat(64) }));
    index.append(record({ id: 'rec-2', contentHash: 'b'.repeat(64) }));
    appendFileSync(path, '{"id":"rec-3","kind":"document","contentHash":"cc');
    const reopened = new RecordIndex(path);
    assert.equal(reopened.count(), 2);
    assert.equal(reopened.warnings.length, 1);
    assert.match(reopened.warnings[0], /line 3/);
    reopened.append(record({ id: 'rec-4', contentHash: 'd'.repeat(64) }));
    const again = new RecordIndex(path);
    assert.equal(again.count(), 3, 'the appended record is on its own line');
    assert.deepEqual([...again.records()].map((entry) => entry.id), ['rec-1', 'rec-2', 'rec-4']);
  });

  test('page never repeats or skips and search ranks the matching title first', () => {
    const index = new RecordIndex(join(scratchDir('index-page'), 'records.jsonl'));
    for (let i = 0; i < 250; i += 1) {
      index.append(record({
        id: `rec-${i}`,
        contentHash: sha256(`body ${i}`),
        meta: { title: `Document number ${i} about ${i % 2 ? 'ledgers' : 'caches'}`, tags: [`creator-${i % 7}`] },
      }));
    }
    index.append(record({ id: 'target', contentHash: sha256('target'), meta: { title: 'Rotating the ingress certificate for Orion on staging', tags: ['Mara Okonkwo'] } }));
    const seen = [];
    let cursor = null;
    do {
      const page = index.page({ cursor, limit: 41 });
      seen.push(...page.records.map((entry) => entry.id));
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(seen.length, 251);
    assert.equal(new Set(seen).size, 251);
    const hits = index.search('rotating ingress certificate orion', { limit: 5 });
    assert.equal(hits[0].record.id, 'target');
    assert.equal(index.search('Mara Okonkwo', { limit: 3 })[0].record.id, 'target', 'tags are searchable');
    assert.deepEqual(index.search('', { limit: 3 }), []);
  });
});

describe('corpus generator', () => {
  test('same seed produces byte-identical corpora', () => {
    const a = scratchDir('corpus-a');
    const b = scratchDir('corpus-b');
    const manifestA = generateCorpus({ outDir: a, ...COUNTS, seed: DEFAULT_SEED });
    generateCorpus({ outDir: b, ...COUNTS, seed: DEFAULT_SEED });
    assert.equal(sha256(readFileSync(join(a, 'manifest.json'))), sha256(readFileSync(join(b, 'manifest.json'))));
    assert.equal(treeDigest(a), treeDigest(b));
    assert.equal(manifestA.seed, DEFAULT_SEED);
    const other = scratchDir('corpus-other-seed');
    generateCorpus({ outDir: other, ...COUNTS, seed: 7 });
    assert.notEqual(treeDigest(a), treeDigest(other));
  });

  test('manifest matches the files on disk and carries the answer key', () => {
    const dir = scratchDir('corpus-check');
    const manifest = generateCorpus({ outDir: dir, ...COUNTS, seed: DEFAULT_SEED });
    assert.equal(manifest.records.length, COUNTS.documents + COUNTS.media);
    const docs = manifest.records.filter((entry) => entry.kind === 'document');
    const media = manifest.records.filter((entry) => entry.kind === 'media');
    assert.equal(docs.length, COUNTS.documents);
    assert.equal(media.length, COUNTS.media);
    const count = (list, category) => list.filter((entry) => entry.category === category).length;
    const scale = COUNTS.documents / 1000;
    assert.equal(count(docs, 'normal'), 600 * scale);
    assert.equal(count(docs, 'exact_duplicate'), 100 * scale);
    assert.equal(count(docs, 'near_duplicate'), 100 * scale);
    assert.equal(count(docs, 'hostile'), 75 * scale);
    assert.equal(count(docs, 'corrupt'), 50 * scale);
    assert.equal(count(docs, 'large'), 50 * scale);
    assert.equal(count(docs, 'unicode'), 25 * scale);
    assert.equal(count(media, 'normal'), 700 * scale);
    assert.equal(count(media, 'exact_duplicate'), 100 * scale);
    assert.equal(count(media, 'near_duplicate'), 75 * scale);
    assert.equal(count(media, 'metadata_only'), 50 * scale);
    assert.equal(count(media, 'malformed'), 25 * scale);
    assert.equal(count(media, 'hostile'), 25 * scale);
    assert.equal(count(media, 'long'), 25 * scale);
    const ids = new Set(manifest.records.map((entry) => entry.id));
    assert.equal(ids.size, manifest.records.length, 'ids are unique');
    for (const entry of manifest.records) {
      assert.match(entry.id, /^(doc|med)-\d{5}$/);
      assert.equal(entry.trust, 'untrusted');
      assert.ok(existsSync(join(dir, entry.metaPath)), entry.metaPath);
      if (entry.expectedOutcome === 'isolated') {
        assert.ok(entry.expectedReason);
        continue;
      }
      assert.match(entry.sha256, /^[0-9a-f]{64}$/);
      assert.ok(entry.queries.length >= 2, `${entry.id} has two queries`);
      assert.ok(Array.isArray(entry.expectedKeys) && entry.expectedKeys.length > 0, `${entry.id} has keys`);
      assert.equal(typeof entry.byteLength, 'number');
      if (entry.path) {
        const bytes = readFileSync(join(dir, entry.path));
        assert.equal(sha256(bytes), entry.sha256, `${entry.id} body hash`);
        assert.equal(bytes.length, entry.byteLength);
      } else {
        assert.equal(entry.category, 'metadata_only');
      }
      if (entry.category === 'large') assert.ok(entry.byteLength >= 200 * KIB && entry.byteLength <= 1024 * KIB);
      if (entry.category === 'long') assert.ok(entry.durationSeconds > THREE_HOURS_SECONDS);
      if (entry.category === 'exact_duplicate') assert.ok(ids.has(entry.duplicateOf));
      if (entry.category === 'near_duplicate') assert.ok(ids.has(entry.nearDuplicateOf));
      if (entry.category === 'malformed') assert.ok(entry.expectedWarnings.length > 0);
      for (const query of entry.queries) assert.ok(ids.has(query.expectedId));
    }
    const dupSources = docs.filter((entry) => entry.duplicateOf).map((entry) => entry.duplicateOf);
    const nearSources = docs.filter((entry) => entry.nearDuplicateOf).map((entry) => entry.nearDuplicateOf);
    assert.equal(new Set([...dupSources, ...nearSources]).size, dupSources.length + nearSources.length, 'duplicate sources are distinct');
    for (const hostile of manifest.records.filter((entry) => entry.category === 'hostile')) {
      const body = readFileSync(join(dir, hostile.path), 'utf8').toLowerCase();
      assert.ok(/ignore all previous instructions|you are now|system prompt|javascript:|"tool"/.test(body), `${hostile.id} carries an injection`);
    }
  });
});

describe('ingest pipeline', () => {
  const corpusDir = scratchDir('corpus-ingest');
  let manifest;
  let byId;
  let sources;
  let cleanIdToHash;

  before(() => {
    manifest = generateCorpus({ outDir: corpusDir, ...COUNTS, seed: DEFAULT_SEED });
    byId = new Map(manifest.records.map((entry) => [entry.id, entry]));
    sources = listSources(corpusDir);
  });

  function canonicalIdFor(index, manifestId) {
    const entry = byId.get(manifestId);
    const hit = index.findByContentHash(entry.sha256);
    return hit ? hit.id : null;
  }

  test('ingests the corpus with every pass condition holding', async () => {
    const storeDir = scratchDir('store-main');
    const pipeline = new IngestPipeline({ storeDir });
    assert.equal(sources.length, manifest.records.length);
    const summary = await pipeline.run(sources, { batchSize: 50 });
    assert.equal(summary.status, 'completed');
    assert.equal(summary.processed, sources.length);
    const outcomes = new Map(summary.outcomes.map((outcome) => [outcome.id, outcome]));
    const { index, cas } = pipeline;

    const injectedExact = manifest.records.filter((entry) => entry.category === 'exact_duplicate').length;
    assert.equal(summary.duplicates, injectedExact, 'every injected exact duplicate is eliminated, nothing else is');
    for (const entry of manifest.records.filter((item) => item.category === 'exact_duplicate')) {
      const original = byId.get(entry.duplicateOf);
      assert.equal(entry.sha256, original.sha256);
      const statuses = [outcomes.get(entry.id).status, outcomes.get(original.id).status].sort();
      assert.deepEqual(statuses, ['accepted', 'duplicate'], `${entry.id}/${original.id}`);
      assert.equal(canonicalIdFor(index, entry.id), canonicalIdFor(index, original.id));
    }

    const nearDuplicates = manifest.records.filter((entry) => entry.category === 'near_duplicate');
    for (const entry of nearDuplicates) {
      const mine = index.findById(entry.id);
      const original = index.findById(entry.nearDuplicateOf);
      assert.ok(mine && original, `${entry.id} and ${entry.nearDuplicateOf} both accepted`);
      assert.ok(mine.nearDuplicateOf === original.id || original.nearDuplicateOf === mine.id, `${entry.id} linked to ${entry.nearDuplicateOf}`);
    }
    const linked = [...index.records()].filter((entry) => entry.nearDuplicateOf);
    assert.equal(linked.length, nearDuplicates.length, 'no false near-duplicate links');

    for (const entry of manifest.records.filter((item) => item.expectedOutcome === 'isolated')) {
      const outcome = outcomes.get(entry.id);
      assert.equal(outcome.status, 'isolated', entry.id);
      assert.equal(outcome.reason, entry.expectedReason, entry.id);
      assert.equal(index.findById(entry.id), undefined);
    }
    assert.equal(summary.isolated, manifest.records.filter((item) => item.expectedOutcome === 'isolated').length);

    for (const entry of manifest.records.filter((item) => item.category === 'hostile')) {
      const stored = index.findById(entry.id);
      assert.ok(stored, `${entry.id} accepted as inert text`);
      assert.equal(stored.trust, 'untrusted');
      assert.equal(stored.contentHash, entry.sha256);
      const object = await collect(cas.readStream(stored.contentHash));
      assert.deepEqual(object, readFileSync(join(corpusDir, entry.path)), `${entry.id} stored verbatim`);
    }

    for (const entry of manifest.records.filter((item) => item.category === 'malformed')) {
      const stored = index.findById(entry.id);
      assert.ok(stored, `${entry.id} accepted`);
      for (const warning of entry.expectedWarnings) assert.ok(stored.meta.warnings.includes(warning), `${entry.id} flags ${warning}`);
    }
    for (const entry of manifest.records.filter((item) => item.category === 'metadata_only')) {
      assert.equal(index.findById(entry.id)?.contentHash, entry.sha256, `${entry.id} metadata-only hash`);
    }
    for (const entry of manifest.records.filter((item) => item.category === 'long')) {
      assert.ok(index.findById(entry.id).meta.durationSeconds > THREE_HOURS_SECONDS, `${entry.id} duration`);
    }
    for (const entry of manifest.records.filter((item) => item.category === 'large')) {
      const stored = index.findById(entry.id);
      assert.ok(stored.byteLength >= 200 * KIB);
      assert.equal((await cas.verify(stored.contentHash)).ok, true);
    }
    for (const entry of manifest.records.filter((item) => item.category === 'unicode')) {
      assert.ok(index.findById(entry.id), `${entry.id} accepted`);
    }

    let keyChecks = 0;
    for (const entry of manifest.records) {
      if (entry.expectedOutcome === 'isolated' || outcomes.get(entry.id).status !== 'accepted') continue;
      const stored = index.findById(entry.id);
      assert.ok(stored.sourceId.startsWith('file:'), `${entry.id} provenance`);
      assert.deepEqual([...stored.meta.keys].sort(), [...entry.expectedKeys].sort(), `${entry.id} keys`);
      keyChecks += 1;
    }
    assert.ok(keyChecks > COUNTS.documents / 2);

    let queries = 0;
    let hits = 0;
    for (const entry of manifest.records) {
      for (const query of entry.queries ?? []) {
        queries += 1;
        const expected = canonicalIdFor(index, query.expectedId);
        const top = index.search(query.query, { limit: 5 }).map((hit) => hit.record.id);
        if (top.includes(expected)) hits += 1;
      }
    }
    const successRate = hits / queries;
    console.log(`retrieval answer key: ${hits}/${queries} = ${(successRate * 100).toFixed(2)}%`);
    assert.ok(successRate >= 0.95, `retrieval success ${successRate}`);

    let objects = 0;
    let cursor = null;
    do {
      const page = cas.list({ cursor, limit: 100 });
      objects += page.hashes.length;
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(objects, new Set([...index.records()].map((entry) => entry.contentHash)).size);
    cleanIdToHash = new Map([...index.records()].map((entry) => [entry.id, entry.contentHash]));
  });

  test('restart recovery resumes from the index without duplicate accepted records', async () => {
    const storeDir = scratchDir('store-restart');
    const crashAt = 137;
    let seen = 0;
    const first = new IngestPipeline({ storeDir });
    await assert.rejects(
      first.run(sources, {
        batchSize: 50,
        onRecord: () => {
          seen += 1;
          if (seen === crashAt) throw new Error('simulated crash mid-batch');
        },
      }),
      /simulated crash/,
    );
    const acceptedBefore = first.index.count();
    assert.ok(acceptedBefore > 0 && acceptedBefore < crashAt);
    const resumed = new IngestPipeline({ storeDir });
    assert.equal(resumed.index.count(), acceptedBefore, 'fresh pipeline recovers the index');
    const summary = await resumed.run(sources, { batchSize: 50 });
    assert.equal(summary.status, 'completed');
    assert.equal(summary.skipped, acceptedBefore, 'already indexed records are skipped, not re-accepted');
    const records = [...resumed.index.records()];
    assert.equal(new Set(records.map((entry) => entry.id)).size, records.length);
    assert.equal(new Set(records.map((entry) => entry.contentHash)).size, records.length, 'zero duplicate accepted records');
    assert.deepEqual(new Map(records.map((entry) => [entry.id, entry.contentHash])), cleanIdToHash, 'same result as the uninterrupted run');
  });

  test('cancellation stops new work mid-batch and leaves the index consistent', async () => {
    const storeDir = scratchDir('store-cancel');
    const controller = new AbortController();
    const abortAt = 120;
    let seen = 0;
    const pipeline = new IngestPipeline({ storeDir });
    const summary = await pipeline.run(sources, {
      batchSize: 50,
      signal: controller.signal,
      onRecord: () => {
        seen += 1;
        if (seen === abortAt) controller.abort();
      },
    });
    assert.equal(summary.status, 'cancelled');
    assert.equal(summary.processed, abortAt);
    assert.equal(summary.outcomes.length, abortAt);
    const reloaded = new RecordIndex(join(storeDir, 'metadata', 'records.jsonl'));
    assert.equal(reloaded.warnings.length, 0);
    assert.equal(reloaded.count(), summary.accepted);
    assert.equal(reloaded.count(), pipeline.index.count());
  });

  test('refuses oversized records, unsafe ids, unsafe body paths and symlinks', async () => {
    const dir = scratchDir('corpus-refusals');
    mkdirSync(join(dir, 'documents'), { recursive: true });
    const write = (id, meta, body) => {
      writeFileSync(join(dir, 'documents', `${id}.json`), JSON.stringify(meta));
      if (body !== undefined) writeFileSync(join(dir, 'documents', `${id}.md`), body);
    };
    write('big', { id: 'big', kind: 'document', title: 'Big', body: 'big.md' }, 'x'.repeat(2 * 1024 * KIB));
    write('traversal', { id: '../traversal', kind: 'document', title: 'Traversal', body: 'traversal.md' }, '# ok\n');
    write('bodypath', { id: 'bodypath', kind: 'document', title: 'Body', body: '../bodypath.md' }, '# ok\n');
    write('fine', { id: 'fine', kind: 'document', title: 'Fine', body: 'fine.md' }, '# fine\n\nProject: Orion\n');
    let symlinkMade = false;
    try {
      symlinkSync(join(dir, 'documents', 'fine.md'), join(dir, 'documents', 'linked.md'), 'file');
      write('linked', { id: 'linked', kind: 'document', title: 'Linked', body: 'linked.md' });
      symlinkMade = true;
    } catch (error) {
      console.log(`symlink case skipped: ${error.code ?? error.message}`);
    }
    const pipeline = new IngestPipeline({ storeDir: scratchDir('store-refusals'), maxBytes: 1024 * KIB });
    const summary = await pipeline.run(listSources(dir), { batchSize: 10 });
    const outcome = Object.fromEntries(summary.outcomes.map((item) => [item.id, item]));
    assert.equal(outcome.big.status, 'isolated');
    assert.equal(outcome.big.reason, 'oversized');
    assert.equal(outcome.traversal.reason, 'unsafe_id');
    assert.equal(outcome.bodypath.reason, 'unsafe_body_path');
    assert.equal(outcome.fine.status, 'accepted');
    if (symlinkMade) assert.equal(outcome.linked.reason, 'symlink_refused');
    assert.equal(pipeline.index.count(), 1);
  });
});

describe('no execution path for record bodies', () => {
  test('storage modules and the generator never import eval, Function, child_process, vm or network APIs', () => {
    const files = [
      ...readdirSync(join(repoRoot, 'runner', 'lib', 'storage')).map((name) => join('runner', 'lib', 'storage', name)),
      join('scripts', 'god-mode', 'generate-corpus.mjs'),
    ];
    const forbidden = [/\beval\s*\(/, /\bnew\s+Function\b/, /\bFunction\s*\(/, /child_process/, /['"]node:vm['"]/, /\bfetch\s*\(/, /\bimport\s*\(/, /\bWebSocket\b/, /node:http/, /node:net/];
    for (const file of files) {
      const source = readFileSync(join(repoRoot, file), 'utf8');
      for (const pattern of forbidden) assert.doesNotMatch(source, pattern, `${file} contains ${pattern}`);
    }
  });
});

describe('benchmark and chaos drivers', () => {
  test('runBenchmark writes the JSON and Markdown reports with the invariants holding', async () => {
    const out = scratchDir('bench-out');
    const report = await runBenchmark({ ...COUNTS, seed: DEFAULT_SEED, out, batch: 50, tmpRoot: scratch, quiet: true });
    assert.ok(existsSync(join(out, 'god-mode-scale.json')));
    assert.ok(existsSync(join(out, 'god-mode-scale.md')));
    const written = JSON.parse(readFileSync(join(out, 'god-mode-scale.json'), 'utf8'));
    assert.equal(written.corpus.documents, COUNTS.documents);
    assert.equal(report.ingest.exactDuplicates.percentage, 100);
    assert.equal(report.ingest.nearDuplicates.linked, report.ingest.nearDuplicates.injected);
    assert.equal(report.ingest.nearDuplicates.falseLinks, 0);
    assert.equal(report.ingest.hostile.acceptedAsInertText, report.ingest.hostile.injected);
    assert.equal(report.ingest.hostile.storedVerbatim, report.ingest.hostile.injected);
    assert.equal(report.ingest.isolated.count, report.ingest.isolated.records.length);
    assert.equal(report.ingest.provenance.missingSourceIdOrTrust, 0);
    assert.equal(report.restartRecovery.duplicateAcceptedRecords, 0);
    assert.equal(report.restartRecovery.matchesUninterruptedRun, true);
    assert.equal(report.cancellation.consistent, true);
    assert.equal(report.noExecutionPath.ok, true);
    assert.ok(report.retrieval.successRate >= 0.95);
    assert.ok(report.ingest.memory.peakRssBytes > 0);
    assert.ok(report.machine.node.startsWith('v'));
    assert.ok(report.invariantsHold, 'hard invariants hold');
  });

  test('runChaos passes every case that the platform can run', async () => {
    const out = scratchDir('chaos-out');
    const results = await runChaos({ out, tmpRoot: scratch, quiet: true });
    assert.ok(existsSync(join(out, 'god-mode-chaos.json')));
    assert.ok(results.length >= 12);
    for (const result of results) {
      assert.ok(['pass', 'fail', 'skipped'].includes(result.result));
      assert.notEqual(result.result, 'fail', `${result.case}: ${result.detail}`);
      if (result.result === 'skipped') console.log(`chaos ${result.case} skipped: ${result.detail}`);
    }
  });
});
