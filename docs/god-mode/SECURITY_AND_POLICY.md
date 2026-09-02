# Security and policy model for God Mode

## Threat model additions

| Threat | Control | Where enforced |
|---|---|---|
| A model-proposed plan smuggles a command | Plans carry no command line; executables come only from the envelope allowlist built by the host registry; `sanitizePlanProposal` strips unknown fields and unknown capabilities and rejects instruction-injection markers | Plane A `mission-plan-model.ts`, Plane B `mission-plan.mjs` |
| Untrusted source text reaches a worker as instructions | Context bundles label every excerpt with trust; source text is written to `.cherry/CONTEXT.md` under an "untrusted material" heading; nothing in it is parsed for commands | `context-compiler.ts`, `agent-hosts.mjs` |
| A worker escapes its sandbox | Worktree or directory under an approved root; path and symlink checks; child env minimised; explicit sandbox flags for Codex and Claude; never `--dangerously-skip-permissions` or `danger-full-access` | `sandbox-manager.mjs`, `agent-hosts.mjs`, `process-policy.mjs` |
| Two workers collide on one branch | One branch per lease; branch collision refused; git operations serialised | `sandbox-manager.mjs` |
| Provider says "done" and nothing checks | Node reaches `succeeded` only through an evaluation report that passed; missing required checks fail; blocked is not passed | `mission-executor.mjs`, `evaluation-service.ts` |
| Stale plan executes | Runner recomputes `contentHash`; stale or mismatched hash rejected at registration and start; every edit bumps revision and clears `approvalId` | both planes |
| Agent grants approval | No WebMCP tool approves; `approvePlan` and `approveIntent` require a human actor; runner `decide` only records what the browser domain layer already bound to an `ApprovalRecord` | `mission-plan-service.ts`, `policy-service.ts`, tool tables |
| Secrets leak through output | `redact` on every captured stream; tool results redacted; env not dumped | existing |
| Cross-workspace access | Every service checks `workspaceId` on read; runner mission records carry `workspaceId` and refuse mismatched envelopes | both planes |
| Runaway parallelism | `PLAN_LIMITS.maxParallel = 3`, `DurableQueue` concurrency 1..3 | Plane B |
| Repair loop never ends | `repairBudget` 1 (RED) or 2 (AMBER/GREEN); `maxAttempts` at most 3 | Plane B |

## Default policy (God Mode profile)

| Action class | Decision |
|---|---|
| read, deterministic analysis, sandbox write, approved test run, draft | allow |
| external draft through a writing connector | require_approval |
| send email, publish, merge, deploy, delete, spend, change credentials | require_approval |
| bypass a security control | deny |

An approval binds intent id, content hash, capability, target, revision, actor and expiry. Any edit
makes it stale. Standing policies are human-created, revisioned, hashed, revocable and evaluated on
every call.

## What is not built and must not be claimed

No OAuth token storage, no secrets broker, no browser session runtime, no container or VM isolation,
no cloud worker. The capability catalogue marks these `designed` or `unavailable`.
