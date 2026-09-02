# W4 — Mission Control experience lane report

## Status and scope

**DONE_WITH_CONCERNS.** Mission Control now accepts the first valid outcome directly, creates `My Cherry` through the existing public workspace service, creates the mission and plan through the existing workforce service, restores persisted missions after reload, preserves recoverable input, hides advanced controls under `Execution settings`, and exposes a runner-independent recorded Showcase replay. The detail view offers live start only when runner reachability, pairing, an eligible host, plan validity/state, and approval policy all allow it.

- Branch: `lane/cherry-control`
- Baseline: `fb3d13e91f462cd80f227cb01d60e6755cc6ff62`
- Commit: recorded after the accepted W4 commit is created
- Service, persistence, runner, workforce, policy, package, Landing, Showcase-player, and W1-asset semantics changed: **none**

## Exact tracked files

- `src/pages/studio/MissionControl.tsx`
- `src/pages/studio/MissionControlDetail.tsx` — temporary W0 lock; live-start affordance gating only
- `src/components/studio/mission-control/LiveStartGate.tsx`
- `src/components/studio/mission-control/MissionControl.css`
- `tests/cherry/mission-control-first-run.test.tsx`
- `tests/cherry/mission-control.test.tsx` — temporary W0 lock; obsolete wall and directly related readiness regressions only
- `e2e/cherry/final-winner-control.spec.ts`
- `docs/winner/lanes/W4_REPORT.md`

## Experience delivered

- A fresh browser sees the outcome composer instead of a space-name wall.
- Planning is unavailable only during initial AppState hydration, preventing an immediate click from accidentally creating a second workspace before a stored workspace is restored.
- A valid first outcome creates `My Cherry`, then creates and selects its persisted mission/plan and navigates to mission detail.
- Client validation happens before workspace creation; a thrown persistence error is caught, announced with `role="alert"`, and leaves the entered outcome available for retry.
- The default composer presents the outcome and `Plan the mission`; template, repository, constraints, and runner status are inside a closed native `<details>` disclosure.
- `Replay the verified Codex mission` links to `/showcase#recorded-codex-mission` and is explicitly described as recorded, read-only, and runner-independent.
- Existing missions appear in one Chronicle-style ledger rather than three competing card containers.
- `LiveStartGate` fails closed. It renders no start action unless the plan is startable and valid, policy approval is satisfied, the runner is reachable and paired, and at least one freshly checked `shipped_tested`, available, non-explicitly-unauthenticated host exists. The existing mission service remains authoritative at click time.

## Test-first evidence

### RED — focused component and service integration

The regressions were added before product code.

```powershell
npx.cmd --no-install vitest run tests/cherry/mission-control-first-run.test.tsx tests/cherry/mission-control.test.tsx
```

Exit 1: 2 test files failed; 11 tests ran; 4 passed and 7 failed. Failures proved the old page had no `outcome-input`, still rendered the name-a-space wall, lacked collapsed execution settings and recorded replay, and exposed `start-mission` while runner/host/policy prerequisites were absent.

### RED — browser acceptance

```powershell
npx.cmd --no-install playwright test e2e/cherry/final-winner-control.spec.ts --project=desktop --reporter=line --output=test-results-w4-red --grep "fresh IndexedDB"
```

Exit 1: 1/1 failed after reaching the application. Playwright could not find the expected level-one heading `What should Cherry take care of?`, demonstrating that the old first-run wall still owned the route. Earlier attempts that stopped at dependency/build or Windows output-lock errors were not counted as RED evidence.

An additional fail-closed regression then replaced the empty host list with a `shipped_tested`, available, authenticated host whose capabilities were empty:

```powershell
npx.cmd --no-install vitest run tests/cherry/mission-control-first-run.test.tsx -t "paired runner has no eligible host"
```

Exit 1: 1 failed, 7 skipped. The old first implementation incorrectly rendered `start-mission`; after matching each non-human plan node's required capabilities against the eligible probed hosts, the focused suite returned to 11/11 green.

## GREEN verification

```powershell
npm.cmd ci
```

Exit 0: 992 packages installed from the lockfile. Package manifests were unchanged. npm reported existing peer/deprecation warnings and 10 moderate audit findings; dependency remediation is outside W4 ownership.

```powershell
npx.cmd --no-install vitest run tests/cherry/mission-control-first-run.test.tsx tests/cherry/mission-control.test.tsx
```

Exit 0: 2 files passed; 11 tests passed; 0 failed. The final rerun emitted no React `act(...)` warnings.

```powershell
npx.cmd --no-install playwright test e2e/cherry/final-winner-control.spec.ts --project=desktop --reporter=line --output=test-results-w4-final-cap-2
```

Exit 0: 4/4 passed in 1.1 minutes against the exact final code and a fresh current build. The spec explicitly sets both desktop and 390×844 viewports even though it runs in the desktop browser project. A preceding rerun accidentally reused a stale preview and was interrupted; W4 identified and stopped only the verified Node preview process on port 4173, then forced this clean rebuild.

```powershell
npm.cmd run gates
```

Final exit 0:

- `tsc --noEmit`: pass
- `eslint .`: pass
- Vitest: 60 files passed, 1 skipped; 547 tests passed, 2 skipped
- runner/MCP Node suite: 131 passed, 0 failed

The first gate attempt reached typecheck and then linted generated Playwright trace JavaScript; it reported nine lint errors under `test-results-w4-green/**`. Those exact temporary result directories were removed. The next full run exposed a genuine AppState hydration race in the existing-workspace composer test (1 failed, 546 passed): navigation completed but the plan landed outside the expected workspace because submit could precede workspace restoration. W4 added the truthful `ready` gate and directly related regression waits. Focused tests then passed, and the complete gate above passed.

```powershell
git diff --check
```

Recorded as passing in the final commit checklist below.

## Fresh-state, reload, recovery, and live-gate evidence

| Acceptance | Evidence | Result |
| --- | --- | --- |
| Fresh IndexedDB | One outcome creates exactly one workspace named `My Cherry`, one persisted mission plan, and reaches the detail graph. | Pass |
| Reload | The detail graph and exact outcome remain visible after `page.reload()`; component remount also restores the mission ledger. | Pass |
| Recoverable error | A one-shot IndexedDB workspace `add` failure surfaces an alert, preserves the exact outcome, and succeeds on retry. | Pass |
| Invalid first outcome | `Fix it` is rejected before workspace creation; input remains intact and workspace count stays zero. | Pass |
| Runner unavailable | `start-mission` is absent. | Pass |
| Paired, host lacks plan-required capabilities | `start-mission` is absent. | Pass |
| Runner + pairing + eligible host + valid plan + policy | `start-mission` appears. | Pass |
| Consequential policy | Start stays absent until a person approves the exact plan revision, then appears. | Pass |
| Recorded replay | Navigates to the established Showcase route with no runner available. | Pass |

## Visual and accessibility acceptance

The final Playwright run captured and W4 visually inspected these temporary PNGs before removing the generated result directory:

| View | Exact capture | Bytes | SHA-256 | Inspection |
| --- | ---: | ---: | --- | --- |
| Desktop | 1440×900 | 104,216 | `9e08bbcac683850497ac809b9ddb7e46aedf08959847d91ebf184747f1349c95` | Clear outcome-first hierarchy; seed illustration supports rather than replaces the H1; one wine action; advanced settings closed; replay reads as secondary editorial evidence; no clipping. |
| Mobile | 390×844 | 69,414 | `18d0572aa040db95d75260618a4eb3fdf5685603347cc11a3297942c15d3d605` | Native disclosure opened from the keyboard with a visible proof-blue focus ring; single-column controls; no horizontal overflow. Browser focus scrolling places the heading above this post-open capture, while the initial heading is asserted visible in the desktop fresh-state case. |

The 390×844 acceptance emulated `prefers-reduced-motion: reduce`; the media query matched and no animation remained in the `running` state. Axe reported zero serious or critical violations. Both the fresh desktop/reload journey and the mobile journey collected zero browser console errors or uncaught page errors. Native labels, heading order, `<details>/<summary>`, `role="alert"`, and visible `:focus-visible` treatment were retained. Styling uses semantic product tokens and has no gradients, backdrop filters, glass, particle effects, or decorative motion.

## Reused art, provenance, and rejected variants

No new image was generated, downloaded, copied, or modified by W4. The page references two already shipped W1 Chronicle artifacts:

| Asset | Intrinsic dimensions | Bytes | SHA-256 | Rights/provenance |
| --- | ---: | ---: | --- | --- |
| `public/media/cherry-chronicle/artifacts/seed-outcome-desktop.svg` | 1600×1000 | 193,362 | `15f9ced2ccc7f24944c9729a319eb27e095a1c4dc66e685e89c930ef31a3627a` | Existing W1 public-domain botanical derivative plus original Cherry overlay; authoritative detail is in `docs/winner/lanes/W1_REPORT.md`. |
| `public/media/cherry-chronicle/artifacts/seed-outcome-mobile.svg` | 780×1040 | 193,331 | `d975226065f9ce9b986639b21e6d10ffd6c070649efd6c72ff8940da5568d06c` | Same W1 rights/provenance chain; not re-authored by W4. |

Rejected UI variants:

- The separate `Name a space first` form was rejected because it blocked the first useful outcome.
- The default example-chip cloud and always-visible template/repository/constraints controls were rejected because they competed with the single primary decision.
- Always-visible runner status was rejected; device/host information belongs to Execution settings and is probed only when opened.
- Three separately bordered status cards were rejected in favor of one quieter mission ledger.
- A copied or new replay player was rejected; the affordance navigates to the existing Showcase surface.
- New media, AI imagery, gradients, glass, particles, neon, and an unreviewed W3 player were not used.

## Self-review and concerns

- The diff stays within W4 ownership plus the two exact temporary locks granted by W0. No third path or semantic expansion was needed.
- Workspace creation still passes exclusively through `createWorkspace`, preserving its transactional proof event. Mission planning still passes exclusively through `createMission`. No page writes directly to IndexedDB.
- Plan-start authorization remains in `startMission`; the new component only hides an affordance until its prerequisites are truthfully observable and rechecks on approval-state changes.
- Runner probing inside the composer is deferred until a person opens Execution settings. Recorded replay remains available without any loopback runner request.
- The W1 SVGs are decorative (`alt=""` and `aria-hidden`) so historical marks cannot substitute for live product instructions or status.
- Concern: the existing public APIs provide separately atomic workspace and mission transactions, not one cross-service transaction. Prevalidation prevents the expected invalid-input orphan, and a failed workspace transaction leaves no workspace, but an unexpected mission-service failure after successful workspace creation can leave an empty `My Cherry`; changing that would require persistence/service semantics explicitly outside W4 scope.
- Concern: live eligible-host behavior is covered at the external runner boundary with deterministic mocks; this lane environment did not use real runner credentials or execute a live mission. The browser acceptance intentionally proves the runnerless path.
- Concern: npm continues to report 10 moderate audit findings and build-time Privy pure-annotation/chunk-size warnings. W4 changed no dependency or bundler configuration.
- Temporary Playwright result directories and the generated `tsconfig.tsbuildinfo` change were removed/restored before staging. W0 owns integrated release verification; W4 ran the required focused tests, targeted E2E, and complete `npm.cmd run gates`.

## Final commit checklist

- `git diff --check`: pass
- staged paths: exactly the eight files listed above
- staged diff inspected: pass
- clean worktree after commit: recorded in the W4 handoff

## Fix round 1 — independent review findings

### Status and exact files

The first review concern above about a possible orphaned first-run workspace is superseded by this fix. The UI now performs a compensating rollback through the existing public `deleteWorkspace` service whenever this submission created `My Cherry` but mission planning subsequently failed or threw. No domain, persistence, runner, workforce, policy, or service file changed.

Files changed in this round:

- `src/pages/studio/MissionControl.tsx`
- `src/components/studio/mission-control/LiveStartGate.tsx`
- `tests/cherry/mission-control-first-run.test.tsx`
- `e2e/cherry/final-winner-control.spec.ts`
- `docs/winner/lanes/W4_REPORT.md`

`src/pages/studio/MissionControlDetail.tsx` and `tests/cherry/mission-control.test.tsx` remained unchanged because the fixes did not require broadening their prior temporary locks.

### RED evidence

Command:

```text
npm.cmd test -- tests/cherry/mission-control-first-run.test.tsx
```

The valid unrestricted RED run exited 1 with **7 failed / 7 passed (14 tests)**. Each failure matched one requested defect:

1. the post-persistence `createMission` exception left the workspace and partial records instead of reporting a completed rollback;
2. cleanup failure was not disclosed;
3. the replay still navigated to `/showcase#recorded-codex-mission`;
4. reopening Execution settings retained the first runner result;
5. Mission Control added a second `<main>` inside the Studio shell;
6. runner disconnect on window focus left Start visible;
7. a once-eligible host never expired or re-probed.

The first attempted RED command could not load Vitest because the sandbox denied Vite's `.vite-temp` write (`EPERM`); it was not counted as behavioral evidence. The same command was rerun outside that restriction to obtain the defect-specific RED result above.

### Implementation and trust boundaries

- The workspace id eligible for compensation exists only in the local submission scope and is assigned only after this submit successfully creates `My Cherry`. Existing active workspaces can never enter this rollback branch.
- Active workspace and mission selection are delayed until `createMission` returns success. On failure, neither local-storage selection points to the transient workspace.
- `deleteWorkspace` remains the sole rollback mechanism. Its existing cascade removes the workspace, mission, plan, and proof-event rows together. The regression first invokes the real `createMission`, lets it persist a partial mission, throws afterward, then proves all four observable record groups are empty after compensation.
- If rollback returns a failure result or throws, the alert names that cleanup did not complete and includes the cleanup reason. The outcome stays in the textarea for recovery; the UI does not claim the workspace was removed.
- `LiveStartGate` now starts every probe fail-closed, prevents overlapping probes, refreshes every 15 seconds and on window focus or visible-document return, and removes its interval/listeners on cleanup. Runner/host probe exceptions are caught and keep Start hidden.
- Eligible host evidence must have a valid non-future `checkedAt` younger than 60 seconds. The test supplies a fresh timestamp, advances the clock through the bounded interval, and proves the previously visible Start action disappears once the evidence expires. A separate focus test proves runner unpair/disconnect also removes it.
- Opening Execution settings now always rechecks runner status instead of treating the first response as permanent.
- The recorded replay target is exactly `/showcase#recorded-mission`. This isolated W4 base intentionally lacks the W3 anchor; W0 must verify the real target after integrating W3.
- Mission Control now uses one labelled `<section>` inside the Studio shell's existing `<main>`, preserving a single valid main landmark.

### GREEN evidence

- `npm.cmd test -- tests/cherry/mission-control-first-run.test.tsx` — **14/14 passed**.
- `npm.cmd test -- tests/cherry/mission-control-first-run.test.tsx tests/cherry/mission-control.test.tsx` — **17/17 passed**.
- `npm.cmd run typecheck` — passed after removing one unused test-only binding found by the first run.
- `$env:CI='1'; npx.cmd playwright test e2e/cherry/final-winner-control.spec.ts --project=desktop` — **4/4 passed** against a fresh build: first outcome/reload, recoverable storage retry, exact replay URL, and 390×844 keyboard/reduced-motion/axe/overflow acceptance.
- `npm.cmd run gates` — passed: typecheck; lint; Vitest **553 passed / 2 skipped**; runner/MCP **131 passed / 0 failed**.
- `git diff --check` — passed before report append and is rerun in the final commit checklist.

The first Playwright attempt was invalid because `reuseExistingServer` attached to a stale Showcase-lane preview on port 4173; its captured tree showed the pre-W4 `Name a space first` page. W3 confirmed and stopped that exact stale process. The authoritative run above forced CI mode, built this W4 worktree, and passed all four cases. Generated `docs/release/e2e-results.json`, `tsconfig.tsbuildinfo`, and `test-results/**` churn was restored or removed before staging.

### Self-review and remaining concerns

- Exact review of `74f104f608904f9c8e16fe9625f529c6c86b23a4..HEAD` found no direct database mutation, service semantic change, runner/policy change, unbounded polling, stale event listener, or cross-lane source edit.
- Compensation is deliberately limited to a workspace created by the current submit. Failure in an existing workspace leaves that workspace untouched.
- The live-start gate remains advisory UI only; `startMission` remains the click-time authority.
- No new visual asset, dependency, gradient, animation, or design-system rule was added.
- Concern: if compensating `deleteWorkspace` itself fails, partial state necessarily remains; the UI now reports that truthfully and retains the outcome, but does not attempt an unsafe lower-level cleanup.
- Concern: no live runner credentials were used. Disconnect, host capability/freshness, rejection, cleanup, and timer behavior are verified through deterministic boundary doubles; W0 should verify the integrated W3 replay anchor and perform final release verification.
