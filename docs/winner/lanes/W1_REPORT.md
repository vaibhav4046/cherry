# W1 — Cherry Chronicle art director lane report

## Status and scope

**DONE_WITH_CONCERNS.** The lane delivers seven Chronicle editorial illustrations as fourteen responsive SVGs, three mechanically derived public-domain botanical sources, a closed manifest, design guidance, visual-acceptance evidence, and a fail-closed verifier with regression tests.

- Branch: `lane/cherry-artifacts`
- Baseline: `d092b9466d2a1bfe45ccb3573e53cd5dd4303896`
- Asset-system commit: `9ccf7402ff0bc0e3b70a655977d354dd79c83cdc`
- Duplicate-path/report fix: the commit containing this tracked report
- AI image generation: not used
- Rights policy: public-domain historical material plus original Cherry overlays

The fix commit changes only this report, `scripts/verify-cherry-chronicle-assets.mjs`, and `tests/assets/cherry-chronicle-assets.test.mjs`. It does not change any shipped image or manifest datum.

## Source rights and provenance

Source-page and rights claims were checked on 2026-09-02. The shipped WebPs are mechanical derivatives only: auto-oriented, resized to fit within 1200×1600, converted to sRGB, stripped of metadata, and encoded at WebP quality 82. The SVG editorial overlays are original Cherry work.

| Source | Creator / date | Rights basis and source | Original dimensions / bytes / SHA-256 | Shipped derivative dimensions / bytes / SHA-256 |
| --- | --- | --- | --- | --- |
| `flora-batava-0226` | *Flora Batava*, published by Jan Christiaan Sepp, 1814 | Faithful reproduction of a public-domain two-dimensional work; [source page](https://commons.wikimedia.org/wiki/File:Prunus_avium_-_Pl0226_-_FloraBatava-KB-v03.jpg); Public Domain Mark 1.0 | 2905×3655; 2,938,564; `a29478d9bd9a8a0090a2666bde9e2b1795ebb49d16d5132278e1feda187983e7` | 1200×1510; 140,478; `6b0d0cde2b42a3d5baabf82a4cc7eb20c5efad838fe68357d7cf929826559054` |
| `usda-pom00004708` | Harriet L. Thompson for USDA, 1915 | USDA Pomological Watercolor Collection; U.S. federal-government work identified as public domain in the United States; [source page](https://commons.wikimedia.org/wiki/File:Pomological_Watercolor_POM00004708.jpg) | 2667×4000; 8,708,312; `817a4de367ad4d4e1bdd63c8d2a5abe00a2ed5da32e5a810c9801ca9abab0db6` | 1067×1600; 143,432; `c9bb81e32306a781f200c988f8e031c938f36554664e4cafd8aece9eae91f480` |
| `usda-pom00004719` | J. Marion Shull for USDA, 1909 | USDA Pomological Watercolor Collection; U.S. federal-government work identified as public domain in the United States; [source page](https://commons.wikimedia.org/wiki/File:Pomological_Watercolor_POM00004719.jpg) | 2725×4000; 7,957,294; `fd0ff3d597c609aaa904b4041b3446d6d9cd1501cdaf11beb75d1ebaae3ed213` | 1090×1600; 79,504; `f0a5dd6e22f741dc0449c8e158fda660789f5b611b0aa9a297cd3d54adf4d6c0` |

The two USDA rights statements are expressly scoped to the United States. Release in a jurisdiction that treats U.S. government works differently needs ordinary jurisdiction-specific review.

## Shipped artifacts

| Artifact | Variant | Dimensions | Bytes | SHA-256 |
| --- | --- | ---: | ---: | --- |
| `seed-outcome` | desktop | 1600×1000 | 193,362 | `15f9ced2ccc7f24944c9729a319eb27e095a1c4dc66e685e89c930ef31a3627a` |
| `seed-outcome` | mobile | 780×1040 | 193,331 | `d975226065f9ce9b986639b21e6d10ffd6c070649efd6c72ff8940da5568d06c` |
| `roots-capability` | desktop | 1600×1000 | 189,694 | `e05204f4d7b3dbf66e91fcd7718c06415d1de27b516c576fadeb57b86c682d57` |
| `roots-capability` | mobile | 780×1040 | 189,631 | `c0700ff093f028c52fbcc0ff076201bfa377b16272b878d0a2b6aa2180659a4f` |
| `branches-workforce` | desktop | 1600×1000 | 189,959 | `9c6648e5c8144bfffbaae94b3c942d5c90775e4d7d35a17501cce7f993bdbb82` |
| `branches-workforce` | mobile | 780×1040 | 189,921 | `e70f53631338dd96a40f03d860e6bba18e7104e5e5d8a98a2e4621b036ebd3d1` |
| `grafts-portability` | desktop | 1600×1000 | 108,727 | `9ad23d31372c94e2951b3168689cad2ef7ee952e7408c793962360657c7b3fea` |
| `grafts-portability` | mobile | 780×1040 | 108,693 | `d719a4cdc85fa112d8a4f6f193295995019f5d01e47676115a1a7efa699adcbe` |
| `glasshouse-sandboxes` | desktop | 1600×1000 | 189,568 | `0544bc1ea4cc25e8bfdbbbf03a65a7f34a2c28a3a88586d30b9427b98551fc27` |
| `glasshouse-sandboxes` | mobile | 780×1040 | 189,754 | `817564896969967bae59cc380cfa182840c396a7ab064f4c76d1b92d8eefec2d` |
| `harvest-proof` | desktop | 1600×1000 | 193,068 | `c7498ad41b5433e8bb67b31210f81c0a8430c391e033b7c6d9c7eccccb64ba76` |
| `harvest-proof` | mobile | 780×1040 | 193,020 | `3f4450b881750728fae97c4a9b039c4634f3d9b2bcb5c0511eefb4efc51a8193` |
| `seed-bank-memory` | desktop | 1600×1000 | 195,504 | `4518baa3f6090dbb353c95014a443d89b87728c6f08b26dd66bba370a4d56025` |
| `seed-bank-memory` | mobile | 780×1040 | 195,022 | `f333150fa373122de56526eac53ce93b4a2afd2a8ea5a6707e78e9270447fb45` |

## Visual acceptance

All fourteen final SVGs were rendered in headless Google Chrome during the asset-system work. Desktop inspection screenshots were exactly 1600×1000 pixels, corresponding to 800×500 CSS pixels at 2× density. Mobile inspection screenshots were exactly 780×1040 pixels, corresponding to 390×520 CSS pixels at 2× density. The screenshots were temporary inspection evidence and were removed before staging.

| Pair | Desktop inspection | Mobile inspection | Result |
| --- | ---: | ---: | --- |
| seed / outcome | 1600×1000 | 780×1040 | pass |
| roots / capability | 1600×1000 | 780×1040 | pass |
| branches / workforce | 1600×1000 | 780×1040 | pass |
| grafts / portability | 1600×1000 | 780×1040 | pass |
| glasshouse / sandboxes | 1600×1000 | 780×1040 | pass |
| harvest / proof | 1600×1000 | 780×1040 | pass |
| seed bank / memory | 1600×1000 | 780×1040 | pass |

Inspection covered cropping, hierarchy, legibility at intended display size, restraint of proof-blue marks, distinct desktop/mobile compositions, botanical-source visibility, absence of forbidden robot/neon/gradient language, and absence of embedded product copy. The recovered independent review did not complete its own fourteen-image render verdict before interruption; this lane report records W1's completed Chrome inspection, not an independent re-review. The fix commit changes no media, so no image was re-rendered during the fix round.

## Rejected sources and variants

- `public/media/cherry-editorial/**`: rejected because its manifest names absent masters, has no source-rights ledger, and several works use prohibited robot/retro-AI motifs.
- Wikimedia Commons `Illustration Prunus avium0.jpg`: rejected for a title/description taxonomy conflict (`Prunus avium` versus `Prunus padus`).
- Wikimedia Commons `314 Prunus avium.jpg`: rejected because its 434×728 original was below the desktop source threshold.
- Relative-reference Chronicle SVGs: rejected after a capture renderer dropped their external WebP botanical layer.
- Seed-bank v1: rejected for exceeding desktop and mobile byte budgets.
- Seed-bank v2: rejected after Chrome capture exposed clipping that hid five of six botanical card layers.
- ImageMagick previews: rejected as final visual evidence because that renderer omitted the embedded WebP layer.

## Verification evidence

### Original asset-system RED

`node --test tests/assets/cherry-chronicle-assets.test.mjs` initially exited 1 with 0 passing and 3 failing tests because the verifier did not exist. Once the verifier existed, the repository acceptance test remained red until the manifest was added. The real verifier later rejected over-budget seed-bank variants and undeclared temporary build/source-master files before those conditions were corrected.

### Fix-round RED

The duplicate-path regression was added before changing production code. It makes an artifact desktop variant redeclare the source derivative as `sources//source.png`, exercising normalized cross-source/variant reuse through the real verifier CLI.

```powershell
node --test tests/assets/cherry-chronicle-assets.test.mjs
```

Exit 1: 4 tests, 3 pass, 1 fail. The new assertion expected `duplicate declared file path`; the verifier emitted only `expected 1600x1000, found 1x1` and `no historical botanical source layer found`. This proved the prior `Set` silently collapsed the second normalized declaration.

### Fix-round GREEN

The verifier now registers every safe declaration in one global `Map`, immediately after path normalization and before file I/O. A second source or variant declaration of the same resolved path emits a duplicate-path error naming both declarations. Missing or otherwise invalid files cannot bypass this registry.

```powershell
node scripts/verify-cherry-chronicle-assets.mjs
```

Exit 0: `Verified 7 Chronicle artifacts, 14 responsive variants, and 3 public-domain sources.`

```powershell
node --test tests/assets/cherry-chronicle-assets.test.mjs
```

Exit 0: 4 tests, 4 pass, 0 fail, 0 skipped.

```powershell
npm.cmd run gates
```

Exit 0:

- `tsc --noEmit`: pass
- `eslint .`: pass
- Vitest: 59 files passed, 1 skipped; 539 tests passed, 2 skipped
- runner/MCP Node suite: 131 tests passed, 0 failed

The asset-system commit also ran `npm.cmd ci` successfully from the repository lock (992 packages installed; package manifests unchanged). npm reported existing peer/deprecation warnings and 10 moderate audit findings. Dependency remediation was outside W1's ownership.

## Self-review and caveats

- The manifest is closed over exactly three shipped source derivatives and fourteen shipped SVGs; undeclared files fail verification.
- File declarations share one normalized registry across sources and both responsive variant types; duplicate aliases fail even when one spelling contains redundant separators.
- Source IDs and artifact IDs remain independently unique; every embedded botanical payload must hash to an artifact's declared source.
- Hashes, byte sizes, dimensions, byte budgets, missing files, unsafe paths, visible SVG text, and undeclared files fail closed.
- The SVGs are self-contained and make no network requests. Product instructions, controls, status, and claims must remain live HTML; historical source handwriting is decorative and nonessential.
- Proof-blue marks are editorial motifs, not evidence of a live pass or approval.
- The older `public/media/cherry-editorial/cherry-editorial-manifest.json` still contains dangling entries and no rights ledger. It is outside W1 ownership and must not be treated as Chronicle provenance.
- W0 owns integrated `verify:all`; W1 ran the focused verifier/tests and the required complete `npm.cmd run gates`.
