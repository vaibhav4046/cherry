# God Mode scale report (GOD-11)

This is a 2,000-record local benchmark on one machine. It is not evidence for any larger claim.
Every number below was measured by the commands listed here, on the commit listed here, and is
copied from `docs/release/benchmarks/god-mode-scale.json` and `docs/release/benchmarks/god-mode-chaos.json`.

## What was run

| Item | Value |
| --- | --- |
| Benchmark command | `node scripts/god-mode/run-scale-benchmark.mjs --documents 1000 --media 1000 --seed 20260902 --out docs/release/benchmarks` |
| Chaos command | `node scripts/god-mode/run-chaos.mjs --out docs/release/benchmarks` |
| Test command | `node --test tests/scale/god-mode-scale.test.mjs` (fast mode, 200 + 200); `CHERRY_SCALE_FULL=1` runs 1,000 + 1,000 |
| Code measured | commit `ad046d4056b4990a37178fd8db0a5b79c9b609ee`, clean working tree |
| Run time | 2026-09-02T13:09:48Z to 2026-09-02T13:10:23Z (benchmark), 2026-09-02T13:10:45Z (chaos) |
| CPU | 12th Gen Intel(R) Core(TM) i5-12450HX, 12 logical cores |
| Memory | 16,873,545,728 bytes (15.71 GiB) |
| Platform | win32 10.0.26200 x64, Node v24.12.0, NTFS temporary directory |
| Corpus | seed 20260902, 2,000 records, 74,714,572 bytes (71.3 MiB), manifest SHA-256 `92f2699637d5d87d43c057c3c239584939e8abe7b550d6d22c1ec1d35d088d7a`, generated in 5,353 ms (not counted in ingest time) |

The corpus is generated into a temporary directory and deleted after the run. Same seed, same
counts, byte-identical output: the test generates twice and compares a digest of every file, and
the same check was repeated across two separate processes with `diff -rq` reporting no difference.

## Headline numbers

| Metric | Measured |
| --- | --- |
| Ingest wall time (2,000 records, batches of 50) | 13,496.76 ms |
| Records per second | 148.18 |
| Per-record ingest latency p50 / p95 / p99 / max | 4.227 / 15.335 / 67.332 / 138.338 ms |
| Retrieval latency p50 / p95 / p99 / max (3,900 queries) | 0.188 / 0.402 / 0.886 / 5.6 ms |
| Retrieval answer key in top 5 | 3,900 of 3,900 (100%) |
| Peak RSS / peak heap used | 320.4 MiB / 149.0 MiB (sampled before the run and after each of the 40 batches) |
| Store growth | 68.7 MiB (1,750 objects), index 1.5 MiB |
| Max single record | 1,030,985 bytes |
| Accepted / duplicate / isolated | 1,750 / 200 / 50 |
| Exact duplicates eliminated | 200 of 200 injected (100%) |
| Near duplicates linked | 175 of 175 injected, 0 false links |
| Corrupt records isolated | 50 of 50, each reported individually (empty_body 17, invalid_utf8 17, invalid_metadata 16); the batch continued every time |
| Hostile records | 100 of 100 accepted as inert text, trust `untrusted`, 100 stored verbatim |
| Restart recovery | crashed at record 166 (three full batches plus 16 records), 158 accepted before the crash, fresh pipeline resumed from the index, 0 duplicate accepted records, final index identical to the uninterrupted run |
| Cancellation | aborted at record 112 mid-batch, 108 accepted, index reloads with 108 records and 0 recover warnings |
| Provenance | 0 of 1,750 accepted records missing `sourceId` or `trust` |
| Entity and step keys | 1,750 of 1,750 accepted records match the answer key |
| Malformed subtitles / long transcripts / metadata-only media | 25 of 25 flagged with the expected warnings / 25 of 25 over three hours / 50 of 50 stored under the canonical metadata hash |
| Large / unicode documents | 50 of 50 / 25 of 25 accepted under the source hash |

## Targets

| Result | Kind | Check | Actual | Target |
| --- | --- | --- | --- | --- |
| met | invariant | exact duplicates eliminated | 100% (200 of 200) | 100% |
| met | invariant | near duplicates linked, no false links | 175 linked, 0 false | 175 linked, 0 false |
| met | invariant | corrupt records isolated with the expected reason | 50 of 50 | 50 |
| met | invariant | hostile records inert and stored verbatim | 100 inert, 100 verbatim | 100 |
| met | invariant | restart recovery without duplicate accepted records | 0 duplicates, matches uninterrupted run | 0 duplicates |
| met | invariant | cancellation leaves the index consistent | true | consistent |
| met | invariant | provenance on every accepted record | 0 missing of 1,750 | 0 missing |
| met | invariant | no execution or network path for bodies | 0 violations | 0 |
| met | invariant | entity and step keys extracted as expected | 1,750 of 1,750 | 100% |
| met | target | retrieval p95 under 1,000 ms | 0.402 ms | under 1,000 ms |
| met | target | retrieval answer key in top 5 at least 95% | 100% | at least 95% |
| met | target | ingest p95 under 100 ms per record (harness-chosen, informational) | 15.335 ms | under 100 ms |

No target was missed in the committed run. The retrieval p95 target is a target, not a gate; the
benchmark reports a miss and still exits 0 for targets, and exits 1 only when an invariant fails.

## Chaos cases

12 cases, 11 pass, 0 fail, 1 skipped.

| Case | Result |
| --- | --- |
| corrupted CAS object detected by verify | pass |
| corrupted index tail line skipped on recover with a warning | pass |
| interrupted batch resumed without duplicates | pass (crashed at record 37 of 200, 35 accepted before, 175 after resume, 35 skipped) |
| duplicate idempotent put | pass (created:false, mtime unchanged, one object) |
| oversized record (2 MiB) rejected by maxBytes 1 MiB | pass |
| path traversal in a record id, body path, or absolute body path rejected | pass |
| symlink under the corpus dir refused | skipped: symlink creation returned EPERM on this Windows account (Developer Mode off, not elevated); the refusal code path is exercised only where symlinks can be created |
| invalid UTF-8 isolated | pass |
| zero-byte record isolated | pass |
| hostile record stays text (marker found verbatim in the stored object, trust untrusted) | pass |
| index cursor pagination across 2,000 records, no repeats or skips | pass |
| CAS cursor pagination across 2,000 objects, no repeats or skips | pass |

## Test suite

`tests/scale/god-mode-scale.test.mjs`: 17 tests in 6 suites. Fast mode (200 + 200) passed in
27.4 s on this machine, under the 60 s budget. Full mode (`CHERRY_SCALE_FULL=1`, 1,000 + 1,000)
passed 17 of 17 in 110.7 s while two diagnostic scripts were competing for the same disk, so that
duration is an upper bound, not a measurement. The suite covers the store, the index, generator
determinism and the answer key, every ingest pass condition, restart, cancellation, refusals, the
static no-execution check, and it runs the benchmark and chaos drivers end to end at fast size.

## How the pipeline works

Order per record: read metadata, validate (safe id that matches the file name, safe body path,
regular file, not a symlink, not empty, under `maxBytes` of 2 MiB), normalise for derived features
only (NFC, case, line endings), SHA-256 over the raw bytes in one streamed pass, dedupe by content
hash against the index, label `trust: untrusted`, store (`putStream`, temp file plus rename), append
to the index, then link a near duplicate. Bytes are stored verbatim; normalisation never changes what
is stored. Records are processed one at a time inside bounded batches; the batch boundary is where
memory is sampled and the batch hook runs. The abort signal is checked before every record.

Near duplicates: a bottom-32 sketch of word 5-shingles selects candidates from an in-memory
inverted map; each candidate body is re-read from the store and exact shingle Jaccard must exceed
0.9. In the full corpus the sketch sent exactly 175 candidates to confirmation, all of them the 175
injected pairs, and the confirmed similarity ranged from 0.9548 to 0.9971 (median 0.9729). The
corpus documents are sized so that one changed sentence stays above 0.9; a much shorter document
with one changed sentence would not link, and that is the threshold behaving as specified.

Ingest order is by record id, and ids are a seeded permutation, so originals do not necessarily
precede their duplicates. Dedupe is by hash and does not care which arrives first; the near-duplicate
check links whichever member of a pair arrives second, and the benchmark accepts either direction.

## No execution path

The modules that read record bodies (`runner/lib/storage/cas.mjs`, `record-index.mjs`,
`ingest-pipeline.mjs`, `text.mjs` and `scripts/god-mode/generate-corpus.mjs`) never import
`child_process`, `vm`, `http`, `net` or `WebSocket` and never call `eval`, `Function`, `fetch` or a
dynamic `import()`. No ingested body can reach an execution or network path because no such path
exists in that code. The benchmark asserts this by scanning those files for the forbidden tokens on
every run, and the test suite asserts the same. The benchmark driver imports `child_process` for one
call, `git rev-parse HEAD`, made before any record is read. No classifier runs over bodies: every
record is untrusted data at ingest, including the 100 hostile ones, and trust promotion stays a
human action outside this harness.

## What the tail is made of

A separate clean run of the same pipeline over the same corpus, with per-category timing, put the
latency tail where the bytes are: the 50 large documents (200 KiB to 1 MiB) at p50 47.3 ms and max
79.2 ms, and the 25 long transcripts at p50 34.1 ms and max 41.8 ms. Normal documents sat at p50
3.2 ms and p95 4.7 ms. One normal document took 174.5 ms in that run with no attributable cause in
the harness; a garbage-collection pause or a filesystem stall is the likely explanation, and it is
reported rather than trimmed.

## Nondeterminism observed

- Timings vary between runs of identical code. Two consecutive full runs measured 12,607.7 ms and
  13,496.76 ms total, ingest p95 of 11.361 ms and 15.335 ms, retrieval p95 of 0.278 ms and 0.402 ms,
  and peak RSS of 307.8 MiB and 320.4 MiB. Every structural result (counts, links, isolations, hashes,
  answer-key hits) was identical across both runs and across the test suite runs.
- Corpus generation is deterministic across processes (checked with `diff -rq` on two independent
  CLI runs). The index file is not byte-identical across runs because `createdAt` is the ingest
  clock; the benchmark compares id to content-hash maps, which are identical.
- Temporary file names inside the store use random bytes; they never appear in an object path or
  in any output.

## Answer key note

An earlier answer key used the creator plus a single topic noun as the second query. At 200 + 200
it scored 100%; at 1,000 + 1,000 it scored 97.38% (3,798 of 3,900), and all 102 misses were
exact-score ties where five or more titles by the same creator carried the same noun. The index was
ranking correctly and the query was ambiguous, so the second query now uses both topic nouns. The
number is recorded here so the change is visible rather than silent.

## Limits of this evidence

- One machine, one process, records processed sequentially. Nothing here measures concurrency,
  multiple writers, or network storage.
- 2,000 records and 71.3 MiB of synthetic text. The corpus is procedural prose, subtitles and
  injected defects built from word lists; it is not a sample of real user documents or transcripts.
- The search index keeps postings for titles and tags in memory, and the near-duplicate sketch map
  keeps 32 entries per record in memory; both grow linearly with the record count. The store never
  deletes anything; garbage collection is out of scope by design.
- No fsync is issued; atomicity relies on rename, consistent with the runner's existing JSON store.
- The symlink refusal path could not be exercised on this account (see the chaos table).
- The 60 s fast-mode budget and every latency figure are specific to this CPU, disk and Windows
  build. Reproduce with the commands above before quoting them elsewhere.
