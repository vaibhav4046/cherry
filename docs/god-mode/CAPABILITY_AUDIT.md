# Current capability audit (read from the code on 2026-09-02, base 6e763c5)

Every row below names the file that was read. "Test" names the file that asserts the behaviour;
counts come from the baseline run recorded in STATUS.

| Capability | Where | What the code does | Test | Status |
|---|---|---|---|---|
| Execution hosts | `src/cherry/workforce/workforce-model.ts` `ExecutionHost`, kinds attached-webmcp, local-runner, codex-cli, claude-cli, codex-automation-export, manual | Typed record with capabilities and honest status; `hostSatisfies` | `tests/cherry/workforce.test.ts` | SHIPPED_TESTED (types and routing check only; no registry persistence, no probes) |
| Agent profiles and crews | `workforce-service.ts` `createAgentProfile`, `createStarterCrew` | Profiles are configuration; `status: working` requires a lease | `workforce.test.ts` | SHIPPED_TESTED |
| Dependency-bearing work items | `WorkItem.dependencyIds`, `WORK_ITEM_TRANSITIONS`, `transitionWorkItem` | Legal transitions only; agents cannot mark SUCCEEDED | `workforce.test.ts` | SHIPPED_TESTED (no DAG scheduler consumes dependencies yet) |
| Handoffs | `proposeHandoff` | Recorded as proposed | `workforce.test.ts`, WebMCP `propose_handoff` | SHIPPED_TESTED |
| Execution envelopes | `ExecutionEnvelope` + `runner/lib/canonical.mjs` `computeActionHash` | Immutable, hashed, idempotency key | `runner/v2.test.mjs` | SHIPPED_TESTED |
| Codex and Claude CLI adapters | `runner/lib/adapters.mjs` `providerCli` (`codex exec <prompt>`, `claude -p <prompt>`) | Dual allowlist, version capture, output cap, redaction, never `verified` | `runner/v2.test.mjs` (gating); no automated real-binary success path on Windows | SHIPPED_TESTED (gating); VALIDATED_REAL for the MCP bridge only (`docs/release/CODEX_MCP_CAPTURE.md`) |
| Durable queue | `runner/lib/queue.mjs` | Leases, heartbeat, retry with backoff, cancel, timeout, crash recovery, concurrency 1..3, idempotency | `runner/v2.test.mjs` | SHIPPED_TESTED |
| Events log | `runner/lib/events.mjs` | Hash-chained JSONL, verify, readSince | `runner/v2.test.mjs` | SHIPPED_TESTED |
| Scheduler | `runner/lib/scheduler.mjs` | Exactly-once materialisation, missed-run policies, namespaces | `runner/v2.test.mjs` | SHIPPED_TESTED |
| Timed routines | `routines-service.ts` `approveRoutine` refuses non-manual schedules; runner `validateRunnerRoutine` disables generic timed routines | Honest gap: approval-bound registration does not exist | `runner/v2.test.mjs` "generic timed routines are disabled" | DESIGNED (this branch, P1) |
| Channel watches | `runner/lib/source-watch.mjs`, `/v2/channel-watches` | The one approval-bound timed registration that exists | `runner/v2.test.mjs` | SHIPPED_TESTED |
| MCP bridge | `runner/mcp/server.mjs` | stdio read/verify over exports; no write tool | `runner/mcp/bridge.test.mjs`; live Codex capture 2026-09-01 | VALIDATED_REAL |
| WebMCP | `src/cherry/webmcp/*` | 7 global reads, at most 5 contextual tools per surface, register/unregister on state and route, Agent View call log | `tests/cherry/webmcp.test.ts`, `e2e/cherry/showcase-host.spec.ts` (mock host) | SHIPPED_TESTED; live ChatGPT host EXPERIMENTAL (no capture) |
| Memory | `src/cherry/memory/memory-service.ts` | Proposals, human-only activation | `tests/cherry/memory.test.ts` | SHIPPED_TESTED |
| Proof | `src/cherry/proof/*`, `persistence/transactions.ts` | ProofEvent in the same transaction; receipts recomputable | `tests/cherry/proof.test.ts` | SHIPPED_TESTED |
| Persistence | `persistence/migrations.ts` v4, `workspace-archive.ts` v1.1 | Versioned Dexie, hash-verified export/import with remap and dedupe | `tests/cherry/*` | SHIPPED_TESTED |
| Independent verification | `src/cherry/verify/verification-service.ts` | Deterministic file/DOM/hash/graph checks; required checks fail closed | `tests/cherry/*`, golden e2e | SHIPPED_TESTED (skill-graph artifacts only; no repository command checks) |
| Sandboxing | `runner/lib/process-policy.mjs`, root allowlist in `server.mjs` | Minimal env, approved roots, shell-free spawn | `runner/v2.test.mjs` | SHIPPED_TESTED (`process` boundary only; no worktree or container isolation) |

## Real gaps (what this branch adds or labels)

| Gap | This branch |
|---|---|
| No outcome-to-DAG planner | GOD-1 mission plan model, deterministic templates, projection into WorkItems |
| No host registry or probes | GOD-2 registry + GOD-4 runner probes |
| No per-worker isolation beyond a path boundary | GOD-3 git-worktree sandbox provider, honest `worktree-process` label |
| No mission executor consuming `dependencyIds` | GOD-5 MissionExecutor over DurableQueue |
| No policy engine, context compiler, evaluator for repository work | GOD-6 |
| No outcome-first UI | GOD-7 Mission Control |
| No mission WebMCP tools | GOD-8 `control` surface |
| Landing sells skills, not a workforce | GOD-9 |
| No approval-bound timed routine registration | GOD-10 (P1) |
| No scale or chaos harness | GOD-11 (P1) |
| No general MCP client host, secrets broker, browser computer, cloud worker, connectors | ROADMAP (P2), labelled DESIGNED or NOT_BUILT |

## Host inventory on this machine (probed 2026-09-02 12:52 London)

| Host | Found | Version | Note |
|---|---|---|---|
| codex CLI | not on PATH | unknown | `~/.codex` exists (Codex app data with `auth.json` and a `config.toml` whose global defaults are `approval_policy = "never"` and `sandbox_mode = "danger-full-access"`; Cherry's adapter must pass explicit sandbox flags and never inherit these). The 2026-09-01 capture used an ephemeral Codex CLI. Real-host smoke is opt-in via `CHERRY_REAL_CODEX=1` and an explicit executable path. |
| claude | yes | 2.1.224 (Claude Code) | Non-interactive `-p` mode |
| ollama | yes | 0.32.13 | 7 local models (qwen3 4b/8b, qwen2.5-coder 3b, qwen3.5 4b, two custom); server was not running |
| omniroute | yes | 3.8.49 (npm global) | Interface not yet probed; treated as `unknown` until `/v1/models` is observed |
| kilo | no | | UNAVAILABLE |
| kimi | no | | UNAVAILABLE |
| docker / wsl | not probed in the time budget | | Container providers stay DESIGNED |
