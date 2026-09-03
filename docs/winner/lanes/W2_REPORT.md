# W2 — Product Story and Landing Director

Status: **DONE_WITH_CONCERNS**

Branch: `lane/cherry-landing`
Unique implementation base: `57d44ab57b06f9abf485d1a1a000f67381931f75`

## Delivered outcome

The Landing route now leads with the digest-pinned `Recorded real Codex run` instead of a teammate gallery or an eleven-section documentation page. The first viewport labels the replay `Recording · committed evidence · not live`, exposes meaningful recorded outcome state and controls, and explains the live boundary: Cherry can start the work on a paired computer. The story then uses exactly six numbered chapters:

1. Seed / outcome
2. Branch / team
3. Glasshouse / workspaces
4. Harvest / verification
5. Human seal / authority
6. Seed bank / reusable learning

An unnumbered evidence cabinet inside that flow links to four independently bounded demonstrations. It does not create a seventh `data-landing-chapter`. The final action opens Mission Control while stating that live execution remains gated until a runner is paired.

## Owned files

- `src/pages/Landing.tsx`
- `src/components/marketing/ChronicleLanding.tsx`
- `src/design-system/landing.css`
- `tests/cherry/landing-winner.test.tsx`
- `e2e/cherry/final-winner-landing.spec.ts`
- `docs/winner/lanes/W2_REPORT.md`
- `tests/cherry/landing-god-mode.test.tsx` under W0's temporary exact lock, limited to replacing the obsolete teammate-first / eleven-section contract while retaining honesty assertions

No Showcase/player/demo-media, W1 Chronicle asset, runtime/workforce, package-manifest, release-source, authentication, or deployment file was edited.

## Recorded-player provenance and claim boundary

Landing imports W3's `RecordedMissionPlayer` and `verifyRecordedMissionFixture` directly; it does not copy or alter them. It fetches `/media/cherry-demo/recorded-mission.json`, lets the W3 verifier recompute its canonical digest, and renders recorded facts only after the digest matches W3's independently committed trust anchor in `src/components/showcase/recorded-mission-trust.mjs`:

`bac2a98278782ea4ad9b937d43b19f18960da0cee720ade3022c8f5878932490`

The fixture identifies a committed real-host capture at commit `be0e713156b2c98b4c19ecfa0c77cd544a0ca715`, capture SHA-256 `0224e3789c1fe953eef3616238ae478389c7a07c6636810e2bf5cb9ce0ce3f34`, and `codex-cli 0.152.1`. Landing exposes the verified outcome, two bounded work items, two `worktree-process` boundaries at base `18774c71f7a0d9ca4e06997093b1011c75f3ba85`, **34,513 ms** of measured overlap, two passed checks, and the fact that the recording performed no public release action. It does not call the recording live, does not autoplay it, and preserves W3's keyboard controls, polite announcements, numbered progress, evidence drawer, and reduced-motion behavior.

The loader owns one `AbortController` per request and checks its signal again after asynchronous digest verification before publishing state. Loading and failure states do not promote unverified fixture claims.

## Chronicle asset provenance

W2 consumes five responsive pairs from W1's closed `public/media/cherry-chronicle/cherry-chronicle-manifest.json`; it did not edit the manifest or asset bytes. Every desktop image is declared as 1600×1000 and every mobile source as 780×1040. Essential claims and labels remain live HTML.

| Artifact | Public-domain source | Desktop bytes / SHA-256 | Mobile bytes / SHA-256 |
| --- | --- | --- | --- |
| `seed-outcome` | USDA `usda-pom00004708` | 193,362 / `15f9ced2ccc7f24944c9729a319eb27e095a1c4dc66e685e89c930ef31a3627a` | 193,331 / `d975226065f9ce9b986639b21e6d10ffd6c070649efd6c72ff8940da5568d06c` |
| `branches-workforce` | *Flora Batava* plate `flora-batava-0226` (1814) | 189,959 / `9c6648e5c8144bfffbaae94b3c942d5c90775e4d7d35a17501cce7f993bdbb82` | 189,921 / `e70f53631338dd96a40f03d860e6bba18e7104e5e5d8a98a2e4621b036ebd3d1` |
| `glasshouse-sandboxes` | *Flora Batava* plate `flora-batava-0226` (1814) | 189,568 / `0544bc1ea4cc25e8bfdbbbf03a65a7f34a2c28a3a88586d30b9427b98551fc27` | 189,754 / `817564896969967bae59cc380cfa182840c396a7ab064f4c76d1b92d8eefec2d` |
| `harvest-proof` | USDA `usda-pom00004708` | 193,068 / `c7498ad41b5433e8bb67b31210f81c0a8430c391e033b7c6d9c7eccccb64ba76` | 193,020 / `3f4450b881750728fae97c4a9b039c4634f3d9b2bcb5c0511eefb4efc51a8193` |
| `seed-bank-memory` | USDA `usda-pom00004708` | 195,504 / `4518baa3f6090dbb353c95014a443d89b87728c6f08b26dd66bba370a4d56025` | 195,022 / `f333150fa373122de56526eac53ce93b4a2afd2a8ea5a6707e78e9270447fb45` |

The manifest records the USDA watercolour as public domain in the United States and the faithful reproduction of the 1814 *Flora Batava* plate as public domain. W1's technical overlays are original. W2 uses descriptive alt text from the manifest guidance and explicit intrinsic dimensions/aspect behavior.

## Flagship evidence cabinet

The cabinet is a set of links/previews, not another heavy video embed:

| Destination | Public title and boundary |
| --- | --- |
| `/showcase#recorded-mission` | **Real Codex team run** — `RECORDED` + `VERIFIED`; two overlapping Codex tasks in separate worktrees with source evidence |
| `/lab/cherry-3d/` | **Interactive Three.js lab** — `RUNNABLE PROTOTYPE`; three procedural brand scenes and OBJ/MTL export |
| `/showcase#real-run` | **Uncut skill workflow** — `RECORDED`; automated browser creation, verification, repair, approval, export and reload, explicitly without an AI provider/model |
| `/compatibility` | **Codex + Cherry MCP proof** — `CAPTURED`; a ChatGPT-authenticated Codex CLI using Cherry's local STDIO MCP bridge, not ChatGPT-site WebMCP and not a video |

The cabinet says that every card names only what its artifact proves. Tests exclude AAA, Sora, Sol/Terra/Luna, and `live ChatGPT` wording. The hero likewise asks the user to give **Cherry** an outcome and names pairing rather than implying a captured proprietary ChatGPT browser host.

## TDD evidence

Behavioral tests preceded implementation and were observed RED:

| Behavior | Observed RED | GREEN |
| --- | --- | --- |
| Recorded-player-first six-chapter Landing | `npm.cmd test -- tests/cherry/landing-winner.test.tsx tests/cherry/landing-god-mode.test.tsx`: 2/2 files failed, 10/10 tests failed because the untouched Landing had no recorded-player hero and retained the obsolete teammate/documentation contract | 2/2 files, 10/10 tests passed after the bounded rebuild |
| Four-card evidence cabinet | focused run: 1 failed / 10 passed; `[data-testid="proof-cabinet"]` was absent | 11/11 passed with four exact destinations and no seventh chapter |
| Narrow Three.js public claim | focused W2 suite: 1 failed / 7 passed; received `export OBJ/MTL or GLB` when the new test required only the release-proven `export OBJ/MTL` | final focused suite 11/11 passed |
| Host-bound hero honesty | focused W2 suite: 1 failed / 7 passed; received `Give ChatGPT an outcome` when the regression required `Give Cherry an outcome` | final focused suite 11/11 passed with the paired-computer boundary |
| Browser accessibility contrast | initial owned browser run: 4/5 passed; axe reported serious contrast failures in inherited replay labels | scoped Landing CSS tokens corrected; full owned browser run passed |
| Functional Three.js proof | dev-server attempt failed because Vite's SPA fallback served the app shell at the static lab route; production preview reached WebGL and scene switching, but a GLB download event did not arrive within 90 seconds | unchanged production lab passed the OBJ+MTL proof with two completed, non-empty downloads |

The focused final command `npm.cmd test -- tests/cherry/landing-winner.test.tsx tests/cherry/landing-god-mode.test.tsx` passed **2/2 files, 11/11 tests**. The same focused suite had also passed on three independent pre-final-copy runs (11/11 each); the final copy regressions were rerun after their REDs and again inside the full gate.

## Browser, visual, and accessibility verification

Final command:

```text
npx.cmd playwright test e2e/cherry/final-winner-landing.spec.ts --project=desktop --reporter=line --output=test-results-w2
```

Result: **6/6 passed in 28.2 seconds** against the production preview.

- 1440×900, 1280×800, and 390×844 each showed the explicit recorded label, `Outcome recorded`, and Play control completely inside the first viewport after verified fixture load.
- All three sizes had at most one CSS pixel of horizontal overflow, no page errors, no console errors, and no 404 responses.
- All five responsive Chronicle images were scrolled into view and required to report non-zero `naturalWidth` before full-page capture.
- At 390×844, keyboard traversal reached the visible skip link and focused `main`; Enter advanced the player; the focused control had a visible outline.
- Reduced-motion emulation produced no running animations and no autoplay.
- Axe reported no serious or critical violations.
- The Three.js route returned an OK document, a non-zero WebGL canvas, and ready objects for `cherry-twins`, `cherry-coupe`, and `cherry-wine-bottle`. `Download OBJ + MTL` emitted both `cherry-wine-bottle.obj` and `cherry-wine-bottle.mtl`; both downloads reported `failure() === null` and both saved files had size greater than zero.

The following ignored screenshots were visually inspected before cleanup: `test-results/w2-first-desktop-1440.png`, `w2-first-desktop-1280.png`, `w2-first-mobile-390.png`, and the corresponding three `w2-{viewport}.png` full-page captures. The editorial split hero, Chronicle sequences, dark proof cabinet, proof/authority/archive compositions, and final CTA were intact. No image was blank, clipped, stretched, or missing; the 390 px version stacked without overflow while retaining the evidence hierarchy.

An earlier independent interactive audit had successfully exercised the lab's available formats. However, this fresh release-environment automation did not observe a GLB download within 90 seconds. W2 therefore does **not** promote GLB in public copy; its automated headline proof and copy are limited to OBJ/MTL. This remains an integrated follow-up, not a reason to overstate the artifact.

## Final verification

- `npm.cmd run typecheck` — passed.
- Focused ESLint over all W2-owned TypeScript/TSX — passed.
- `npm.cmd run build` — passed; final Vite build completed in **21.98 s**. Existing third-party Privy PURE-annotation and large-chunk warnings remained non-fatal.
- `npm.cmd run gates` — passed:
  - typecheck passed;
  - full lint passed;
  - Vitest: **61 passed / 1 skipped files; 569 passed / 2 skipped tests**;
  - runner/MCP: **131/131 passed**, 0 failed.
- `git diff --check` — passed (Git reports only the repository's Windows LF→CRLF checkout advisory).

## Rejected variants and design decisions

- Rejected the teammate-first carousel and obsolete eleven-section documentation rhythm.
- Rejected a second embedded video; the verified W3 player is the single heavy first-viewport proof.
- Rejected gradients, glass, particles, generic AI imagery, pricing, Windows-download copy, and fake live/always-on claims.
- Rejected claims of AAA game production, Sora output, named Sol/Terra/Luna model work, or live ChatGPT-site WebMCP without capture metadata.
- Rejected GLB from the public Three.js headline after the fresh automated timeout; retained only the non-empty OBJ/MTL proof.
- Limited visual cards to the player/evidence groupings and used rules, editorial fields, a panorama, seal, archive, and ledger compositions to avoid a repeated card-grid page.

## Integration re-checks and concerns

W0 should rerun the focused Landing tests, production build, owned Playwright spec, and repository gates after integration; inspect the three target viewports; confirm the four anchor targets still resolve; and ensure no service worker serves an older Landing/Showcase chunk. Deployment and live-origin verification remain W0 responsibilities.

The only open concern is the production-preview GLB download event that did not arrive within 90 seconds in this environment. OBJ/MTL is fully automated and verified, the earlier interactive audit was positive, and no Landing claim depends on GLB. No live deployment, authentication, provider invocation, or consequential action was performed by W2.
