# Cherry test evidence index

**Date:** 2026-08-31 · **Commit:** release evidence commit pending. Counts below come from the
fresh final gate run on the current tree unless a historical source is explicitly named.

## Commands and what they cover

| Command | Covers | Result (2026-08-30, 5297dad) |
|---|---|---|
| `npm run typecheck` | `tsc --noEmit`, strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` | PASS |
| `npm run lint` | eslint 9 flat config over the repo; `no-explicit-any`, `no-console` in app code | PASS |
| `npm run test` | vitest (jsdom + fake-indexeddb): domain flows, watch/transcripts, quick-skill, webmcp aperture, workforce, routines, whisper formatting, digest, schemas, compiler, core | 152 passed, 2 skipped, 18 files passed + 2 skipped (2026-08-31) |
| `npm run test:runner` | node:test — runner security/pairing/allowlists, MCP bridge stdio JSON-RPC, runner v2 durable queue/scheduler/events (v2.test.mjs is imported by runner.test.mjs) | 42 passed |
| `npm run build` | vite production build, code-split routes | PASS (largest chunk `transformers.web` ~549 KB) |
| `npm run test:e2e` | Playwright golden journey, responsive/overflow, axe a11y, hostile-artifact sandbox probe, workforce, upgrade | See `docs/release/e2e-results.json` (below) |
| `npm run verify:pack` | Release pack verification (bundle genuine + tamper-evident) | PASS 2026-08-30 — 6/6: zip sha256 matches meta, 23 listed files present, standalone verifier exit 0, one-byte mutation exit 1, missing evidence exit 1 |
| `npm run audit:submission` | Devpost submission preflight: canonical URL, LICENSE, README setup, release docs presence, e2e-results JSON parse, sample bundle, secret scan, stale-claim scan, demo route | Added 2026-08-30 (`scripts/audit-submission.mjs`) |

## Unit test files (tests/cherry/)

`core`, `domain-flow`, `watch`, `quick-skill`, `webmcp`, `workforce`, `routines`,
`whisper-format`, `digest`, `schemas`, `compiler`, `example-workspace.gen` (opt-in,
skipped by default), `bundle-writer.gen` (opt-in, skipped by default).

## E2E results — docs/release/e2e-results.json

Playwright JSON report from the latest recorded run (started 2026-08-30T12:43:52Z,
duration ~51 s, projects `desktop` + `mobile` against `npm run build && npm run preview`):

- **41 expected (passed), 0 unexpected, 0 flaky, 0 skipped** (2026-08-31 final run; includes registered-closure showcase-host tests that drive the fresh journey through document.modelContext closures, never executeLocal).
- Specs: `e2e/cherry/golden-manual.spec.ts`, `responsive.spec.ts`, `workforce.spec.ts`,
  `upgrade.spec.ts`, `showcase-host.spec.ts` (registered-closure host path, added 2026-08-31).

## Release artifacts (docs/release/)

| Artifact | What it is |
|---|---|
| `e2e-results.json` | Full Playwright JSON report (totals above) |
| `sample-bundle.zip` (17,592 bytes) + `sample-bundle.meta.json` | Real compiled skill bundle ("Semantic hero section with a real h1 heading workflow" v0.1.0), 23 files incl. `scripts/verify.mjs`, SHA-256 in the meta file |
| `CHERRY_RELEASE_EVIDENCE.md` | Per-gate evidence with pasted command output (v1.0/v1.1 runs, 2026-08-29) |
| `CHERRY_COMPATIBILITY_MATRIX.md` | Surface-by-surface status with honest untested notes |
| `CHERRY_SECURITY_AUDIT.md` | Adversarial audit: injection, stale approvals, artifact XSS, import corruption, runner abuse, secrets, false claims |
| `CHERRY_ACCESSIBILITY_AUDIT.md` | axe, keyboard, structure, motion, colour findings |
| `CHERRY_VISUAL_QA.md` | Responsive/visual QA notes |
| `DEMO_SCRIPT.md` | 3-minute demo video script |
| `DEVPOST_SUBMISSION.md` | Paste-ready Devpost kit |
| `RELEASE_NOTES.md` | v1.1 release notes |
| `VEO3_VIDEO_PROMPTS.md` | Prompts for the landing chapter clips |

## Screenshots (docs/release/screenshots/)

`landing-{mobile,tablet,laptop,desktop}.png`, `landing-v2-desktop.png`,
`landing-v3-{desktop,mobile}.png`, `studio-empty-{mobile,tablet,laptop,desktop}.png`,
`command-center-desktop.png`, `tour-command-center.png`, `agent-view.png`,
`compatibility.png`.

## Historical baselines

- `docs/CHERRY_BASELINE.md` — 2026-08-29 initial tree: 61 unit + 15 runner + 19 e2e.
- `docs/release/CHERRY_RELEASE_EVIDENCE.md` v1.1 addendum — 65 unit + 15 runner + 28 e2e.
- This file — 2026-08-30, commit 5297dad: 119 unit (+2 skipped) + 42 runner + 33 e2e
  (per `e2e-results.json`). Growth reflects workforce/routines/transcribe/digest suites
  added after v1.1.
- 2026-08-31, final hardening tree: 152 unit (+2 skipped) + 42 runner + 41 e2e +
  verify:pack 6/6 + audit:submission 0 FAIL, 0 WARN.
