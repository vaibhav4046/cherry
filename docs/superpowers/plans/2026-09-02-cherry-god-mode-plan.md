# Cherry God Mode implementation plan

Branch `claude/god-mode-v2`, worktree `D:\project\cherry-god-mode-v2`. Every task: RED (write the
failing test), FIX (minimum code), PROVE (focused test green, then `npm run gates && npm run build`),
REGRESS (the test stays). Commit boundaries are the ticket commits named in the directive.

## GOD-0 Baseline, research, architecture lock

- [x] Worktree from origin/main 6e763c5, `npm ci` exit 0
- [ ] Baseline `npm run gates`, `build`, `verify:pack`, `verify:sw`, `audit:submission`, Playwright, counts in STATUS
- [x] NORTHSTAR, ARCHITECTURE, CAPABILITY_AUDIT, CLAIMS_MATRIX, SECURITY_AND_POLICY, SCALE_DESIGN, ROADMAP
- [ ] RESEARCH, GROK_PARITY_MATRIX, OPENAI_INTEGRATION from the official-source lane
- [x] Plan fixtures `tests/fixtures/mission-plans/` with expected problem codes
- [ ] Commit `docs(god-mode): lock the model-agnostic workforce architecture`

## GOD-1 Mission graph (domain lane)

- [ ] RED `tests/cherry/mission-plan.test.ts`: every fixture yields exactly its expected codes; hash changes with content; revision bump clears approval; topological order; ready nodes; dependency failure blocks dependents; human wait; cancellation; injection text stays data (no executable derived from it)
- [ ] FIX `mission-plan-model.ts`, `mission-templates.ts`, `mission-plan-service.ts`, migration v5, archive round-trip, ProofEvent types
- [ ] RED `tests/cherry/mission-orchestrator.test.ts`: derivePlanStatus, applyRunnerEvent legality, projection into WorkItems with mapped dependencyIds
- [ ] PROVE `npx vitest run tests/cherry/mission-plan.test.ts tests/cherry/mission-orchestrator.test.ts`
- [ ] Commit `feat(missions): add validated outcome-to-work graph`

## GOD-2 Host and capability registries (domain lane)

- [ ] RED `tests/cherry/host-registry.test.ts`, `tests/cherry/capability-registry.test.ts`
- [ ] FIX `host-registry-service.ts`, `capability-registry-service.ts`
- [ ] Commit `feat(runtime): add host and capability registries`

## GOD-3 Sandbox manager (runner lane)

- [ ] RED `runner/sandbox-manager.test.mjs`: safe path, unsafe id, base commit recorded, two workers different paths, branch collision refused, out-of-root refused, failed lease retained, terminal-only cleanup, cancellation, serialised git
- [ ] FIX `runner/lib/sandbox-manager.mjs`
- [ ] Commit `feat(runner): isolate repository workers in mission worktrees`

## GOD-4 Codex and Claude hosts (runner lane)

- [ ] RED `runner/agent-hosts.test.mjs` with fake executables: version probe, unavailable host, streaming, output cap, redaction, timeout, cancellation, non-zero exit, completion is not verification, file-based task input, mock host script
- [ ] FIX `runner/lib/agent-hosts.mjs`, `runner/lib/checks.mjs`, additive adapters
- [ ] Commit `feat(runner): add probed agent-host lifecycle`

## GOD-5 Parallel mission executor (runner lane + integrator)

- [ ] RED `runner/mission-executor.test.mjs`: two ready tasks overlap (event log proves it), concurrency cap, dependency waits, failed worker repairs once then passes, evaluator follows worker, provider completion alone never succeeds, crash recovery, event order, independent sandboxes, cancel, decisions
- [ ] FIX `runner/lib/mission-executor.mjs`, routes in `runner/server.mjs`
- [ ] RED `tests/cherry/mission-run-coordination.test.ts` (integrator): browser projection of runner state onto WorkItems
- [ ] Commit `feat(runtime): coordinate parallel teammates with verification`

## GOD-6 Policy, context, evaluation (domain lane)

- [ ] RED `tests/cherry/policy-service.test.ts`, `context-compiler.test.ts`, `evaluation-service.test.ts`
- [ ] FIX the three services
- [ ] Commit `feat(trust): add policy-bound execution and independent evaluation`

## GOD-7 Mission Control (integrator)

- [ ] RED `tests/cherry/mission-control.test.tsx`, `e2e/cherry/god-mode-mission.spec.ts` (desktop + mobile, keyboard, axe, console clean, reload persistence, needs-you, cancel)
- [ ] FIX `src/pages/studio/MissionControl.tsx`, `MissionControlDetail.tsx`, routes, nav, runner client, composer on `/studio`
- [ ] Commit `feat(ui): make Mission Control outcome-first`

## GOD-8 WebMCP mission tools (integrator)

- [ ] RED `tests/cherry/webmcp-god-mode.test.ts`, `e2e/cherry/webmcp-god-mode.spec.ts` (section 13, twelve proofs)
- [ ] FIX `src/cherry/webmcp/mission-tools.ts`, surface `control`
- [ ] Commit `feat(webmcp): expose bounded mission control tools`

## GOD-9 Landing (integrator)

- [ ] RED `tests/cherry/landing-god-mode.test.tsx`, `e2e/cherry/landing-god-mode.spec.ts`; update `visual-qa`, `upgrade`, `performance-meta` pins
- [ ] FIX `src/pages/Landing.tsx` + `src/components/marketing/*`, RouteMeta, screenshots
- [ ] Commit `feat(marketing): position Cherry as an open AI workforce`

## GOD-10 Automation handoffs (P1)

- [ ] Work recipe, Codex Automation recipe, approval-bound timed routine registration, runner stale-revision rejection
- [ ] Commit `feat(automations): add honest local and host-owned run paths`

## GOD-11 Scale and chaos (P1, scale lane)

- [ ] `scripts/god-mode/generate-corpus.mjs`, `run-scale-benchmark.mjs`, `run-chaos.mjs`, `tests/scale/`, report
- [ ] Commit `test(scale): add deterministic God Mode workload harness`

## GOD-12 Real host proof and release package

- [ ] Opt-in real Claude run (`CHERRY_REAL_CLAUDE=1`), opt-in Codex if a CLI can be obtained, captures, security report, demo script, final report, screenshots
- [ ] `npm run verify:all`, clean-checkout proof, push, STATUS FINAL
- [ ] Commit `docs(release): record the verified Cherry workforce loop`
