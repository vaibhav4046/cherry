# Winner OS integration ledger (append-only)

W0 is the only integrator. Lane workers must not merge, cherry-pick, push, deploy, or edit outside their lock. Every accepted lane requires a failing test or explicit visual acceptance test, focused green evidence, a lane report, specification review, quality review, and conductor acceptance.

## Lineage

| Item | Value |
|---|---|
| Archive SHA-256 | `637b553c01908287729613139ae24bf2edafc5a699f3507e51306a43323a58f7` |
| Verified product commit | `1110098fc3296f5a1a2c888980d9206dcb71f45d` |
| Synchronized base | `b7a3e757bbc96ea51307129427df4d4ebd495e6c` |
| Integration branch | `codex/superman-orchard` |
| Integration worktree | `D:\project\cherry-superman-orchard` |
| Initial full baseline | PASS at `b7a3e757bbc96ea51307129427df4d4ebd495e6c` |

## File-lock ledger

| Lane | Branch | Worktree | Exclusive ownership | State |
|---|---|---|---|---|
| W0 conductor | `codex/superman-orchard` | `D:\project\cherry-superman-orchard` | `docs/winner/**`; integration operations; generated release evidence; full verification | ACTIVE |
| W1 Chronicle | `lane/cherry-artifacts` | `D:\project\cherry-lane-artifacts` | `docs/design/cherry-chronicle/**`; `public/media/cherry-chronicle/**`; `scripts/verify-cherry-chronicle-assets.mjs`; `tests/assets/cherry-chronicle-assets.test.mjs` | LOCK PREPARED |
| W2 Landing | `lane/cherry-landing` | `D:\project\cherry-lane-landing` | `src/pages/Landing.tsx`; `src/components/marketing/**`; `src/design-system/landing.css`; `tests/cherry/landing-winner.test.tsx`; `e2e/cherry/final-winner-landing.spec.ts` | RESERVED FOR WAVE B |
| W3 Showcase/film | `lane/cherry-showcase` | `D:\project\cherry-lane-showcase` | `src/pages/Showcase*.tsx`; `src/components/showcase/**`; `src/design-system/showcase.css`; `public/media/cherry-demo/**`; `scripts/capture-winner-demo.mjs`; `tests/cherry/showcase-winner.test.tsx`; `e2e/cherry/final-winner-showcase.spec.ts` | RESERVED FOR WAVE B |
| W4 Mission Control | `lane/cherry-control` | `D:\project\cherry-lane-control` | `src/pages/studio/MissionControl.tsx`; `src/components/studio/mission-control/**`; `tests/cherry/mission-control-first-run.test.tsx`; `e2e/cherry/final-winner-control.spec.ts` | RESERVED FOR WAVE B |
| W5 WebMCP/runtime | `lane/cherry-webmcp-proof` | `D:\project\cherry-lane-webmcp` | READ-ONLY by default; any exception requires W0-recorded failing regression and exact temporary locks | LOCK PREPARED (READ-ONLY) |
| W6 Copy | `lane/cherry-copy` | `D:\project\cherry-lane-copy` | README; Devpost copy; metadata; final judge script; product-film notes; final social asset, with exact paths locked after integrated inventory | RESERVED FOR WAVE D |
| W7 Red team | `lane/cherry-red-team` | `D:\project\cherry-lane-red-team` | READ-ONLY | LOCK PREPARED (READ-ONLY) |

## Wave and review state

| Lane | Implementer | Focused evidence | Spec review | Quality review | Conductor acceptance | Integration |
|---|---|---|---|---|---|---|
| W1 | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| W2 | WAITING WAVE B | PENDING | PENDING | PENDING | PENDING | PENDING |
| W3 | WAITING WAVE B | PENDING | PENDING | PENDING | PENDING | PENDING |
| W4 | WAITING WAVE B | PENDING | PENDING | PENDING | PENDING | PENDING |
| W5 | PENDING AUDIT | PENDING | N/A until mutation | N/A until mutation | PENDING | READ-ONLY |
| W6 | WAITING WAVE D | PENDING | PENDING | PENDING | PENDING | PENDING |
| W7 | PENDING BASELINE | PENDING | READ-ONLY | READ-ONLY | PENDING | READ-ONLY |

## Integration order

W0 accepts and integrates only after two-stage lane review, in the prescribed order: W1, W3, W4, W2; then W5 integrated proof; then W6; then W7 final verdict. No merge to `main` and no deployment are authorized.

## Event log

- 2026-09-02 19:30:44 +01:00 | W0 | Ledger created after clean full baseline. All file locks above are exclusive. No lane worktree exists yet.
- 2026-09-03 04:41:03 +01:00 | W0 | Conductor-owned post-rebase integration correction is limited to `e2e/cherry/demo-recording-ui.spec.ts`, `e2e/cherry/demo-recording.spec.ts`, `e2e/cherry/first-skill.spec.ts`, `e2e/cherry/golden-manual.spec.ts`, `e2e/cherry/landing-god-mode.spec.ts`, `e2e/cherry/upgrade.spec.ts`, and the previously recorded temporary exact lock on `tests/cherry/landing-god-mode.test.tsx`. W0 also maintains `docs/winner/lanes/W2_REPORT.md` under its existing `docs/winner/**` ownership. No production, runtime, W3, W4, dependency, merge, or deployment ownership is transferred.
