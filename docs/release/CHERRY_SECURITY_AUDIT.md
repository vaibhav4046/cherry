# Cherry security audit

**Date:** 2026-08-29 · **Reviewer stance:** adversarial (post-implementation pass per pack §Phase 5)

## Threat: prompt injection from learning material

- All transcript, webpage, repository, and tool-output content enters the Evidence Ledger with
  `trust: 'untrusted'`; the service layer refuses non-human trust changes
  (`setEvidenceTrust` rejects `actorType !== 'human'` — covered by
  `tests/cherry/domain-flow.test.ts` "evidence trust boundary").
- Memory can only be `proposed` by agents; activation requires `decideMemory` (human). Covered by
  "proposals require approval before becoming active".
- WebMCP tools that return source-derived content carry `untrustedContentHint: true`.
- Transcript parsers strip markup and never execute content; imported text is data everywhere.

**Result: PASS**

## Threat: stale/replayed approvals

- Approvals bind to `objectRevision`; deciding against a changed revision returns `conflict`
  (test: "stale approvals are rejected after a new revision").
- Any revision of an approved graph drops it to `proposed` and clears nothing silently
  (test: "approval binds to the exact revision and revision invalidates it").
- Compiling requires `status === 'approved' && approvedRevision === revision`
  (test: "refuses to compile an unapproved graph").

**Result: PASS**

## Threat: artifact XSS / exfiltration

- Preview iframe: `sandbox="allow-scripts"` only — opaque origin, no same-origin, no popups, no forms,
  no top navigation. Inner meta CSP `default-src 'none'; connect-src 'none'`.
- E2E probe (`responsive.spec.ts` "malicious artifact cannot reach Cherry storage or the network")
  runs a hostile artifact that attempts localStorage/indexedDB access, external fetch, and
  `window.top` navigation: storage throws SecurityError, navigation is blocked, Cherry stays intact.
- Artifact paths reject traversal, absolute paths, backslashes, null bytes, unsupported extensions
  (unit-tested).
- Parent CSP note: see decision D-003 (srcdoc CSP inheritance forces `'unsafe-inline'`); no
  `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `new Function` exists in `src/` (grep-verified).

**Result: PASS** (with documented D-003 trade-off)

## Threat: import corruption / ZIP path traversal

- Workspace import: JSON parse errors, unsupported versions, oversized payloads, over-limit arrays,
  and integrity-hash mismatches are rejected before any write; every record id is remapped so imports
  cannot collide or overwrite (tests: "rejects corrupted and malformed imports…").
- Bundle validation rejects `..`, absolute, and drive-letter paths and mismatched SKILL.md names
  (test: "rejects archives with traversal paths or mismatched names").

**Result: PASS**

## Threat: runner abuse

Runner integration tests (9, all passing) demonstrate:
- loopback bind only; disallowed Origin → 403; missing pairing token → 401;
- unknown adapters → 400; working directories outside approved roots → 400/failed;
- `shell-safe` refuses non-allowlisted executables; spawn uses argument arrays with `shell:false`;
- output caps + secret-shaped redaction verified; timeout kill path implemented;
- jobs persist atomically and resume `running → queued` after crash;
- provider exit codes are recorded with `verifiedSeparately: true` and never mark a mission verified.

**Result: PASS**

## Threat: secret leakage

- Grep scan over `src/`, `runner/`, `scripts/`, `public/`, `schemas/`, configs: no credential-shaped
  strings, no `api_key=`, no tokens. `.env*` is gitignored; `.env.example` contains no values.
- The client never asks for or stores provider credentials; the runner never dumps `process.env`;
  captured output is redacted.
- No analytics, no telemetry, no external POSTs anywhere in the client (connect-src limits to self +
  127.0.0.1 runner).

**Result: PASS**

## Threat: false claims in UI

- Verification badges render only from stored `VerificationReport` records; there is no code path that
  sets a verification result without running evaluators.
- Receipts are labelled "tamper-evident … not a cryptographic signature" in the UI and docs.
- WebMCP unavailability shows "manual mode" honestly; runner-off shows waiting states, never running.
- Coverage "complete" requires declared criteria (unit-tested).

**Result: PASS**

## Consumer-site automation

- None. The YouTube integration is the official iframe embed with `enablejsapi`; no scraping of
  captions or media, no undocumented endpoints, no login automation of any provider site.

**Result: PASS**
