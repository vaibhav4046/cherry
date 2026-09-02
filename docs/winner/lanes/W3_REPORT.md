# W3 — Mission Film and Showcase Director

Status: **DONE**

Branch: `lane/cherry-showcase`
Accepted base: `fb3d13e91f462cd80f227cb01d60e6755cc6ff62`

## Delivered outcome

`/showcase` now leads with the judge-facing sequence **Outcome → Parallel work → Verification → Human authority**. The existing source-to-skill walkthrough remains intact below it as the secondary **How Cherry learns a procedure** chapter. The page uses the accepted Cherry Chronicle artwork and presents a public, sanitized replay derived from the committed real-host benchmark rather than a hand-authored mission.

The replay player is labelled exactly `Recorded real Codex run`. It exposes Play, Pause, Restart, Previous step, Next step, and Open evidence controls; supports keyboard operation; announces state changes through a polite live region; uses numbered text and `aria-current` in addition to color; and starts stopped when reduced motion is requested. Its evidence drawer includes the Codex version, event log, measured overlap, sanitized workspace labels, base commit, independent checks, approval status, and replay digest.

## Owned files

- `src/pages/Showcase.tsx`
- `src/pages/ShowcaseLearn.tsx`
- `src/components/showcase/MissionFilm.tsx`
- `src/components/showcase/RecordedMissionPlayer.tsx`
- `src/components/showcase/recorded-mission.mjs`
- `src/components/showcase/recorded-mission.d.mts`
- `src/design-system/showcase.css`
- `public/media/cherry-demo/recorded-mission.json`
- `public/media/cherry-demo/mission-hero.webm`
- `scripts/capture-winner-demo.mjs`
- `tests/cherry/showcase-winner.test.tsx`
- `e2e/cherry/final-winner-showcase.spec.ts`
- `docs/winner/lanes/W3_REPORT.md`

No package manifest, runtime/workforce implementation, Landing, Mission Control, W1 asset, or release source-evidence file is part of the change. `docs/release/e2e-results.json` and `tsconfig.tsbuildinfo` were restored byte-for-byte to `HEAD` after verification.

## Replay provenance and sanitization

Source: committed `docs/release/benchmarks/god-mode-hosts.json`, capture commit `be0e713156b2c98b4c19ecfa0c77cd544a0ca715`.

The generator validates the raw capture before projection:

- the mission must have succeeded;
- event sequence and timestamps must be strictly ordered;
- every projected worker must have bounded start/finish timestamps and a successful result;
- claimed concurrency is recomputed from worker intervals rather than copied;
- the two intervals must genuinely overlap.

The public projection keeps only explicit safe fields: mission status/outcome/times, worker id/label, sanitized workspace label, `worktree-process` boundary, base commit, `codex-cli 0.152.1`, status/times, check id/name/status/detail, and ordered event sequence/job/type/time/chain. It never copies source roots, worktree paths, branches, command output, stdout/stderr tails, or arbitrary raw metadata. A private-material scan of the shipped JSON returned no matches.

Projected event sequences are `1, 2, 4, 5, 7, 10, 13, 14, 16, 17, 18, 19, 21, 22, 23, 24`. The worker intervals are:

- `developer-fix`: `13:39:17.501Z` → `13:39:54.186Z`
- `review-notes`: `13:39:17.508Z` → `13:39:52.021Z`

Overlap is recomputed as `min(finishedAt) - max(startedAt)`, yielding **34,513 ms**, with a measured maximum concurrency of **2**. The public replay's canonical digest is `bac2a98278782ea4ad9b937d43b19f18960da0cee720ade3022c8f5878932490`.

The SHA-256 seal is tamper-evident, not a cryptographic signature or independent attestation. Trust remains anchored in the committed source capture plus the build/test-time validator. The UI therefore calls this a committed replay and does not claim a live or externally authenticated run.

## Chronicle artwork

The route consumes the accepted W1 manifest paths without modifying them:

- `seed-outcome-{desktop,mobile}.svg`
- `branches-workforce-{desktop,mobile}.svg`
- `harvest-proof-{desktop,mobile}.svg`
- `glasshouse-sandboxes-{desktop,mobile}.svg`

Source rights remain recorded in `public/media/cherry-chronicle/manifest.json`: the seed/harvest studies are USDA public-domain material; the branch/glasshouse studies are public-domain plates from *Flora Batava* (1814). The technical overlays are W1 originals. No Hermes or Grok visual was copied, and essential product claims remain live HTML rather than rasterized text.

## Browser-session film

Command used after starting the repository preview:

```text
node scripts/capture-winner-demo.mjs --capture --base-url http://127.0.0.1:4173
```

The script first rebuilds the replay from the committed source, then drives the owned `?capture=hero` browser route through Playwright's existing Chromium recording pipeline. The result is silent WebM browser-session footage; no HyperFrames composition was introduced. After capture, the script verifies the WebM magic bytes, enforces the 6 MB ceiling, and opens the media in Chromium to measure the actual width, height, and duration instead of trusting requested settings.

The first capture attempt failed closed with `ERR_CONNECTION_REFUSED` after its preview process had exited. No output was accepted. The successful run produced:

| File | Bytes | Dimensions / duration | SHA-256 |
| --- | ---: | --- | --- |
| `recorded-mission.json` | 7,381 | structured replay | `EA007CDBE7E7A781FD52EC63DEB6BD91D5887B9ACFC0C2E74161C2AAE2A8ADFE` |
| `mission-hero.webm` | 3,078,166 | 1440×900, 27.680 s | `ECF4E4AB407FBE84EE9B12994FCA2001DDF327BDE9F86E66C4F8FC84DFD01B6F` |

Representative frames at approximately 5 s, 15 s, and 24 s were visually inspected: seed/bounded start, two simultaneous checked branches, then verified proof stopping at the human boundary. The film is a supplemental, nonverbal visual; all evidence and claims are independently available in accessible HTML. Reduced motion substitutes the responsive Chronicle still and does not render/autoplay the film.

## TDD evidence

Tests preceded each behavior and were observed failing against missing or deliberately incomplete production code:

| Behavior | Observed RED | GREEN |
| --- | --- | --- |
| Typed public replay builder | missing module: 1 failed suite / 0 tests; after the initial stub, 4/4 assertions failed (empty label, sequence forgery accepted, overlap forgery accepted, workers absent) | fixture validation, sanitization, overlap math, sealing, and deterministic write pass |
| Recorded mission player | missing `RecordedMissionPlayer`: 1 failed suite / 0 tests | all states, controls, keyboard interaction, polite announcements, and reduced-motion stop pass |
| Browser capture script | missing script module: 1 failed suite / 0 tests | deterministic replay writing and browser-probed media metadata pass |
| Evidence-first route | untouched legacy route: 4/4 Playwright tests failed (new headline/chapters, player, reduced-motion still, mobile headline absent) | owned route spec passes 4/4 |
| Accessible contrast | initial route run: 3/4 passed; axe reported two 4.47:1 labels below 4.5:1 | corrected token; axe serious/critical set empty |
| Legacy Learn compatibility | broader sweep initially 15/18; old heading/recording contracts were absent | preserved the old journey as Learn; focused compatibility rerun 3/3 |
| Actual media truth | 8/9 unit tests passed; one failed because the script reported requested `27000` ms instead of actual media duration | Chromium metadata probe reports actual 27.680 s; 9/9 pass |
| Complete evidence index | 8/9 passed; `Codex version` and the required evidence-index fields were absent | drawer exposes version, event log, workspace labels, base commit, checks, overlap, and approval status; 9/9 pass |

## Verification results

- `npm.cmd test -- tests/cherry/showcase-winner.test.tsx` — **9/9 passed** on three independent final runs (4.54 s, 4.22 s, 4.22 s reported by Vitest).
- `npm.cmd run build` — **passed** (`tsc -b` and Vite production build).
- `npx.cmd playwright test e2e/cherry/final-winner-showcase.spec.ts --project=desktop` — final run **4/4 passed**: judge story, keyboard/evidence, reduced motion, and 390 px integrity.
- A preceding full owned run was 3/4 because the reduced-motion still was not found once; the unchanged isolated case then passed 1/1 and the unchanged complete rerun passed 4/4. It was non-reproducible and required no product/test weakening.
- Broader affected browser sweep — **22/22 passed** across final winner showcase, showcase host, judge card, starter library, demo recording UI, and responsive specs.
- Desktop/mobile public-page visual QA — **2/2 passed** at 1440×900 and 390×844 with heading/focus checks, axe serious/critical scan, console/page-error/404 monitoring, and horizontal-overflow assertions.
- `npm.cmd run gates` — **passed**:
  - typecheck passed;
  - lint passed;
  - Vitest: 60 passed / 1 skipped files, 548 passed / 2 skipped tests;
  - runner/MCP: 131/131 passed, 0 failed.
- `git diff --check` — passed.

Desktop and mobile full-page captures were visually reviewed after content settled. The Chronicle art, four-chapter sequence, player, evidence drawer, and retained Learn section were intact with no clipping or horizontal overflow. The silent film's 5/15/24-second frames were also reviewed at source dimensions.

## Authority boundary and integration re-checks

The historical capture contains no approval or public action. The showcase states this directly: approval was not exercised in the recording, agents did not publish, and release remains a separate human decision. W3 did not deploy or authenticate.

After cherry-picking the W3 handoff commit, W0 should:

1. rerun `npm.cmd test -- tests/cherry/showcase-winner.test.tsx`;
2. run `npm.cmd run build` followed by `npx.cmd playwright test e2e/cherry/final-winner-showcase.spec.ts --project=desktop` against the integrated preview;
3. rerun `npm.cmd run gates`;
4. confirm `/showcase` at 1440 px and 390 px, with normal and reduced motion;
5. deploy only from W0's integration lane, then verify the public media returns 200 and that no service worker serves an older showcase chunk.

No live-deployment claim is made here. Integration should use the exact W3 commit SHA supplied in the handoff.
