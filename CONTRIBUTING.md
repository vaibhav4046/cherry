# Contributing to Cherry

Cherry welcomes small, evidence-backed changes. Read `AGENTS.md` and `docs/CHERRY_REPO_MAP.md`
before editing. The product's defining constraint is simple: creator
content is untrusted data, and only a person can approve a skill, trust promotion, or memory.

## Development loop

```bash
npm ci
npm run dev
npm run gates
```

Run `npm run verify:all` for UI, cross-layer, release, or security changes. Run
`python -m unittest scraper.tests.contract_test` when the fetch worker or its boundaries change.
Include the relevant command output in the pull request.

Use a narrow branch or worktree. Preserve unrelated changes, write the failing regression test
first, stage exact paths, and inspect the staged diff. The lane map in
`docs/codex-takeover/06_OPERATING_MODEL.md` prevents collisions; if another owner controls the
file, record the need in the append-only status ledger instead of editing across the lane.

## Claims

A user-facing or release claim needs a test, receipt, or captured session. Say “tamper-evident
receipt,” not “signed receipt.” Distinguish registered-closure WebMCP tests from a proprietary live
host. Never imply video downloads, LinkedIn scraping, hidden cloud execution, invisible subscription
access, frame-level understanding, or automatic approval.

## Add a source kind

1. Define the bounded input and provenance fields in `src/cherry/source/`; external text remains
   untrusted and must never reach tool dispatch.
2. Route persistence through `source-service.ts` so the source and its `ProofEvent` share a
   transaction. Reuse duplicate detection, hashes, size caps, and archive behavior.
3. Add the visible flow in the Sources lane with one permission statement and one honest failure
   recovery. Do not add a background fetch.
4. Add unit coverage for malformed/oversized input and Playwright coverage for provenance,
   persistence, keyboard use, and zero unintended network calls.

Worked outline: a future local `.csv` note importer would parse a capped UTF-8 file in the browser,
store `fetchMethod: upload`, preserve the filename and SHA-256 content hash, and require the same
human review as every other outside source.

## Add a WebMCP tool

1. Put the input/output contract and schema in `src/cherry/webmcp/`. Reject unknown keys, wrong
   states, huge input, and out-of-range pagination.
2. Call an existing domain service. A tool handler must not mutate Dexie directly or invent a result.
3. Add it to the narrowest surface aperture: Cherry registers seven global tools plus at most five
   contextual tools for the current state. The `introduce_agent` global records a session label; the
   other global reads and every contextual tool remain bounded by their declared contracts.
4. No global or contextual tool grants human-only approval, trust, or memory authority. Agents may
   request those decisions; only a person may grant them.
5. Test the registered closure, wrong-state refusal, JSON parseability, result cap, and retirement
   after the state changes.

Worked outline: a read-only `list_source_drafts` tool would return capped identifiers and source
labels, not raw full documents, and would remain unavailable if the source service cannot validate
the active space.

## Add an export target

1. Render from the approved exact revision through `src/cherry/compiler/`; never export an
   unapproved or stale skill as install-ready.
2. Add the file to the bundle manifest, preserve deterministic ordering, and include its hash.
3. Keep filenames portable and path-traversal safe.
4. Add compiler unit tests, a one-byte tamper test, and a UI test proving the control is disabled
   with a plain reason before approval.

Worked outline: a future `GEMINI.md` target would reuse the approved skill/evidence renderers, add
one deterministic file entry, and pass the existing standalone `verify.mjs` manifest check.

## Add a runner job type

1. Define a versioned, size-bounded envelope with an `actionHash`, expiry, timeout, idempotency key,
   and exact approved revision where relevant.
2. Register the adapter explicitly in `runner/lib/adapters.mjs`; never accept a shell command
   string or an undeclared executable.
3. Preserve loopback binding, pairing, root/executable allowlists, private-network protection,
   output caps, cancellation, retries, redaction, and the event hash chain.
4. Test restart recovery, duplicate refusal, timeout/cancellation, tampered hashes, unsafe paths,
   and HTTP boundary behavior with `node:test`.

Worked outline: a future static document converter would accept only an approved input path below an
allowed root and exact argv for an allowlisted executable, then return bounded metadata rather than
arbitrary stdout.

## Pull requests

- Keep one concern per pull request.
- State the before/after behavior and the failing test that motivated the change.
- Paste `npm run gates` output; add `npm run verify:all` when required.
- List every changed claim and the evidence that supports it.
- Call out any decision-log entry, new network origin, dependency, migration, or owner-lane handoff.
