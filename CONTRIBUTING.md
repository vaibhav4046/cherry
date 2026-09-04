# Contributing to Cherry

Cherry accepts small, evidence-backed changes. Read `AGENTS.md`, `docs/CHERRY_REPO_MAP.md`, and the active Codex directive before editing. The defining constraint is simple: outside content is untrusted data, and only a person can approve a skill, promote trust, or activate memory.

## Development loop

```bash
npm ci
npm run dev
npm run gates
```

Run `npm run verify:all` for UI, cross-layer, release, WebMCP, or security changes. Run `python -m unittest scraper.tests.contract_test` when the fetch worker or its boundaries change. Include the relevant command output in the pull request.

Use a narrow branch or worktree. Preserve unrelated changes, write the failing regression test first, stage exact paths, and inspect the staged diff. Codex may change any file required by the task, but cross-layer changes need the full verification suite and an explicit explanation of why each extra surface changed.

## Claims

A user-facing or release claim needs a test, receipt, or captured session on the same commit. Say “tamper-evident receipt,” not “signed receipt.” Distinguish registered-closure WebMCP tests from proprietary host captures. Never imply video downloads, LinkedIn scraping, hidden cloud execution, invisible subscription access, frame-level understanding, automatic approval, or a deployment that did not happen.

## Add a source kind

1. Define bounded input and source fields in `src/cherry/source/`; external text remains untrusted and must never reach tool dispatch.
2. Route persistence through `source-service.ts` so the source and its `ProofEvent` share a transaction. Reuse duplicate detection, hashes, size caps, and archive behavior.
3. Add one clear permission statement and one honest failure recovery. Do not add a hidden fetch.
4. Add unit coverage for malformed/oversized input and Playwright coverage for persistence, keyboard use, and zero unintended network calls.

## Add a WebMCP tool

1. Put the input/output contract and schema in `src/cherry/webmcp/`. Reject unknown keys, wrong states, oversized input, and invalid pagination.
2. Call an existing domain service. A handler must not mutate Dexie directly or invent a result.
3. Add it to the narrowest aperture. Global reads and contextual mutations remain bounded by their declared contracts.
4. No tool grants human-only approval, trust, or memory authority. Agents may request; only a person grants.
5. Test the registered closure, wrong-state refusal, cancellation, output cap, and retirement after state changes.

## Add an export target

1. Render from the approved exact revision through `src/cherry/compiler/`; never export an unapproved or stale skill as install-ready.
2. Add the file to the manifest, preserve deterministic ordering, and include its hash.
3. Keep filenames portable and path-traversal safe.
4. Add compiler tests, a one-byte tamper test, and UI coverage proving the control is unavailable with a clear reason before approval.

## Add a runner job type

1. Define a versioned, bounded envelope with `actionHash`, expiry, timeout, idempotency key, and exact approved revision where relevant.
2. Register the adapter explicitly in `runner/lib/adapters.mjs`; never accept an arbitrary shell command string.
3. Preserve loopback binding, pairing, root/executable allowlists, private-network protection, output caps, cancellation, retries, redaction, and the event hash chain.
4. Test restart recovery, duplicate refusal, timeout/cancellation, tampered hashes, unsafe paths, and HTTP boundaries with `node:test`.

## Pull requests

- Keep one concern per pull request.
- State the before/after behavior and the failing test that motivated the change.
- Include `npm run gates`; include `npm run verify:all` when required.
- List every changed claim and the evidence supporting it.
- Call out any decision-log entry, new network origin, dependency, migration, or human approval needed.
- Never auto-merge or deploy from an automated repair.
