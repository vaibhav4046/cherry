# God Mode scale benchmark

A 2000-record local benchmark on one machine. It is not evidence for any larger claim.

Generated 2026-09-02T13:10:23.436Z by `node scripts/god-mode/run-scale-benchmark.mjs --documents 1000 --media 1000 --seed 20260902 --out docs/release/benchmarks` on commit `ad046d4056b4990a37178fd8db0a5b79c9b609ee`.

## Machine

| Fact | Value |
| --- | --- |
| CPU | 12th Gen Intel(R) Core(TM) i5-12450HX (12 logical cores) |
| Memory | 15.71 GiB |
| Platform | win32 10.0.26200 x64 |
| Node | v24.12.0 |

## Corpus

| Fact | Value |
| --- | --- |
| Seed | 20260902 |
| Manifest SHA-256 | `92f2699637d5d87d43c057c3c239584939e8abe7b550d6d22c1ec1d35d088d7a` |
| Records | 2000 (1000 documents, 1000 media) |
| Bytes | 71.3 MiB |
| Documents by category | normal 600, exact_duplicate 100, near_duplicate 100, hostile 75, corrupt 50, large 50, unicode 25 |
| Media by category | normal 700, exact_duplicate 100, near_duplicate 75, metadata_only 50, malformed 25, hostile 25, long 25 |
| Source | generated into a temporary directory, deleted after the run |
| Ingest order | sorted by record id; ids are a seeded permutation, so originals do not necessarily precede their duplicates |

## Ingest

| Metric | Value |
| --- | --- |
| Total wall time | 13496.76 ms (corpus generation 5353.09 ms, not included) |
| Records per second | 148.18 |
| Per-record latency p50 / p95 / p99 / max | 4.227 / 15.335 / 67.332 / 138.338 ms |
| Batch size / batches | 50 / 40 |
| Processed / accepted | 2000 / 1750 |
| Peak RSS / peak heap used | 320.4 MiB / 149 MiB (process.memoryUsage() before the run and after every batch) |
| Store growth | 68.7 MiB (1750 objects, index 1.5 MiB) |
| Max single record | 1006.8 KiB |
| Exact duplicates eliminated | 200 of 200 (100%) |
| Near duplicates linked | 175 of 175, 0 false links |
| Corrupt records isolated | 50 (invalid_metadata 16, empty_body 17, invalid_utf8 17) |
| Hostile records | 100 of 100 accepted as inert text, 100 stored verbatim |
| Entity and step keys | 1750 of 1750 records match the answer key |
| Provenance | 0 of 1750 accepted records missing sourceId or trust |
| Malformed subtitles | 25 of 25 accepted with the expected warnings |
| Long transcripts | 25 of 25 accepted with more than three hours of cues |
| Metadata-only media | 50 of 50 accepted under the canonical metadata hash |
| Large documents | 50 of 50 accepted with the source hash |
| Unicode documents | 25 of 25 accepted with the source hash |

## Retrieval

| Metric | Value |
| --- | --- |
| Queries | 3900 |
| Answer key in top 5 | 3900 (100%) |
| Latency p50 / p95 / p99 / max | 0.188 / 0.402 / 0.886 / 5.6 ms |
| Method | BM25 over tokenised title and tags only; bodies are never indexed for search |

## Restart recovery

| Metric | Value |
| --- | --- |
| Method | throw from the per-record hook mid-batch, construct a fresh pipeline over the same store directory, run every source again |
| Crashed at record | 166 (3 full batches, mid-batch true) |
| Accepted before crash / recovered from index | 158 / 1750 |
| Skipped on resume / accepted after resume | 158 / 1750 |
| Duplicate accepted records | 0 |
| Matches the uninterrupted run | true |

## Cancellation

| Metric | Value |
| --- | --- |
| Method | AbortController aborted from the per-record hook mid-batch; the pipeline checks the signal before every record |
| Aborted at record | 112 (mid-batch true) |
| Status / processed / accepted | cancelled / 112 / 108 |
| Index reloaded / recover warnings | 108 / 0 |
| Consistent | true |

## Targets and invariants

| Result | Kind | Check | Actual | Target |
| --- | --- | --- | --- | --- |
| met | invariant | exact duplicates eliminated | 100% (200 of 200) | 100% |
| met | invariant | near duplicates linked, no false links | 175 linked, 0 false | 175 linked, 0 false |
| met | invariant | corrupt records isolated with the expected reason | 50 of 50 (50 isolated in total) | 50 |
| met | invariant | hostile records inert and stored verbatim | 100 inert, 100 verbatim | 100 |
| met | invariant | restart recovery without duplicate accepted records | 0 duplicates, matches true | 0 duplicates, same result as the uninterrupted run |
| met | invariant | cancellation leaves the index consistent | true | consistent |
| met | invariant | provenance on every accepted record | 0 missing of 1750 | 0 missing |
| met | invariant | no execution or network path for bodies | 0 violations | 0 forbidden tokens |
| met | invariant | entity and step keys extracted as expected | 1750 of 1750 | 100% |
| met | target | retrieval p95 under 1000 ms | 0.402 ms | < 1000 ms |
| met | target | retrieval answer key in top 5 | 100% (3900 of 3900) | >= 95% |
| met | target | ingest p95 under 100 ms per record (harness-chosen) | 15.335 ms | < 100 ms |

All invariants hold.

## No execution path

The modules that read record bodies (runner/lib/storage/*.mjs and scripts/god-mode/generate-corpus.mjs) never import child_process, vm, http, net or WebSocket and never call eval, Function, fetch or a dynamic import. No ingested body can reach an execution or network path because none exists in that code. The benchmark driver imports child_process for one call, git rev-parse HEAD, made before any record is read.

Files checked: `runner/lib/storage/cas.mjs`, `runner/lib/storage/ingest-pipeline.mjs`, `runner/lib/storage/record-index.mjs`, `runner/lib/storage/text.mjs`, `scripts/god-mode/generate-corpus.mjs`. Forbidden tokens: `eval(`, `new Function`, `Function(`, `child_process`, `node:vm`, `fetch(`, `dynamic import()`, `node:http(s)`, `node:net`, `WebSocket`. Violations: 0.

## Isolated records

| Record | Kind | Reason |
| --- | --- | --- |
| doc-00010 | document | invalid_metadata (Unterminated string in JSON at position 117 (line 5 column 8)) |
| doc-00011 | document | empty_body |
| doc-00077 | document | invalid_metadata (Unterminated string in JSON at position 116 (line 5 column 8)) |
| doc-00120 | document | empty_body |
| doc-00157 | document | empty_body |
| doc-00196 | document | empty_body |
| doc-00211 | document | invalid_metadata (Unterminated string in JSON at position 114 (line 5 column 9)) |
| doc-00246 | document | invalid_utf8 |
| doc-00277 | document | empty_body |
| doc-00278 | document | invalid_utf8 |
| doc-00304 | document | empty_body |
| doc-00316 | document | invalid_metadata (Unterminated string in JSON at position 121 (line 5 column 5)) |
| doc-00322 | document | empty_body |
| doc-00332 | document | invalid_metadata (Unterminated string in JSON at position 118 (line 5 column 6)) |
| doc-00350 | document | invalid_metadata (Unterminated string in JSON at position 117 (line 5 column 5)) |
| doc-00354 | document | invalid_metadata (Unterminated string in JSON at position 117 (line 5 column 5)) |
| doc-00449 | document | invalid_utf8 |
| doc-00452 | document | empty_body |
| doc-00458 | document | invalid_metadata (Unterminated string in JSON at position 116 (line 5 column 9)) |
| doc-00488 | document | empty_body |
| doc-00512 | document | invalid_metadata (Unterminated string in JSON at position 115 (line 5 column 7)) |
| doc-00542 | document | invalid_metadata (Unterminated string in JSON at position 116 (line 5 column 7)) |
| doc-00561 | document | invalid_utf8 |
| doc-00571 | document | invalid_utf8 |
| doc-00583 | document | invalid_utf8 |
| doc-00592 | document | invalid_utf8 |
| doc-00604 | document | invalid_metadata (Unterminated string in JSON at position 117 (line 5 column 5)) |
| doc-00608 | document | empty_body |
| doc-00623 | document | invalid_utf8 |
| doc-00629 | document | invalid_utf8 |
| doc-00635 | document | empty_body |
| doc-00645 | document | empty_body |
| doc-00664 | document | invalid_utf8 |
| doc-00707 | document | invalid_metadata (Unterminated string in JSON at position 117 (line 5 column 5)) |
| doc-00756 | document | invalid_metadata (Unterminated string in JSON at position 116 (line 5 column 5)) |
| doc-00799 | document | invalid_utf8 |
| doc-00826 | document | empty_body |
| doc-00834 | document | invalid_utf8 |
| doc-00863 | document | invalid_utf8 |
| doc-00882 | document | empty_body |
| doc-00885 | document | invalid_metadata (Unterminated string in JSON at position 116 (line 5 column 6)) |
| doc-00888 | document | empty_body |
| doc-00892 | document | empty_body |
| doc-00922 | document | empty_body |
| doc-00931 | document | invalid_utf8 |
| doc-00949 | document | invalid_utf8 |
| doc-00953 | document | invalid_metadata (Unterminated string in JSON at position 114 (line 5 column 8)) |
| doc-00960 | document | invalid_utf8 |
| doc-00985 | document | invalid_utf8 |
| doc-00991 | document | invalid_metadata (Unterminated string in JSON at position 114 (line 5 column 9)) |
