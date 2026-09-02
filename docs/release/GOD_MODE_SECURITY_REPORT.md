# God Mode security report

Branch `claude/god-mode-v2`. Every row names the test that exercises the control on this branch; a
row without a test is marked as such. Findings that were fixed during the work are listed with their
regression. This report is completed at the end of the branch (final counts live in
`GOD_MODE_FINAL_REPORT.md`).

## Invariants carried forward

| Invariant | Enforced by | Test |
|---|---|---|
| External content is data, never instructions | Plans carry no command line; `INJECTION_MARKERS` rejection; context excerpts labelled untrusted; mock host and agent hosts never parse task text for commands | `tests/cherry/mission-plan.test.ts` (injection fixture), `tests/cherry/webmcp-god-mode.test.ts` (hostile text stays data) |
| Provider completion is not verification | Adapters return `completed`, never `verified`; nodes reach `succeeded` only on a passed evaluation report; the orchestrator refuses `verified` without a passed report | `runner/agent-hosts.test.mjs`, `runner/mission-executor.test.mjs`, `tests/cherry/mission-run-coordination.test.ts` |
| Approvals, trust promotion and memory activation are human-only | `approvePlan`, `approveIntent`, `decideMissionNode` refuse non-human actors; no WebMCP tool approves | `tests/cherry/mission-plan.test.ts`, `tests/cherry/policy-service.test.ts`, `tests/cherry/webmcp-god-mode.test.ts` |
| Any relevant edit invalidates approvals | `revisePlan` bumps revision, recomputes the hash and clears `approvalId`; runner refuses mismatched hashes | `tests/cherry/mission-plan.test.ts`, `runner/mission-executor.test.mjs` |
| Every mutation emits a ProofEvent in the same transaction | `withWorkspaceTx` in every new service | `tests/cherry/mission-orchestrator.test.ts`, `tests/cherry/god-mode-persistence.test.ts` |
| Workers are isolated per task and the boundary is stated honestly | `SandboxManager` directory and git-worktree providers; labels `process` and `worktree-process`; never "VM" | `runner/sandbox-manager.test.mjs`, landing and Mission Control copy tests |
| No secrets in prompts, logs or results | `buildChildEnv`, `redact`, tool result redaction, runner pairing token only | `runner/v2.test.mjs`, `runner/agent-hosts.test.mjs` |
| Runner stays loopback-only with exact-origin CORS and an executable allowlist | unchanged `runner/server.mjs` policy; new routes reuse `send`/`readJsonBody` | `runner/v2.test.mjs`, `runner/mission-executor.test.mjs` HTTP wiring |
| Bounded parallelism and bounded repair | `PLAN_LIMITS.maxParallel = 3`, queue concurrency 1..3, `repairBudget`, `maxAttempts` at most 3 | `runner/mission-executor.test.mjs`, `tests/cherry/evaluation-service.test.ts` |

## Adversarial cases

Filled from `runner/mission-executor.test.mjs`, `runner/sandbox-manager.test.mjs`,
`runner/agent-hosts.test.mjs`, `tests/scale/god-mode-scale.test.mjs` and `docs/release/benchmarks/god-mode-chaos.json`
once those lanes land. Cases: plan cycle, missing dependency, oversized plan, stale plan hash,
duplicate idempotency key, crash after side effect, restart during a lease, expired lease, timeout,
cancellation, retries exhausted, unavailable host, malformed host output, oversized output,
secret-shaped output, command injection, path traversal, symlink escape, git lock, dirty base
branch, branch collision, prompt injection in task text, approval denied, dependent after upstream
failure, repair exhaustion, corrupted CAS object, corrupted event tail, interrupted batch resume.

## Findings during the work

| Finding | Severity | Fix | Regression |
|---|---|---|---|
| The test-only mock host could pass a `file` check but never a `file_contains` check, so the browser e2e could not reach a passed evaluation on nodes with section checks (`## Priorities`); the checks were right, the rehearsal host was too weak | Low (test surface only; real hosts read the bounded prompt) | `mission-executor.mjs` now hands every host the node's own file targets as data (`fileTargetsFor`), and only the mock host writes them (`mockWriteFiles`); paths still go through `containedPath`, so a target outside the sandbox root fails the attempt | `runner/agent-hosts.test.mjs` "writes the plan file targets" (escape case included) |
| Integrating the domain lane collapsed Dexie versions 5 and 6 into one block, so a workspace already on v5 (Creators) would have skipped the mission stores | High (data migration) | `migrations.ts` restored to v5 `skillProposals` and v6 `missionPlans` + `evaluationReports` | `tests/cherry/proposal-service.test.ts` pins `CHERRY_DB_VERSION` = 6 and an upgrade from v4; `tests/cherry/god-mode-persistence.test.ts` |
| Template matching sent "fix the highest-impact defect" to the release mission and "launch brief" to the release mission because `fix` and `launch` were release keywords | Medium (wrong graph, still validated and approval-gated) | keyword sets and `MATCH_PRIORITY` reworked: creator-draft, release-mission (`launch content`, `competitor`, `regression`), repository-audit (`audit`, `defect`, `fix`, `bug`), research-brief as the default | `tests/cherry/mission-control.test.tsx`, `tests/cherry/webmcp-god-mode.test.ts` |
| A browser could mirror a runner "succeeded" node as SUCCEEDED when the runner's check ids did not match the plan's own verification specs | None (the orchestrator refused it; found while writing the coordination test) | No product change: `recordEvaluationReport` marks missing required specs as failed, so an unmatched report cannot verify a node | `tests/cherry/mission-run-coordination.test.ts` "never marks work succeeded on provider completion alone" |
| `deleteWorkspace` left mission plans and evaluation reports behind after the workspace was gone | Low (orphan rows, no exposure) | cascade extended to `missionPlans` and `evaluationReports` | `tests/cherry/god-mode-persistence.test.ts` |
| A shell working-directory drift edited `e2e/cherry/responsive.spec.ts` in the main worktree for a few minutes | Process | restored with `git checkout`, main verified clean; every command now starts from the branch worktree explicitly | STATUS line 13:58 |

## Not built and therefore not claimed

No OAuth token storage, no secrets broker, no browser session runtime, no container or VM
isolation, no cloud worker, no live ChatGPT capture. The capability catalogue and the landing label
these Roadmap or Experimental.

## Invariants added with the artifact hand-off

| Invariant | Enforced by | Test |
|---|---|---|
| Artifacts never leave or enter a sandbox through a path that escapes it | `insideRoot` in `mission-executor.mjs` for collection and materialisation; the mock host refuses escaping targets | `runner/mission-executor.test.mjs` (artifact hand-off), `runner/agent-hosts.test.mjs` (escape case) |
| A worker's result is committed only on its own sandbox branch; the source branch is never checked out, merged or reset | `SandboxManager.commitAll` runs inside the worktree lease; the chaining test asserts the source `HEAD` is unchanged | `runner/mission-executor.test.mjs` (worktree chaining) |
| A scratch root stays inside the approved root | `scratchRootFor` builds it from `allowedRoots[0]` | `runner/mission-executor.test.mjs` (scratch root case) |
| A runner failure is final in the browser mirror; nothing shows as running that is not | `runnerEventFor` maps a runner `failed` to FAILED regardless of attempts | `tests/cherry/mission-run-coordination.test.ts` |
| A manual handoff never outranks a host that can do the work | fallback tiers in `rankHosts`, manual last | `tests/cherry/host-registry.test.ts` |
