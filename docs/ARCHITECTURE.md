# Cherry architecture

**Date:** 2026-08-30 · **Commit:** 5297dad · **WebMCP section and routes brought current:** 2026-09-03

Cherry is a Vite + React 19 + TypeScript strict SPA with a framework-independent domain core.
The manual UI, the WebMCP tool layer, and the native MCP bridge all call the same validated
services, so an agent can never do something the UI would refuse (AGENTS.md contract).

## Layers

| Layer | Location | Role |
|---|---|---|
| Domain core | `src/cherry/*` | Typed services, models, state machines. No React, no WebMCP, no MCP imports. |
| Persistence | `src/cherry/persistence/` (`cherry-db.ts`, `migrations.ts`, `transactions.ts`) | Dexie/IndexedDB with versioned migrations; every domain mutation emits a ProofEvent in the same transaction. |
| Proof/event ledger | `src/cherry/core/domain-event.ts`, `src/cherry/proof/` | Append-only ProofEvent ledger → receipts hashed with SHA-256 over RFC 8785 canonical JSON (`src/cherry/core/{canonical-json,hash}.ts`). Tamper-evident, recomputable — not signatures. |
| UI pages | `src/pages/` + `src/app/App.tsx` (routes), `src/app/AppState.tsx` | React shell; pages call domain services directly. |
| WebMCP tool layer | `src/cherry/webmcp/` | Registers state/surface-aware site tools on `document.modelContext` (feature-detected). |
| Native MCP / runner bridge | `runner/mcp/server.mjs`, `runner/server.mjs`, client in `src/cherry/runner-client/runner-api.ts` | Optional Node processes; zero dependencies, no build step (decision D-004/D-005). |
| Schemas | `schemas/*.schema.json` | Canonical JSON Schemas (workspace, skillgraph, memory, proof), Draft 2020-12, validated in tests. |
| Design system | `src/design-system/tokens.css` | Token file; palette swaps do not touch components (D-002/D-009). |

## Domain modules (src/cherry)

| Module | Path | Responsibility |
|---|---|---|
| Core | `core/` | Result/error contract, IDs, clock, canonical JSON, SHA-256, ProofEvent types |
| Mission | `mission/` | Mission model + state machine (DRAFT → LEARNING → … → passed) + runs |
| Watch | `watch/` | YouTube URL validation (official nocookie embed only), transcript parsers (.txt/.srt/.vtt), timestamped observations, computed coverage |
| Transcribe | `transcribe/` | On-device Whisper (tiny.en) via transformers.js — WebGPU with WASM fallback; tab-audio capture via `getDisplayMedia` |
| Evidence | `evidence/` | Evidence ledger; everything external starts `untrusted`; trust promotion is human-only |
| SkillGraph | `skillgraph/` | Model, validator, versions, rollback, quick-skill deterministic derivation (`quick-skill.ts`, `auto-draft.ts`) |
| Approval | `approval/` | Exact-revision approvals; enforcement in `skillgraph/skillgraph-service.ts` |
| Memory | `memory/` | Memory Vault, inbox, correction compiler; activation is human-only |
| Artifacts | `artifacts/` | Real versioned files, path validation, sandboxed network-blocked preview (`preview-protocol.ts`) |
| Verify | `verify/` | Deterministic verification (file/DOM/hash/placeholder/a11y/graph assertions) against actual files and state |
| Proof | `proof/` | Receipt compiler + independent verifier (recompute → verified/tampered) |
| Compiler | `compiler/` | Agent Skills bundle export: SKILL.md, MANIFEST hashes, standalone `verify.mjs`, Codex + Claude Code install targets, ZIP via JSZip |
| Notebook | `notebook/digest.ts` | Deterministic extractive digest of sources (no model call) |
| Workforce | `workforce/` | Work items, agent profiles, routines (`routines-service.ts`), attention queue |
| Runner client | `runner-client/` | Browser-side pairing + job API for the local runner |
| WebMCP | `webmcp/` | Tool contract, definitions, aperture tables, registration manager |

## Routes (src/app/App.tsx)

`/` (Landing) · `/showcase` · `/connect` · `/compatibility` · `/ingest` · `/studio` (Command
Center) with children: `control` (Mission Control), `control/:missionId` (Mission Control
detail), `onboarding`, `quick` (Quick Skill), `sources`, `creators`, `inbox`,
`work/:workItemId`, `crew`, `routines`, `routines/:routineId`, `missions/new`,
`missions/:missionId`, `watch/:lessonId`, `memory`, `skills`, `skills/:skillId`,
`artifacts/:artifactSetId`, `runs`, `proof[/:receiptId]`, `agent` (Agent View / MCP inspector),
`settings/connections`. Unknown paths render the 404 view with its own metadata.
Landing links "Try the guided example" to `/studio?demo=1`.

## Golden journey data flow

1. **Lesson** — mission created (`mission-service.ts`); YouTube lesson loads only through the
   official `youtube-nocookie.com/embed` player after permission acknowledgement, or manual
   material (`watch/lesson-service.ts`, `youtube-url.ts`).
2. **Evidence** — transcript paste/upload parsed (`watch/transcript-parser.ts`), observations
   timestamped, coverage computed against declared criteria (`watch/coverage.ts`); each claim
   lands in the evidence ledger as `untrusted` (`evidence/evidence-service.ts`).
3. **SkillGraph** — drafted (manually or via deterministic derivation in
   `skillgraph/quick-skill.ts` — rules, not a model, per D-011), edited, versioned
   (`skillgraph-service.ts`).
4. **Approval** — binds to the exact revision reviewed; any edit invalidates it
   (`approval/`, enforced in `skillgraph-service.ts`).
5. **Artifact** — real HTML/CSS/JS/MD/JSON files written to the artifact workspace,
   previewed in a srcdoc iframe with an empty `sandbox` attribute (no permissions at all,
   `PREVIEW_SANDBOX = ''` in `preview-protocol.ts`), `<script>` elements stripped before
   render, and a `default-src 'none'` / `script-src 'none'` CSP
   (`artifacts/artifact-service.ts`, `preview-protocol.ts`; asserted in
   `e2e/cherry/responsive.spec.ts`).
6. **Verify** — deterministic assertions run against the actual files; failures link to
   evidence; repairs re-verify (`verify/verification-service.ts`).
7. **Memory** — corrections compile into scoped memory proposals; a human approves them into
   the vault (`memory/memory-service.ts`).
8. **Export / receipt** — proof receipt compiled from the ProofEvent ledger and recomputable
   by anyone (`proof/proof-service.ts`, `proof-verifier.ts`); skill bundle exported with
   install targets (`compiler/`); whole workspace exports/imports as id-remapped,
   hash-verified JSON (`persistence/workspace-archive.ts`).

Every step above writes its ProofEvent inside the same IndexedDB transaction
(`persistence/transactions.ts`), so the ledger can always explain the state.

## WebMCP tool surface

Registration: `src/cherry/webmcp/registration-manager.ts` feature-detects
`document.modelContext.registerTool`, registers with AbortController lifecycle, and
re-registers (reporting retired tools) on both mission-state and route-surface changes
(D-015). Aperture cap: ≤ 5 state/surface tools + 7 globals (six reads plus `introduce_agent`,
which only labels the session; the library reads joined the original three on 2026-08-31).
The sources surface (present from main's root commit `27f49e5`, 2026-09-01) and the control
surface with five mission tools (`mission-tools.ts`, `29d05ae`, 2026-09-02) followed;
`run_routine_now` left the routines aperture on 2026-09-02 (`33c6992`).
Tool definitions: `tool-definitions.ts` (mission-state tools), `workforce-tools.ts`
(workforce surface tools) and `mission-tools.ts` (control surface tools). All names below are
read from `TOOL_STATE_TABLE`, `TOOL_SURFACE_TABLE`, and `GLOBAL_TOOLS` as of 2026-09-03.

**Global (always registered):** `read_cherry_context`, `list_cherry_capabilities`,
`get_cherry_status`, `introduce_agent`, `list_skills`, `recommend_skills`, `get_skill`.

**By mission state** (`TOOL_STATE_TABLE`, names as registered with the host;
`SAFE_TOOL_NAME_ALIASES` maps `record_observation`, `derive_skill`, `request_skill_approval`,
`propose_memory` and `run_verification` to the longer original definition names, which
`executeLocal` also accepts):

| State | Tools |
|---|---|
| empty | `start_apprenticeship`, `create_workspace`, `create_mission` |
| onboarding | `start_apprenticeship`, `create_workspace`, `create_mission`, `load_lesson` |
| learning | `load_lesson`, `import_transcript`, `record_observation`, `add_source_evidence`, `derive_skill` |
| planning | `define_skillgraph`, `propose_memory`, `request_skill_approval`, `revise_checkpoint` |
| execution | `write_artifact_file`, `record_task_result`, `run_verification` |
| verification | `run_verification`, `apply_verified_repair`, `read_failed_assertions`, `propose_memory`, `write_artifact_file` |
| passed | `compile_skill_bundle`, `export_proof_receipt`, `export_workspace`, `prepare_runner_job` |

Also defined in `tool-definitions.ts` for the learning flow: `control_lesson_playback`,
`compile_lesson_draft` (declared for the `learning` state but absent from `TOOL_STATE_TABLE`,
so they are callable locally and are not registered with a host).

**By route surface** (`TOOL_SURFACE_TABLE`; route-to-surface mapping in
`src/pages/studio/StudioLayout.tsx`):

| Surface | Tools |
|---|---|
| inbox (`/studio/inbox`, `/studio/work/*`) | `create_work_item`, `read_attention_queue`, `read_work_thread`, `assign_work_item`, `request_work_run` |
| crew (`/studio/crew`) | `list_agent_profiles`, `propose_agent_profile`, `assign_agent_role`, `read_agent_context`, `propose_handoff` |
| routines (`/studio/routines`) | `list_routines`, `draft_routine`, `set_routine_schedule`, `pause_routine` |
| run (`/studio/runs`) | `read_run_status`, `record_run_checkpoint`, `record_task_result`, `request_human_action`, `request_verification` |
| sources (`/studio/sources`, `/studio/creators`) | `list_sources` (rows carry the skill proposal), `save_source`, `request_source_fetch`, `archive_source`, `prepare_source_for_skill` |
| control (`/studio/control`, `/studio/control/:missionId`) | `create_outcome_mission`, `plan_current_mission`, `start_current_mission`, `cancel_current_mission`, `request_mission_action` |

Agents can request but never grant: approvals, trust promotion, and memory activation are
human-only code paths; `transitionWorkItem` refuses SUCCEEDED for agent actors (D-016).
Every call lands in the visible Agent View inspector (`src/pages/studio/AgentView.tsx`).

## Native MCP bridge and runner

- `runner/server.mjs` — loopback-only local runner: pairing token, exact-origin CORS,
  root-restricted working directories, allowlisted executables, `shell:false` spawn,
  output caps + redaction (`runner/lib/redact.mjs`), atomic job persistence.
- Runner v2 (`runner/lib/`): durable queue with leases/idempotency/retry
  (`queue.mjs`), scheduler + routines (`scheduler.mjs`, `schedule.mjs`), durable
  hash-chained events log (`events.mjs`), adapters (`adapters.mjs`). Tested in
  `runner/v2.test.mjs`, which is imported by `runner/runner.test.mjs` so
  `npm run test:runner` covers it.
- `runner/mcp/server.mjs` — stdio MCP bridge for Claude Code / Codex CLI; reads and
  verifies workspace exports only (browser IndexedDB is unreachable from Node — D-005);
  no write/approve/exec tool exists (`runner/mcp/bridge.test.mjs`).

## Test surfaces

- Unit/integration: `tests/cherry/*.test.ts` (vitest, jsdom + fake-indexeddb).
- Runner + bridge + v2: `runner/*.test.mjs`, `runner/mcp/bridge.test.mjs` (node:test).
- E2E: `e2e/cherry/{golden-manual,responsive,workforce,upgrade}.spec.ts` (Playwright,
  builds + previews automatically; includes axe and the hostile-artifact sandbox probe).
