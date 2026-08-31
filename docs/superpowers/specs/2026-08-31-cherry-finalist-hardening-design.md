# Cherry WebMCP finalist hardening design

## Status

Approved design shape: 2026-08-31. This document turns the approved shape into an implementation contract for Cherry at commit `0b10a40`.

## Goal

Make Cherry a credible, honest lesson-to-skill execution layer whose shortest visible path is Teach → Extract → Shape → Approve → Prove → Remember → Run → Carry, with real persisted provenance, human-only approval gates, inspectable local routine runs, state-aware WebMCP tools, and a production-ready release record.

## Scope and non-goals

In scope:

- A persisted memory graph projection and accessible fallback in `/studio/memory`.
- Domain-enforced skill, memory, mission, routine, run, receipt, provenance, and approval invariants.
- A visible local-runner lifecycle connected to approved routines, including honest setup and failure states.
- A top-level, narrow, state-aware WebMCP aperture that an attached browser agent can use for every safe stage.
- A coherent `/showcase` story and restrained wine/pink visual system across home, showcase, and Studio.
- Explicit source extraction modes and provenance for pasted transcript, SRT/VTT, local media, tab capture, local Whisper, official YouTube embed, and labelled offline sample.
- Unit, integration, accessibility, responsive, hostile-input, reload, receipt, export, and WebMCP E2E coverage.
- Fresh release evidence and consistent release documents; deployment verification only for an already-linked Vercel project.

Out of scope:

- Cloud sync, cloud workers, billing, arbitrary browser control, arbitrary YouTube scraping, or a second orchestration framework.
- Fabricated AI-provider calls, frame-level vision claims, external credentials, or an approval path available to an agent.
- Replacing the existing local-first IndexedDB architecture or the existing proof-event ledger.

## Product decisions

1. **One truth layer.** UI, WebMCP, and runner integrations call the same domain services. No UI or protocol handler writes IndexedDB directly.
2. **Approval is exact and human.** A skill approval binds to a graph revision and content hash; a routine approval binds to its own revision, action hash, and the approved skill revision. Agent tools may request approval but cannot decide it.
3. **The graph is a projection, not a second store.** Graph nodes and edges are derived from persisted records and proof events on demand, with stable IDs and provenance links.
4. **Execution is local and observable.** A routine run is only successful when a connected local runner returns a verified result. No runner means setup-required; a non-zero exit means failed.
5. **Evidence is scoped.** Receipts include only records and events causally linked to the mission/run; unrelated workspace activity is excluded. Redacted deletion references remain explainable without retaining sensitive content.
6. **Honest source labels.** Every lesson displays its extraction mode, timestamp/confidence where available, trust level, and provenance. The UI explicitly says when frame-level vision is not implemented.
7. **Premium glass visual hierarchy.** The attached reference is treated as visual direction only: a warm paper/ink canvas carries translucent frosted panels, thin carbon outlines, subtle backdrop blur, and icon-led wayfinding. Cherry wine/pink remains the accent rather than a full-screen gradient. One display face plus one UI face, fewer cards, strong whitespace, and visible focus states keep the glass from becoming ornamental. Motion explains state transitions only and is disabled for non-essential motion under `prefers-reduced-motion`.

## Architecture

### Truth and persistence

Existing `src/cherry/*` services remain the only mutation boundary. Add focused read/projection modules rather than broad rewrites:

- `src/cherry/memory/memory-graph.ts`: `buildMemoryGraph(workspaceId, missionId?)` returns `{ nodes, edges, generatedAt }` from lessons, transcript segments, observations, evidence claims, skill graphs/revisions, memories, routines, verification reports, artifacts, proof receipts, and proof events.
- `src/cherry/memory/memory-graph-model.ts`: discriminated node/edge types, provenance summaries, status/version presentation helpers.
- `src/cherry/memory/memory-policy.ts`: scope, sensitivity, expiry, and trust filters used by context selection and graph display.
- Existing domain mutation services gain expected-revision and actor checks where audits found gaps; every mutation continues to use `withWorkspaceTx` and emit a `ProofEvent`.

The graph projection uses actual IDs. Required mappings are:

| Required node | Source record |
|---|---|
| source | lesson/source record |
| transcript segment | parsed transcript segment |
| observation | watch observation |
| evidence claim | evidence record |
| skill node | skill graph node |
| approved skill revision | approved graph snapshot/revision |
| memory proposal / approved memory | memory record by status |
| routine | routine record |
| verification result | verification report |
| artifact | artifact/version record |
| proof receipt | proof receipt |

Edges are only emitted when the persisted foreign-key/provenance relationship exists: source→transcript, transcript→observation, observation→evidence, evidence→skill node, skill revision→memory proposal, memory→routine, skill→artifact, artifact→verification, verification→receipt. A missing relation is omitted and reported in the graph's explainable diagnostics instead of guessed.

### Execution

Extend `routines-service.ts` and `runner-client/runner-api.ts` around a persisted `RunRecord` lifecycle:

1. Validate enabled routine, human approval, exact routine revision/action hash, and still-approved skill revision.
2. Create a run record with idempotency key and `requestedAt`.
3. If local runner status is unavailable, settle the run as `setup-required` with actionable pairing instructions.
4. Submit an allowlisted adapter/argv to the loopback runner without shell interpolation.
5. Poll/receive status, persist `startedAt`, `endedAt`, status, command/adapter, redacted output summary, and receipt reference.
6. Recompute/verify the receipt before marking success. Preserve failed and cancelled runs; expose rerun as a new run.

Changing the underlying skill revision, routine revision, schedule, enabled state, or action hash invalidates approval and prevents execution until the human re-approves.

### WebMCP

`WebMcpRegistrationManager` remains registered from the top-level app. The active aperture is the intersection of route surface and product state. Registration metadata declares read/write, required approval, and side effects. Each closure re-checks the current state and active IDs at invocation time, so a retired tool cannot mutate stale state. Mutations call the shared app refresh callback and switch active selections when appropriate. Errors return structured, redacted details; output byte limits are enforced after UTF-8 encoding.

Safe tool sequence:

`read_cherry_context`, `list_cherry_capabilities`, `introduce_agent`, `get_cherry_status`, `start_apprenticeship`, `create_workspace`, `create_mission`, `load_lesson`, `import_transcript`, `record_observation`, `derive_skill`, `request_skill_approval`, `propose_memory`, `draft_routine`, `run_verification`, `export_workspace`.

No tool decides a skill, memory, or routine approval. `run_verification` and `export_workspace` are explicit about their side effects and remain bounded to the active workspace/mission.

### UI and visual system

`/showcase` opens with a single thesis (“A lesson becomes a proven routine you can run”) and a compact live progress rail. Primary action is the labelled sample or start-fresh path; reset/refresh are secondary. The page surfaces what is happening, what was learned, the next action, the approval boundary, and proof evidence in plain language.

`/studio/memory` lazy-loads the graph component after first paint. The graph is a semantic SVG/DOM projection with keyboard-focusable nodes, provenance side panel, visible proposed/approved/rejected/superseded styles, and a synchronized table/list fallback. Empty state explains how to create the first source. Reduced motion removes layout animation.

`/studio/routines` and routine detail show the approved skill revision, schedule, next run, runner connection state, run history, output summary, receipt link, and rerun/setup actions. They never imply cloud execution.

Source UI labels the extraction mode exactly: “Transcript supplied”, “Local Whisper”, “Tab capture”, or “Deterministic sample”. Official YouTube embed is an embed only; pasted transcript remains user supplied. Confidence/timestamps are shown only when present. A note states that frame-level vision is not implemented.

Tokens are consolidated in `src/design-system/tokens.css` and shared CSS: deep cherry, wine, blush, paper, ink, glass-white, glass-border, and mint/status colors; translucent surfaces use `backdrop-filter` with an opaque fallback; shadows and gradients are limited to one soft ambient canvas treatment and never carry information; minimum 44px controls; visible `:focus-visible`; responsive stacking; and one earned transition per approval/verification/receipt beat. Navigation, graph nodes, source modes, approval states, and runner states use the existing `src/components/Icons.tsx` icon primitives (with text labels and ARIA names), never emoji or decorative glyphs.

## Error and trust handling

- All async page mutations use `try/finally` and render an in-page alert on failure.
- Errors identify the failed stage and actionable next step, without secrets or raw hostile payloads.
- External text/artifacts are untrusted and isolated; artifact previews retain sandbox/CSP boundaries.
- Sensitive memory content is not printed in proof summaries or logs. Deleted records leave redacted ledger references.
- Missing Privy configuration remains setup-required; no auth claim is shown in guest mode.

## Testing and evidence

Add tests before implementation for each new invariant and execute them red→green. Coverage must include:

- Graph node/edge provenance, status/version display, fallback accessibility, keyboard operation, reduced motion, lazy load, and reload survival.
- Approval exactness and agent denial for skills, memories, routines, mission execution, revision/schedule invalidation.
- Local runner setup, success, non-zero failure, rerun, idempotency, redacted output, receipt tamper detection, and persisted history.
- WebMCP registration from top-level, state/surface transitions, retired closure refusal, origin/postMessage validation, UTF-8 output caps, and no approval tool.
- Transcript/SRT/VTT/media modes, Whisper failure, confidence/timestamp/provenance, official embed and offline sample labels.
- Hostile artifact isolation, export tamper detection, cross-mission receipt isolation, no secret-shaped values in logs/release files, mobile overflow, and E2E golden journey.

The fresh E2E run is canonical. `docs/release/e2e-results.json` is generated by the test run and its count is copied into `BUILD_STATUS.md`, `TEST_EVIDENCE.md`, `RESCUE_BASELINE.md`, `WINNER_LOOP.md`, and release notes; no prior counts or commit hashes are reused.

## Deployment verification

After all gates pass, run the production preview locally, verify desktop/mobile routes and console/asset health, then inspect the already-linked Vercel project at `https://cherry-wine.vercel.app`. Deploy only if credentials and project linkage are already configured. The duplicate alias remains a redirect/owner-action limitation if dashboard access is unavailable.

## Success criteria

The implementation is complete only when all requested npm gates pass, the graph is real and accessible, routine output is real and persisted, WebMCP tools work in a compatible host without bypassing approval, `/showcase` explains Cherry without narration, release documents share one fresh test count, and remaining limitations are visible in both UI and release docs.
