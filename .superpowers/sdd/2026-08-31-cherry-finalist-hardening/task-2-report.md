# Task 2 report

Status: complete

## Commit

Implementation commits include final transaction fix `9da489301b2769b13e3b818d83bdfba1e2ab70d7`, runner dispatch/poll `666a051b242e70d633aba41c9cceb8a281e6cde3`, manual report compatibility `c5b56017430a7d14c60aea3a1e4b15c8ac35325d`, final status/schema invariants `adb334035b6335f4107b6e9f16fddec1437d8449`, approval-race protection `d2ef480b0b2f1294ad5e6391402b95480c876182`, typed settlement/proof causality `3bb466787cfb1530227f014e9988127242879964`, stale cleanup and remote cancellation `a1a2b60`/`37796aa`, run evidence and immutable binding hardening `85a166f26a5ea0a9cb6940030386fc5855d495cf`/`77755e16f8252b6dcf8045d9510fc5f0de0fbfd6`, and settlement contract alignment `65b1c75`.

## Files changed

- Hardened mission EXECUTING transition to require a current approved skill graph and human actor.
- Added skill graph version-hash validation, duplicate pending approval protection, and human-only decisions.
- Extended routine resume/run validation, persisted RunRecord creation, idempotency handling, settlement with receipt verification, and redacted output.
- Extended RunRecord fields and runner client polling/cancellation helpers.
- Added explicit `reported` status for agent task-result reports so they cannot masquerade as verified success.
- Added typed `settleRoutineRun` settlement-object compatibility with runner token authorization, timestamp/output/argv persistence, and routine proof-event causality.
- Runs history now shows runner job, idempotency, output, error, receipt, and provider evidence without secrets.
- Runner legacy `/jobs` now rejects duplicate idempotency keys.
- Added approval invariant tests.

## Tests

- `npm test -- --run tests/cherry/approval-invariants.test.ts tests/cherry/routines.test.ts tests/cherry/proof.test.ts tests/cherry/schemas.test.ts` — 17 passed.
- `npm test -- --run tests/cherry/webmcp.test.ts tests/cherry/routines.test.ts tests/cherry/proof.test.ts` — 33 passed.
- `npm test` — 144 passed, 2 skipped.
- `npm test -- --run tests/cherry/routines.test.ts tests/cherry/domain-flow.test.ts` — 26 passed.
- `npm run test:runner` — 42 passed.
- `npm run typecheck` — passed.

## Risks / limitations

- Local runner settlement remains an explicit client/domain API; no cloud execution was introduced.
- Existing IndexedDB schema does not index `idempotencyKey`; duplicate detection scans persisted runs (safe but linear).
- Successful settlement validates receipt integrity/hash and presence, but does not cryptographically sign receipts.
