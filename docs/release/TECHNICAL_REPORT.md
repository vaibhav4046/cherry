# Cherry: technical report (pre-God-Mode baseline)

**Date:** 2026-09-02
**Commit of record:** `c8e2181` on `main` (source identical to the live deploy `dpl_6jUGHVjEt4p44rsA6DVTE7WnSmtH`, built from `e81dbc3`)
**Live:** https://cherry-wine.vercel.app (canonical) and https://getcherry.vercel.app (alias)
**Repository:** https://github.com/vaibhav4046/cherry (MIT)

This historical report describes the pre-God-Mode baseline at `c8e2181`; it is not the report for
the God Mode branch, which has since merged into main as `6b850ae`. See
[GOD_MODE_FINAL_REPORT.md](GOD_MODE_FINAL_REPORT.md) for that branch's closeout and
[FINAL_HANDOFF.md](FINAL_HANDOFF.md) for the merged state.
Every statement below points at baseline evidence. Section 8 lists what was not proven at this
snapshot.

## 1. What Cherry is

Cherry turns a lesson from a creator into a skill that every agent a person already uses can run.
A person follows a creator or saves one upload. Cherry proposes a skill from it, drafts the method
from the transcript the person supplies, waits for that person to approve the exact revision they
read, builds real artifacts, verifies them with checks that can fail, seals the result in a
tamper-evident receipt, and serves the approved skill to agents over three open conventions:
WebMCP in the browser, MCP on the machine, and Agent Skills bundles anywhere.

At this snapshot, Cherry makes no direct model API calls and asks for no model API key. The paired
local runner can invoke configured agent CLIs under its allowlist; those hosts provide the reasoning.
The browser is the database. The core runs with no account and no cloud.

## 2. Architecture

| Layer | Location | Role |
|---|---|---|
| Domain core | `src/cherry/*` | Typed services, models, and state machines. No React, WebMCP, or MCP imports. |
| Persistence | `src/cherry/persistence/` | Dexie over IndexedDB with versioned migrations (v5 at the historical `c8e2181` snapshot). Every domain mutation emits a ProofEvent inside the same transaction. |
| Proof ledger | `src/cherry/core/domain-event.ts`, `src/cherry/proof/` | Append-only ledger. Receipts are SHA-256 over RFC 8785 canonical JSON. Tamper-evident and recomputable, never signed. |
| UI | `src/pages/`, `src/app/` | React 19 shell. Pages call domain services directly, so the agent path and the human path share one implementation. |
| WebMCP layer | `src/cherry/webmcp/` | Feature-detects `document.modelContext.registerTool`, registers tools by product state and route surface with AbortController lifecycles, and logs every call to Agent View. |
| MCP bridge and runner | `runner/mcp/server.mjs`, `runner/server.mjs` | Optional zero-dependency Node processes. The bridge reads and verifies workspace exports; the runner is loopback-only and user-triggered or user-approved. |
| Schemas | `schemas/*.schema.json` | Draft 2020-12 JSON Schemas for workspace archives, skill graphs, memory, and proof, validated in tests. |
| Design system | `src/design-system/` | One token file, one accent (Cherry Wine `#8c1d2f`), no dark theme. |

Domain modules under `src/cherry/`: `mission`, `watch` (YouTube URL rules, transcript parsers,
observations, coverage), `transcribe` (on-device Whisper via transformers.js, WebGPU with WASM
fallback), `evidence`, `skillgraph`, `approval`, `memory`, `artifacts`, `verify`, `proof`,
`compiler` (Agent Skills bundles), `library` (cross-workspace Skill Library), `source` (sources,
channel watches, skill proposals), `notebook`, `workforce`, `runner-client`, `webmcp`, `auth`
(opt-in Privy, lazy chunk). `docs/ARCHITECTURE.md` describes each module and the golden journey
data flow in more detail.

## 3. The engine, movement by movement

1. **Source.** A person pastes a YouTube link, an article link, raw text, or a local `.txt`,
   `.md`, `.srt`, or `.vtt` file; imports a YouTube watch-history export; uses the Save to Cherry
   bookmarklet; or follows a creator's channel. YouTube plays only through the official
   `youtube-nocookie.com` embed after the person acknowledges permission. Cherry never downloads
   a video or captions. Article text is fetched only by the paired local runner through a
   fail-closed, DNS-pinned Scrapling worker (`scraper/`, `runner/lib/scrapling-probe.mjs`).
2. **Creators.** A followed channel's public RSS feed is checked once a day by the paired runner
   (`runner/lib/youtube-rss-watch.mjs`, `src/cherry/source/channel-watch-service.ts`). Each new
   upload becomes a source with a deterministic skill proposal
   (`src/cherry/source/proposal-service.ts`): a name, one sentence on what it teaches, and once a
   transcript exists, candidate steps. Readiness (`needs-transcript`, `draft-ready`, `drafted`,
   `approved`) is computed from persisted facts, never asserted; only a person can set a proposal
   aside. The Creators page is `/studio/creators`.
3. **Evidence.** Transcript segments and timestamped observations land in the evidence ledger as
   `untrusted`. Trust promotion is a human-only code path.
4. **Shape.** A versioned SkillGraph is drafted, by hand or by the deterministic Quick Skill
   derivation (`skillgraph/quick-skill.ts`, `skillgraph/auto-draft.ts`). Approval binds to the
   exact revision the person read; editing a node makes the approval stale.
5. **Prove.** Artifacts are real files in a versioned, path-validated store with an inert preview
   (scripts and network removed). Verification runs deterministic checks against actual files and
   state and can fail; the shipped example's first artifact does fail and is repaired. A receipt
   seals the pass, the failures, and the repairs.
6. **Carry.** Approved skills appear in the Skill Library with install-ready gating and export as
   SKILL.md, AGENTS.md, or CLAUDE.md, or as a zip bundle with a standalone `verify.mjs` that fails
   on tampering. Visiting agents can ask `recommend_skills` mid-task and pull the install file with
   `get_skill`, hash-pinned to the approved revision.

## 4. The WebMCP surface

Seven global tools are always registered, six reads plus `introduce_agent`, which only labels
the session: `read_cherry_context`, `list_cherry_capabilities`, `get_cherry_status`,
`introduce_agent`, `list_skills`, `recommend_skills`, `get_skill`. At most five contextual
mutation tools register per mission state
or route surface (`TOOL_STATE_TABLE` in `src/cherry/webmcp/tool-definitions.ts`,
`TOOL_SURFACE_TABLE` in `workforce-tools.ts`). Tools register and unregister as the mission's state
machine advances; learning tools exist only while learning, export tools only after verification
passes. The Sources surface exposes `list_sources`, `save_source`, `request_source_fetch`,
`archive_source`, and `prepare_source_for_skill`; `list_sources` rows now carry the skill proposal
so no extra tool was needed for Creators.

Agents can request but never grant: approvals, trust promotion, memory activation, and marking
their own work `SUCCEEDED` are refused for agent actors. Every call is visible in Agent View
(`/studio/agent`). In a browser without WebMCP the complete product works manually.

The inversion Cherry adds to the usual WebMCP story: most agent-ready sites let an agent operate
them; Cherry's site upgrades the agent, by serving the person's own approved skills to whoever
visits.

## 5. Serving beyond the browser

- **MCP bridge** (`runner/mcp/server.mjs`): stdio MCP for Codex CLI and Claude Code. Five
  read-only tools (`read_workspace_summary`, `list_skills`, `verify_workspace_integrity`,
  `verify_receipt`, `list_skill_bundles`); no write, approve, or execute tool exists. A live
  ChatGPT-authenticated Codex CLI 0.151.0-alpha.7.2 session called all five in order on
  2026-09-01 (`docs/release/CODEX_MCP_CAPTURE.md`).
- **Agent Skills bundles**: installed into a real Claude Code host on 2026-08-29 (with a
  2026-08-30 addendum) and listed as an available skill, recorded in the decision log
  (`docs/CHERRY_DECISIONS.md` D-012), no transcript file; the same convention is read by
  Hermes-class agents.
- **Local runner** (`runner/server.mjs`): pairing token, exact-origin CORS, root-restricted
  working directories, allowlisted executables, `shell:false` spawn, output caps and redaction,
  atomic job persistence, durable queue with leases, hash-chained event log. Timed routines fail
  closed without an approved executor.

## 6. Security and honesty boundaries

The hard lines, all enforced in code and tests rather than by policy text: no LinkedIn scraping;
no YouTube video or caption download by any component; no headless automation of anyone's
ChatGPT, Codex, or Claude account; no background cloud execution and no hidden network calls from
the browser; no auto-approval; private-network fetch protection in the runner; no secrets in the
repository or the client bundle. Guest mode never loads the Privy SDK
(`e2e/cherry/performance-meta.spec.ts`). Artifact previews are inert. The service worker caches
the static shell only, never workspace data, and `scripts/verify-sw.mjs` proves in a real browser
that a redeploy reaches returning visitors and that the offline fallback is the freshest shell.

Audits: `docs/release/CHERRY_SECURITY_AUDIT.md` (an adversarial pass against Cherry's own claims;
the one it broke was fixed the same day), `CHERRY_ACCESSIBILITY_AUDIT.md`,
`DEPENDENCY_AUDIT.md` (clean `npm ci`, `npm audit --omit=dev --audit-level=high` exit 0, with a
recorded correction of an earlier drifted lockfile).

## 7. The harness and the numbers

Two harnesses are described in `docs/HARNESS.md`: the product harness (the layered invariants the
code enforces) and the team harness (gates before every commit, full Playwright before every
push, one deployer, an append-only STATUS log, and a claims discipline under which nothing is
stated beyond what a test, receipt, or capture shows).

Historical baseline gates on `c8e2181` from a fresh GitHub clone with no pre-existing
`node_modules`, Linux, Node 22 (these are not current God Mode counts):

| Gate | Result |
|---|---|
| `npm ci` | exit 0, 996 packages |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors |
| `npm run test` | 406 passed, 2 opt-in skips |
| `npm run test:runner` | 69 passed |
| `npm run build` | 0 errors |
| `npm run verify:pack` | pass |
| `npm run verify:sw` | 5 of 5 |
| `npm run audit:submission` | 0 FAIL, 0 WARN |
| `npx playwright test` | 105 passed, 0 flaky (desktop 1440x1024 and Pixel 7) |
| `npm audit --omit=dev --audit-level=high` | exit 0 (0 critical, 0 high, 10 moderate) |

Growth during the final three days, for context: unit tests went from 135 to 406, runner tests
from 42 to 69, and browser journeys from 39 to 105, almost entirely by turning found defects into
permanent regressions.

## 8. What is not proven

- No live capture of a proprietary WebMCP browser host exists. The compatibility page labels
  that surface Experimental; the registration contract is covered by unit and mock-host tests.
- No live check of a real creator's channel feed was captured in this repository. The daily
  check is covered by runner tests; the shipped sample creator is synthetic and labelled.
- The five-persona judge tribunal planned in Sprint 5 never ran; the T11 route-by-route
  inspection (81 combinations) and three release-manager verification cycles stand in for it.
- Encrypted cross-device sync, creator-published skill packs, and team libraries are roadmap
  items and no UI pretends otherwise.
- A reproducible, hash-locked Python environment for the optional Scrapling worker is a
  follow-up; the runner fails closed when the worker is not ready.

## 9. Evidence index

`docs/release/FINAL_HANDOFF.md` (ticket-by-ticket verification), `CHERRY_RELEASE_EVIDENCE.md`,
`CODEX_MCP_CAPTURE.md`, `CHERRY_SECURITY_AUDIT.md`, `CHERRY_ACCESSIBILITY_AUDIT.md`,
`DEPENDENCY_AUDIT.md`, `CHERRY_COMPATIBILITY_MATRIX.md`, `WEBMCP_CHANGELOG.md`,
`e2e-results.json` (the Playwright report of the run above), `screenshots/` including
`screenshots/creators/`, `public/media/demo/golden-loop.webm` (the uncut recording on
`/showcase`), `docs/HARNESS.md`, `docs/ARCHITECTURE.md`, and `docs/codex-takeover/STATUS.md`
(the append-only build log).
