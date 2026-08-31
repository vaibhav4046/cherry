# WebMCP changelog

**Scope:** every change to Cherry's WebMCP surface — in-page tool definitions
(`src/cherry/webmcp/`), the native MCP bridge (`runner/mcp/`), and their tests
(`tests/cherry/webmcp.test.ts`).

## Eligibility

The WebMCP hackathon requires evidence of WebMCP work done after **August 25, 2026**.
This repository's first commit (`ed6dcdc`) is dated **2026-08-29**. All WebMCP work in
Cherry therefore postdates the cutoff and qualifies; nothing below is back-ported or
pre-existing.

## Dated changes (from git history, oldest first)

### 2026-08-29 · `ed6dcdc` — v1.0.0: WebMCP layer created
- Entire WebMCP surface lands in one commit: `registration-manager.ts` (147 lines),
  `tool-contract.ts` (74), `tool-definitions.ts` (793), plus the native MCP bridge
  (`runner/mcp/server.mjs`, 180 lines; `runner/mcp/bridge.test.mjs`, 145) and the
  mock-host unit suite (`tests/cherry/webmcp.test.ts`, 196 lines).
- Establishes the model from day one: tools registered via
  `document.modelContext.registerTool` behind feature detection, selected by mission
  state, aperture-capped, with hard boundaries (no tool grants approval, promotes
  trust, or activates memory).

### 2026-08-29 · `a288261` — v1.1.0: MCP inspector / host diagnostics
- Registration manager gains a session-local tool-call log (`ToolCallLogEntry`):
  every real invocation records name, timestamp, ok/error (derived from the result
  shape), a 160-char result preview, and whether it came from a host or a local call.
- Snapshot now also exposes `recentlyRemoved` (tools retired by the last state
  change) — this feeds the in-app MCP inspector UI. +48 lines of tests.

### 2026-08-29 · `4d6b32a` — v1.3.0: multi-source tools + live Claude host proof
- Two tools added to the learning aperture: `import_transcript` (agent-supplied
  transcript text, replace/append modes) and `generate_quick_skill` (deterministic
  skill derivation from a lesson).
- Native MCP bridge validated in a live Claude Code host (decision D-012). +80 lines
  of tests.

### 2026-08-30 · `15cb3d7` — auto-assigned agent + `introduce_agent`
- A WebMCP host is auto-assigned to the active workspace/mission the moment it
  attaches — no create/configure step. Snapshot exposes
  `agent: { attached, name }`.
- New global tool `introduce_agent`: the agent names itself from chat; the name only
  labels the session for the human and explicitly grants no authority (approvals,
  trust, memory stay human-only). +22 lines of tests.

### 2026-08-30 · `f8a58a0` — surface-selected workforce apertures
- New `workforce-tools.ts` (470 lines): four apertures selected by **route/surface**
  rather than mission state — `inbox`, `crew`, `routines`, `run` — each capped at
  five tools on top of the global reads (`TOOL_SURFACE_TABLE`).
- Registration manager gains surface selection alongside state selection; decisions
  D-014..D-016 recorded. +36 lines of tests.

### Related (context, not WebMCP-surface commits)
- 2026-08-30 · `f6c9591` — workforce domain core + crew/inbox/thread surfaces: the
  services the workforce apertures call into (`src/cherry/workforce/`).
- 2026-08-30 · `ff07b8f` — runner v2 host adapters (verify/export/codex-cli/
  claude-cli/safe-command): the native-host execution side that
  `prepare_runner_job` and the run aperture hand off to.

## Current tool surface (as of 2026-08-31)

Selection rule: active tools = **3 global reads + at most 5 tools** from either the
mission-state aperture (`TOOL_STATE_TABLE`, `tool-definitions.ts`) or the
route-selected surface aperture (`TOOL_SURFACE_TABLE`, `workforce-tools.ts`);
`registration-manager.ts` enforces the ≤5 cap with a hard `slice(0, 5)`. Without a
WebMCP host, zero tools register and the app runs in honest manual mode.

### Global (always active)
`read_cherry_context` · `list_cherry_capabilities` · `introduce_agent` ·
`get_cherry_status` *(global read, added 2026-08-31)*

### By mission state (`TOOL_STATE_TABLE`)
| State | Tools |
|---|---|
| empty | `start_apprenticeship` *(added 2026-08-31)*, `create_workspace`, `create_mission` |
| onboarding | `start_apprenticeship` *(added 2026-08-31)*, `create_workspace`, `create_mission`, `load_lesson` *(added to this aperture 2026-08-31 — fixes the DRAFT deadlock)* |
| learning | `load_lesson`, `import_transcript`, `record_lesson_observation`, `add_source_evidence`, `generate_quick_skill` |
| planning | `define_skillgraph`, `propose_memory_rule`, `request_checkpoint_approval`, `revise_checkpoint` |
| execution | `write_artifact_file`, `record_task_result`, `request_consequential_action`, `run_cherry_verification` |
| verification | `run_cherry_verification`, `apply_verified_repair`, `read_failed_assertions`, `propose_memory_rule`, `write_artifact_file` |
| passed | `compile_skill_bundle`, `export_proof_receipt`, `prepare_runner_job`, `request_consequential_action` |

### By surface/route (`TOOL_SURFACE_TABLE`)
| Surface | Tools |
|---|---|
| inbox | `create_work_item`, `read_attention_queue`, `read_work_thread`, `assign_work_item`, `request_work_run` |
| crew | `list_agent_profiles`, `propose_agent_profile`, `assign_agent_role`, `read_agent_context`, `propose_handoff` |
| routines | `list_routines`, `draft_routine`, `set_routine_schedule`, `run_routine_now`, `pause_routine` |
| run | `read_run_status`, `record_run_checkpoint`, `record_task_result`, `request_human_action`, `request_verification` |

A `/showcase` judge route (fresh linear apprenticeship story) is also being added
2026-08-31 (`src/pages/Showcase.tsx`).

Distinct registered tool names: 42 before the 2026-08-31 additions
(3 global + 20 state-aperture + 19 surface-aperture, `record_task_result` shared
between the execution state and the run surface); 44 including `get_cherry_status`
and `start_apprenticeship`.

### Invariants that hold across every aperture
- No tool approves a checkpoint, promotes evidence trust, activates memory, or
  marks success — those stay human-only.
- Agent-supplied content enters the evidence ledger as `untrusted`.
- Native MCP bridge (`runner/mcp/server.mjs`) is read/verify scope only (D-005).

## 2026-08-31 — fresh-journey repair + registered-closure proof

- Tool mutations now resynchronise the app shell: every successful mutating call triggers the
  shared refresh, and `create_workspace` / `create_mission` / `start_apprenticeship` atomically
  switch the active workspace/mission selection (`ToolContext.setActiveIds` / `onMutation`).
- `load_lesson` added to the onboarding aperture — previously the agent journey deadlocked after
  `create_mission` because the lesson tool only existed in a state the mission could not reach
  without it.
- `generate_quick_skill` now links the drafted graph to the active mission on the agent path.
- New global read `get_cherry_status` (4th global) and composite `start_apprenticeship`
  (empty/onboarding; never loads a source — rights stay behind `load_lesson`).
- New `/showcase` judge route reads live state only, and `e2e/cherry/showcase-host.spec.ts` drives
  the fresh journey exclusively through closures registered on `document.modelContext` — mock host
  installed before app load, approval clicked by the "human" in the UI, agent provably unable to
  approve (no registered tool name matches approve/decide).

## 2026-08-31 — library reads go global (the site upgrades the agent)

- Three new global read-only tools serve the cross-workspace skill library to any attached host:
  `list_skills` (bounded to 8 rows + totalCount), `recommend_skills` (deterministic, explainable
  lexical ranking; approved skills boosted; no hidden model calls), and `get_skill` (summary, or
  install files `skill-md` / `agents-md` / `claude-md` for human-approved exact revisions only).
- Install files stream in bounded parts (`part`/`totalParts`, 900 chars) with a full-file
  `contentSha256` the agent recomputes after joining — receipts philosophy applied to delivery,
  and every payload stays inside MAX_RESULT_CHARS.
- Aperture rationale: mutation tools remain capped at 5 per surface. Globals grow 4 → 7, all
  read-only; `tests/cherry/webmcp.test.ts` now pins ≤ 5 state tools + 7 globals (≤ 12 total).
- Host-path e2e extension: after the human approval, the visiting agent asks `recommend_skills`
  for its current task, receives the approved skill with revision + approval hash, streams the
  SKILL.md parts, and verifies the joined sha256 in-page.
