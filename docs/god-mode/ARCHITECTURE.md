# Cherry God Mode: architecture and contracts

Date: 2026-09-02. This document is the implementation contract for branch `claude/god-mode-v2`.
It extends the existing kernel documented in `docs/ARCHITECTURE.md`; it does not replace it.

## 1. Three planes

```text
                                  USER
                                    |
                            Outcome / policy
                                    |
        +---------------------------v---------------------------+
        | PLANE A  Cherry Control Plane (React + src/cherry)     |
        |  Mission Control, plan validation, teammates,          |
        |  approvals, proof ledger, WebMCP tools, policy engine  |
        |  Durable browser state: Dexie (IndexedDB)              |
        +---------------------------+---------------------------+
                                    | HTTP loopback, pairing token
        +---------------------------v---------------------------+
        | PLANE B  Cherry Computer (runner/, local Node process) |
        |  DurableQueue (leases, retry, cancel, crash recovery)  |
        |  MissionExecutor (DAG progression, evaluation, repair) |
        |  SandboxManager (directory, git-worktree)              |
        |  AgentHosts (probe, start, cancel; never "verified")   |
        |  EventsLog (hash-chained), process policy, redaction   |
        +---------------------------+---------------------------+
                                    | argv arrays, shell:false, minimal env
        +---------------------------v---------------------------+
        | PLANE C  Agent hosts and capabilities                  |
        |  codex exec | claude -p | mock (tests) | manual        |
        |  kilo, kimi, ollama, omniroute, openai-compatible:     |
        |  descriptors + probes only, EXPERIMENTAL/DESIGNED      |
        |  Capabilities: MCP, WebMCP, plugin/app, connector,     |
        |  browser, cli, filesystem, terminal, skill (data only) |
        +--------------------------------------------------------+
```

Plane A never holds secrets or executes commands. Plane B owns execution and verification. Plane C
supplies intelligence and tools and never bypasses Plane B policy.

Closing the Cherry page stops nothing that the runner already owns: the mission executor advances
the graph on the runner. The page re-syncs from `GET /v2/missions/:id` when reopened.

## 2. What already exists and is reused (verified by reading the code, see CAPABILITY_AUDIT.md)

| Need | Existing owner | Reuse decision |
|---|---|---|
| Durable jobs | `runner/lib/queue.mjs` `DurableQueue` | Mission executor enqueues into it; no second queue |
| Events | `runner/lib/events.mjs` `EventsLog` | Mission and sandbox events append here |
| Env minimisation, redaction | `runner/lib/process-policy.mjs`, `redact.mjs` | Every host spawn goes through `runProcess` |
| Envelope + action hash | `ExecutionEnvelope` in `workforce-model.ts`, `runner/lib/canonical.mjs` | Node envelopes are `ExecutionEnvelope` records; hashes cross-check browser/runner |
| Work graph | `WorkItem.dependencyIds`, `WORK_ITEM_TRANSITIONS` | Plan nodes project to WorkItems; node run status derives from WorkItem status |
| Hosts, profiles, crews | `ExecutionHost`, `AgentProfile`, `Crew` | Teammates are AgentProfiles; hosts are ExecutionHosts |
| Proof | `withWorkspaceTx` + `ProofEvent` | Every new mutation emits inside the transaction |
| Approvals | `ApprovalRecord` (exact revision + content hash) | Plan approval and human-decision nodes bind to `contentHash` |
| WebMCP aperture | `registration-manager.ts` surfaces | New surface `control`, at most 5 tools, 7 globals untouched |
| Runner client | `src/cherry/runner-client/runner-api.ts` | New mission and host calls added next to channel-watch calls |

## 3. Plane A contracts (TypeScript, `src/cherry/workforce/`)

### 3.1 `mission-plan-model.ts` (pure)

```ts
export type MissionPlanStatus = 'draft' | 'validated' | 'ready' | 'running' | 'waiting_for_human'
  | 'verifying' | 'succeeded' | 'failed' | 'cancelled';
export type PlanRisk = 'low' | 'medium' | 'high' | 'critical';
export type PlanNodeKind = 'agent' | 'verify' | 'human_decision';
export type SandboxProvider = 'none' | 'directory' | 'git-worktree';
export type SandboxBoundary = 'process' | 'worktree-process' | 'container' | 'cloud-sandbox' | 'unknown';

export interface VerificationCheckSpec {
  id: string;
  kind: 'command' | 'file' | 'file_contains' | 'hash' | 'human';
  required: boolean;
  argv?: string[];           // command: argv[0] must be runner-allowlisted (node is always allowed)
  expectExitCode?: number;   // command, default 0
  path?: string;             // file, file_contains, hash: relative to the sandbox root
  contains?: string;         // file_contains
  expectedSha256?: string;   // hash
  description: string;
}

export interface MissionPlanNode {
  id: string;                              // ^[a-z0-9][a-z0-9-]{0,39}$
  missionId: string;
  title: string;
  objective: string;
  definitionOfDone: string[];
  dependencyIds: string[];
  kind: PlanNodeKind;
  preferredAgentProfileId: string | null;
  preferredHostKinds: ExecutionHostKind[]; // e.g. ['codex-cli','claude-cli']; [] = any capable host
  requiredCapabilities: RuntimeCapability[];
  riskLevel: PlanRisk;
  verificationPlan: VerificationCheckSpec[];
  contextRefs: string[];
  maxAttempts: number;                     // 1..3
  timeoutMs: number;                       // 10_000..1_800_000
  sandbox: SandboxProvider;
}

export interface MissionPlan {
  id: string;
  workspaceId: string;
  missionId: string;
  templateId: string | null;
  outcome: string;
  constraints: string[];
  nodes: MissionPlanNode[];
  status: MissionPlanStatus;
  revision: number;
  contentHash: string;                     // sha256Canonical over PLAN_HASH_FIELDS
  approvalId: string | null;               // human approval of exactly contentHash, else null
  nodeWorkItemIds: Record<string, string>; // nodeId -> WorkItem id once projected
  createdAt: string;
  updatedAt: string;
}

export const PLAN_LIMITS = { maxNodes: 20, maxFanOut: 3, maxParallel: 3, maxDepth: 6,
  minTimeoutMs: 10_000, maxTimeoutMs: 1_800_000, maxAttempts: 3 } as const;

export type PlanProblemCode = 'empty_outcome' | 'no_nodes' | 'too_many_nodes' | 'duplicate_id' | 'bad_id'
  | 'self_dependency' | 'missing_dependency' | 'cycle' | 'fan_out' | 'depth' | 'empty_definition_of_done'
  | 'no_verification' | 'timeout_range' | 'attempts_range' | 'unknown_capability' | 'forbidden_capability'
  | 'bad_check' | 'injection_marker' | 'workspace_mismatch';
export interface PlanProblem { code: PlanProblemCode; nodeId: string | null; message: string }
export function validateMissionPlan(plan: MissionPlan): PlanProblem[];
export function planTopologicalOrder(plan: MissionPlan): string[];          // throws on cycle
export const PLAN_HASH_FIELDS = ['id','workspaceId','missionId','templateId','outcome','constraints','nodes','revision'] as const;
export async function computePlanContentHash(plan: MissionPlan): Promise<string>;
```

Rules enforced by `validateMissionPlan`: unique ids; every dependency exists and is not self; no
cycle; 1..20 nodes; fan-out (children per node) at most 3; depth (longest dependency chain) at most
6; every node has at least one definition-of-done line; every `agent` or `verify` node has at least
one check (human_decision nodes carry a single `human` check); timeout 10 s..30 min; attempts 1..3;
capabilities are `RUNTIME_CAPABILITIES` members; `human_approval` is allowed only on
`human_decision` nodes; a `command` check needs a non-empty `argv`, `file`/`file_contains`/`hash`
checks need `path`; no node text may carry the instruction-injection markers listed in
`INJECTION_MARKERS` (`ignore all previous instructions`, `ignore previous instructions`,
`disregard your instructions`, `you are now`, `system prompt:`, `<|im_start|>`, `BEGIN INSTRUCTION`,
case-insensitive). A plan never carries a command line: executables come only from the envelope
allowlist built by the host registry.

Node run status derives from the projected WorkItem:

```text
DRAFT/READY -> pending, QUEUED/LEASED -> ready, RUNNING -> running,
WAITING_FOR_HUMAN -> waiting_for_human, WAITING_FOR_DEPENDENCY -> pending,
RETRYING -> running, VERIFYING -> verifying, SUCCEEDED -> succeeded,
FAILED -> failed, CANCELLED -> cancelled
```

`computeReadyNodeIds(plan, statuses)` returns nodes with status `pending` whose dependencies are all
`succeeded`; a node with any dependency in `failed`, `blocked` or `cancelled` is `blocked`.
`derivePlanStatus(plan, statuses)`: all succeeded -> succeeded; any waiting_for_human ->
waiting_for_human; any cancelled -> cancelled; any failed with nothing running -> failed; any
verifying -> verifying; any running or ready -> running; else the persisted status.

### 3.2 `mission-templates.ts` (deterministic templates)

Ids: `repository-audit`, `release-mission`, `research-brief`, `creator-draft` (public name "Own my
creator pipeline"). `matchTemplateForOutcome(outcome)` picks by keyword, deterministic, defaulting
to `research-brief`. `instantiateTemplate(templateId, { workspaceId, missionId, outcome, constraints,
repositoryRoot })` returns a valid draft plan. `release-mission` is the demo graph:

```text
research-competitor  ---+
audit-onboarding     ---+--> prioritise --> developer-fix (git-worktree) --+
                                       |--> content-draft (directory)  ---+--> independent-verification (verify)
                                                                             --> publish-approval (human_decision)
```

`creator-draft`: collect-project-updates and research-current-context in parallel ->
select-content-angle -> draft-linkedin-post, draft-youtube-outline (parallel) -> fact-check ->
voice-review -> request-publish-approval (human_decision). Outputs under `content/`.

### 3.3 `mission-plan-service.ts` (persistence, ProofEvents in the same transaction)

Dexie migration version 6 adds `missionPlans: 'id, workspaceId, missionId, status, updatedAt'` and
`evaluationReports: 'id, workspaceId, missionId, workItemId, createdAt'` (version 5 is the Creators
feature's `skillProposals`, which landed on main during this work). Workspace archive export and
import carry both tables (follow the `channelWatches` precedent: schema, remap, dedupe, tamper
rejection). New ProofEvent types: `mission.plan_created`, `mission.plan_revised`,
`mission.plan_approved`, `mission.plan_started`, `mission.plan_status`, `mission.node_updated`,
`evaluation.recorded`, `policy.decided`, `sandbox.leased`, `sandbox.released`. `ApprovalObjectType`
gains `'mission_plan'` and `'action_intent'`. `IdPrefix` gains `'pl'` (plan), `'er'` (evaluation
report), `'ai'` (action intent), `'cb'` (context bundle).

```ts
createOutcomeMission({ workspaceId, outcome, constraints?, templateId?, repositoryRoot? })
  -> Result<{ mission: Mission; plan: MissionPlan }>   // creates the Mission (DRAFT) and a validated plan
revisePlan(workspaceId, planId, patch, expectedRevision) -> Result<MissionPlan>   // revision+1, new hash, approvalId = null
approvePlan(workspaceId, planId, expectedRevision, actorType='human') -> Result<MissionPlan> // human-only, ApprovalRecord objectType 'mission_plan'
projectPlanToWorkItems(workspaceId, planId) -> Result<MissionPlan>   // one WorkItem per node, READY, dependencyIds mapped
buildNodeEnvelopes(workspaceId, planId, hosts: ExecutionHost[]) -> Result<Record<nodeId, ExecutionEnvelope>>
recordPlanStatus(workspaceId, planId, status, reason?) -> Result<MissionPlan>
listMissionPlans(workspaceId), getMissionPlan(workspaceId, planId), getPlanForMission(workspaceId, missionId)
requiresApproval(plan): boolean   // any node riskLevel 'high' or 'critical', or any human_decision node with external side effects
```

`startMission` (integrator, Plane A) refuses a plan whose `approvalId` is null while
`requiresApproval(plan)` is true, and refuses any plan whose recomputed hash differs from
`contentHash` (stale).

### 3.4 Envelopes: the browser-to-runner contract

One `ExecutionEnvelope` (existing type) per `agent` or `verify` node, built by `buildNodeEnvelopes`:

```text
schemaVersion 1; workspaceId; workItemId (projected WorkItem); workItemRevision;
routineId null; routineRevision null;
executionHostId: preferred host kind or 'any'; adapter: 'agent-host' | 'cherry-check';
workingDirectory: null (the runner allocates the sandbox);
boundedPrompt: JSON string { planId, planRevision, planContentHash, nodeId, kind, title, objective,
  definitionOfDone, contextBundleId, contextText (bounded), sandbox: { provider, sourceRoot, baseRef? },
  hostKinds, outputs: string[] };
contextRefs; requiredCapabilities; allowedExecutables (subset of ['codex','claude','node']);
allowedOrigins []; sideEffects; dataEgress; verificationPlan: string[] (each a JSON VerificationCheckSpec);
idempotencyKey: `${missionId}@r${planRevision}@${nodeId}`; approvalIntentId; actionHash; createdAt.
```

The action hash is computed in the browser with `sha256Canonical(envelope minus actionHash)` and
recomputed by the runner with `computeActionHash`; both are canonical JSON and must agree (the
channel-watch path already proves cross-layer agreement). The runner materialises one job per
attempt by copying the template, filling `workingDirectory`, appending `@a<attempt>` to the
idempotency key, refreshing `createdAt`, and recomputing `actionHash`; the job records
`templateActionHash` (the browser hash) next to its own.

### 3.5 Registries, policy, context, evaluation

`host-registry-service.ts`: `rankHosts(hosts: ExecutionHost[], node: MissionPlanNode, prefs)` ->
deterministic order: unavailable filtered out; must satisfy required capabilities; preferred kinds
first; then measured pass rate (unknown last); then name. `hostBoundary(kind)` returns the honest
`SandboxBoundary` label. `probeToExecutionHost(probe)` maps runner probe records to ExecutionHost.

`capability-registry-service.ts`: `CapabilityDescriptor` per the directive section 12 with
`status: 'validated_real' | 'shipped_tested' | 'experimental' | 'designed' | 'unavailable'`;
`DEFAULT_CAPABILITY_CATALOGUE` (github.repository.read, github.pull_request.create,
gmail.draft.create, gmail.message.send, linkedin.post.create, youtube.video.upload, browser.navigate,
terminal.execute, skill.install, webmcp.current_page.invoke, cherry.verify.run, repository.worktree)
with honest statuses (most `designed`; terminal.execute, skill.install, cherry.verify.run,
repository.worktree `shipped_tested` after their tests pass; webmcp.current_page.invoke
`experimental`). `filterCapabilities(catalogue, node)` returns the allowlist for a node.

`policy-service.ts`: `ActionIntent`, `PolicyRule`, `PolicyDecision` as in the directive section 15;
`DEFAULT_POLICY_RULES`; `decide(intent, rules, approvals)`; `isApprovalFresh(approval, intent)`
(same intent id, same contentHash, not expired, decision approved). Agents cannot create approvals:
`approveIntent` requires `actorType === 'human'`.

`context-compiler.ts`: `compileContextBundle({ workspaceId, missionId, workItemId, node, maxBytes =
80_000, maxExcerpts = 12 })` -> `ContextBundle` (directive section 16) with deterministic ordering
(mission outcome and constraints, node objective and DoD, approved skills, approved memories in
matching scopes, last 10 proof-event summaries, bounded source excerpts marked untrusted); dedupe by
content hash; `tokenEstimate = ceil(byteLength / 4)`; the bundle text is what the runner writes to
`.cherry/CONTEXT.md` inside the sandbox.

`evaluation-service.ts`: `EvaluationCheck`, `EvaluationReport` (directive section 17);
`summariseChecks(checks, requiredIds)`: any required check missing or `not_run` -> failed; `blocked`
never counts as passed; `repairBudget(mode)` = 1 in RED, 2 in AMBER/GREEN; `recordEvaluationReport`
persists and emits `evaluation.recorded`.

## 4. Plane B contracts (runner, dependency-free ESM)

### 4.1 Files

```text
runner/lib/mission-plan.mjs      validateMissionPlan (same codes as TS), topological order, ready nodes
runner/lib/sandbox-manager.mjs   SandboxManager: directory + git-worktree providers, serialized git
runner/lib/agent-hosts.mjs       descriptors, probes, start/cancel for codex, claude, mock, manual
runner/lib/checks.mjs            deterministic VerificationCheckSpec runner (command/file/file_contains/hash)
runner/lib/mission-executor.mjs  MissionExecutor over DurableQueue: DAG, hosts, sandboxes, evaluation, repair
runner/server.mjs                new routes only (additive): /v2/hosts, /v2/missions*
```

### 4.2 SandboxManager

```js
new SandboxManager({ dataDir, allowedRoots, now, exec })
allocate({ missionId, workItemId, provider: 'directory'|'git-worktree', sourceRoot, baseRef, writable, retain })
  -> { id, provider, root, branchName, baseCommit, status: 'ready', boundary: 'process'|'worktree-process',
       createdAt, expiresAt }
release(leaseId, { reason }) -> keeps the directory when the lease is 'failed' or retain is true
list(), get(leaseId), recoverAfterRestart()
```

Path: `<approvedRoot>/.cherry-sandboxes/<safeMissionId>/<safeWorkItemId>/`. Branch:
`cherry/mission/<safeMissionId>/<safeWorkItemId>`. Safe ids: `[A-Za-z0-9._-]`, max 60 chars, no
`..`. Refusals: out of root, unsafe id, dirty tracked files in the source repository (untracked files
are fine), branch already exists for a different lease, symlinked root. Git operations run one at a
time through a promise chain. Never `--force`, never `branch -D` on a user branch, never a push.

### 4.3 Agent hosts

```js
HOST_DESCRIPTORS = [codex, claude, kilo, kimi, ollama, omniroute, openai-compatible, mock, manual]
probeHosts(config) -> [{ hostId, kind, executable, available, authenticated, version, modes, capabilities,
                         boundary, checkedAt, details, status: 'shipped_tested'|'experimental'|'designed'|'unavailable' }]
runHostTask(hostId, task, sandbox, context) -> { status: 'completed'|'failed', exitCode, stdoutArtifact, stderrArtifact,
                                                 providerVersion, wallClockMs, hostId, note: 'Provider completion is not verification.' }
```

Codex uses `codex exec` with flags read from `codex exec --help` at probe time (`--sandbox
workspace-write`, `-C`, `--skip-git-repo-check`, `--output-last-message` when present); Claude uses
`claude -p` with `--output-format json` and `--permission-mode acceptEdits` when present. Neither
adapter ever passes `--dangerously-skip-permissions` or `danger-full-access`. Task input larger than
6,000 characters goes to `<sandbox>/.cherry/TASK.md` and `<sandbox>/.cherry/CONTEXT.md`; the prompt
then points at those files. `mock` is enabled only with `--allow-mock-host` and executes a JSON
script from the task (`writeFiles`, `sleepMs`, `exitCode`, per attempt). `manual` writes a handoff
package and returns `needs_human`. kilo, kimi, ollama, omniroute and openai-compatible probe only.

### 4.4 MissionExecutor

```js
new MissionExecutor({ dataDir, queue, events, sandboxes, hosts, adapters, now, repairBudget })
register({ plan, envelopes, hostPreferences }) -> { ok, missionRunId } | { ok:false, code, reason }
start(missionRunId), cancel(missionRunId), decide(missionRunId, { nodeId, decision, approvalId, contentHash })
get(missionRunId) -> MissionRun, list()
tick() -> enqueues ready nodes, reconciles finished jobs, runs evaluation, schedules repairs
```

State per node: `pending | ready | running | verifying | waiting_for_human | succeeded | failed |
blocked | cancelled`, attempts, jobIds, sandbox lease, host, evaluation report, lastError.
Invariants: at most `PLAN_LIMITS.maxParallel` running; a node becomes `succeeded` only when its
evaluation report status is `passed`; provider completion moves the node to `verifying`; a failed
report with attempts < maxAttempts and repairs < repairBudget re-enqueues the node with the failed
checks appended to the task as data; dependents of a failed or cancelled node are `blocked`; mission
status follows the same derivation as Plane A; every transition appends to EventsLog with
`missionRunId:nodeId` as the job key so parallel overlap is provable from the log.

### 4.5 HTTP routes (paired, loopback, exact-origin CORS as today)

```text
GET  /v2/hosts                         -> { hosts: [...probe records], probedAt }
POST /v2/missions                      -> 201 { missionRunId } | 200 (identical re-register) | 409 (same id+revision, different hash) | 400
GET  /v2/missions                      -> { missions: [...last 50 summaries] }
GET  /v2/missions/:id                  -> { mission: MissionRun }
POST /v2/missions/:id/start            -> { mission }
POST /v2/missions/:id/cancel           -> { mission }
POST /v2/missions/:id/decisions        -> { mission }   body { nodeId, decision, approvalId, contentHash }
```

## 5. Plane A surfaces

Mission Control `/studio/control` (index) and `/studio/control/:missionId` (detail). Composer
"What should Cherry take care of?" with four example outcomes; columns Working, Needs you,
Completed; cards show outcome, status, active workers, host names, sandbox boundary, next
dependency, verification status, pending approvals, last event time. Detail shows the graph,
teammates, artifacts, checks, approvals, failures and repairs, activity.

WebMCP surface `control` (route prefix `/studio/control`), five tools, no new global:

```text
create_outcome_mission   write   { outcome, constraints?, templateId?, repositoryRoot? } -> { missionId, planId, revision, contentHash, nodes[] }
plan_current_mission     read    { missionId? } -> validated plan summary, problems, ready nodes, requiresApproval
start_current_mission    write   { missionId?, expectedRevision } -> refuses unpaired runner, stale hash, missing approval
cancel_current_mission   write   { missionId? } -> propagates to the runner
request_mission_action   write   { missionId?, nodeId, question } -> parks the node WAITING_FOR_HUMAN; never approves
```

## 6. File ownership for parallel lanes

| Lane | Owns | Must not touch |
|---|---|---|
| domain | `src/cherry/workforce/{mission-plan-model,mission-templates,mission-plan-service,mission-orchestrator,host-registry-service,capability-registry-service,policy-service,context-compiler,evaluation-service}.ts`, `src/cherry/persistence/{migrations,cherry-db,workspace-archive}.ts`, `src/cherry/core/{domain-event,ids}.ts`, `src/cherry/approval/approval-model.ts`, `schemas/cherry-workspace.schema.json`, `tests/cherry/{mission-plan,mission-orchestrator,host-registry,capability-registry,policy-service,context-compiler,evaluation-service,god-mode-persistence}.test.ts` | pages, webmcp, runner, e2e |
| runner | `runner/lib/{mission-plan,sandbox-manager,agent-hosts,checks,mission-executor}.mjs`, additive routes in `runner/server.mjs`, `runner/lib/adapters.mjs` (additive adapters `agent-host`, `cherry-check`, `mock-host`), `runner/{sandbox-manager,agent-hosts,mission-executor}.test.mjs`, imports in `runner/runner.test.mjs` | `src/**`, `runner/lib/storage/**`, Playwright |
| integrator (this session) | `src/pages/**`, `src/components/**`, `src/app/**`, `src/cherry/webmcp/**`, `src/cherry/runner-client/**`, `e2e/**`, `docs/**`, `scripts/**`, `package.json` scripts | |
| scale (later) | `scripts/god-mode/**`, `runner/lib/storage/**`, `tests/scale/**` | everything else |

Shared, frozen before lanes start: `tests/fixtures/mission-plans/*.json` and
`tests/fixtures/mission-plans/index.json` (plan fixtures with expected problem codes). Both validators
must agree on every fixture.

## 7. Mapping to the first directive's requested files

`00_EXECUTIVE_DECISION` and `03_NORTH_STAR` -> `NORTHSTAR.md`; `01_COMPETITIVE_RESEARCH` ->
`RESEARCH.md` + `GROK_PARITY_MATRIX.md`; `02_CURRENT_CAPABILITY_AUDIT` -> `CAPABILITY_AUDIT.md`;
`04_ARCHITECTURE` -> this file; `05_SECURITY_AND_POLICY` -> `SECURITY_AND_POLICY.md`;
`06_CONNECTIVITY_AND_HOSTS` -> `OPENAI_INTEGRATION.md` (hosts section); `07_SCALE_HARNESS` ->
`docs/release/GOD_MODE_SCALE_REPORT.md`; `08_BILLION_SCALE_DESIGN` -> `SCALE_DESIGN.md`;
`09_CLAIM_MATRIX` -> `CLAIMS_MATRIX.md`; `10_POST_HACKATHON_ROADMAP` -> `ROADMAP.md`. The
`src/cherry/orchestration/` directory from the first directive is not created: the existing
`src/cherry/workforce/` module owns these responsibilities (second directive, section 9).

## Additions made while integrating (2026-09-02)

- **Scratch roots.** A node whose sandbox provider is `directory` and whose envelope names no
  `sourceRoot` gets `<approved root>/.cherry-scratch/<mission run>/` as its source, so every node,
  repository or not, works inside a leased sandbox. A `git-worktree` node still needs a repository.
- **Artifact hand-off.** When a node passes its checks, the runner copies the files its envelope
  declared (`outputs` plus every `file` / `file_contains` check path) into
  `<runner data dir>/artifacts/<mission run>/<node>/`, records `{path, bytes, sha256}` on the node,
  and materialises those files into each direct dependant's fresh sandbox at the same relative
  paths before the dependant starts (`node.inputs` names where each file came from). Paths are
  resolved inside the sandbox root and refused otherwise.
- **Worktree chaining.** A passed node in a `git-worktree` sandbox has its result committed on
  its own sandbox branch (`cherry/mission/<run>/<work item>`, runner logs under `.cherry`
  excluded); a dependant `git-worktree` node whose envelope names no `baseRef` starts from the
  last such dependency's committed head (`sandbox.basedOn`, `sandbox.headCommit`). The source
  branch is never checked out, merged or reset.
- **Host kinds in envelopes.** The browser lists a node's preferred host kinds first when a host
  of that kind is usable, then every other usable host, so a rehearsal or a machine with one
  signed-in CLI still runs the node and the runner records which host did the work. With no
  usable host the preference stands and the runner refuses honestly.
- **Rehearsal host.** `--mock-delay-ms <n>` holds each mock attempt so parallel work is visible
  in a rehearsal; the mock writes each plan file target with the text its `file_contains` check
  expects. Both are test-only and require `--allow-mock-host`.
