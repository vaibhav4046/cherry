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

- Preview iframe: inert `sandbox=""` with `referrerpolicy="no-referrer"`; artifact JavaScript cannot
  run at all. Inner meta CSP starts with `default-src 'none'; script-src 'none'; connect-src 'none'`.
- The preview builder removes scripts, event handlers, forms, links, refresh/navigation targets,
  external resources, and CSS URL/import loads before constructing `srcdoc`.
- E2E probe (`responsive.spec.ts` "malicious artifact is rendered as static content with no
  navigation or network") confirms the hostile markup stays static and does not execute.
- Artifact paths reject traversal, absolute paths, backslashes, null bytes, unsupported extensions
  (unit-tested).
- No preview bridge or `postMessage` proof-write path remains.

**Result: PASS**

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
- No analytics or telemetry. Network access is constrained by the deployment CSP and explicit
  product surfaces: self, the loopback runner, configured Privy, Hugging Face model assets, fonts,
  and the YouTube embed. User-triggered runner fetches stay visible and fail closed.

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

## Adversarial re-review — 2026-08-30 (independent refutation pass)

A second, independent pass whose explicit job was to REFUTE the five highest-risk claims.

| Claim | Verdict | Notes |
|---|---|---|
| Artifact preview sandbox network-blocked + isolated | CONFIRMED, strengthened later | Current preview is inert `sandbox=""`, CSP `script-src 'none'`, and sanitized static `srcdoc`; pinned by unit and `e2e/cherry/responsive.spec.ts` tests |
| Exact-revision approval binding; no tool can approve | CONFIRMED | `decideSkillGraphApproval` rejects replay + stale revision; approval function never registered as a WebMCP tool |
| Transcript/article text cannot become tool policy | CONFIRMED | no eval/innerHTML in `src/`; `untrustedContentHint` on ingest tools; trust raised only by the user |
| Bundle/receipt tamper detection, hash not signature | CONFIRMED | RFC 8785-style canonical JSON + SHA-256; one-byte tamper pinned by unit test and `scripts/verify-release.mjs` |
| YouTube bridge origin/source validation | REFUTED as previously worded — FIXED same day | Outbound player commands used wildcard `'*'` targetOrigin and inbound messages did not check `event.source`. Practical severity was low (`event.origin` allowlist and JSON-parse guard were already in place; messages carry playback commands only, no secrets). |

Fixes landed 2026-08-30:

- `src/pages/studio/Watch.tsx`: outbound `postMessage` now targets the exact embed origin
  `https://www.youtube-nocookie.com` (never `'*'`), and the inbound handler rejects any message
  whose `event.source` is not the player iframe's `contentWindow`.
- `src/pages/studio/Artifacts.tsx`: the later static-preview hardening removed artifact scripts and
  the preview message listener entirely, eliminating that proof-event path.

Sweep results: no credential-shaped strings outside deliberate redaction-test fixtures; no
`eval` / `new Function` / `dangerouslySetInnerHTML` / `innerHTML` in `src/`; no sensitive
`console.log` in production paths.
