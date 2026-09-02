# Cherry Chronicle visual acceptance

## Method

All 14 SVGs were rendered locally in headless Chrome with file access enabled so the final browser renderer—not ImageMagick's partial SVG implementation—was evaluated. Desktop files were inspected from 1600×1000 captures and mobile files from 780×1040 captures, corresponding to the intended 800×500 and 390×520 CSS-pixel display sizes at 2× density.

Acceptance applied the visual-bible rubric: real feature mapping, credible botany, 390 px readability, meaning without embedded product text, family coherence, clear provenance, no generated artefacts, budget, product-UI space, and an original Cherry identity.

## Accepted variants

| Motif | Desktop 1600×1000 | Mobile 780×1040 | Visual acceptance note |
| --- | --- | --- | --- |
| Seed / outcome | Pass | Pass | Seed silhouette stays dominant; dependency split is legible; live-copy field remains open. |
| Roots / capability | Pass | Pass | Five bounded endpoints read as a controlled capability fabric and remain distinct at 390 px. |
| Branches / workforce | Pass | Pass | One parent and three checked terminals remain visually separable; the source branch supports rather than duplicates the graph. |
| Grafts / portability | Pass | Pass | Five connections stay distinct through wine, moss, and proof cues; stable rootstock is central. |
| Glasshouse / sandboxes | Pass | Pass | Three compartments have hard boundaries and equal visual authority; proof blue marks focus without claiming success. |
| Harvest / proof | Pass | Pass | Check geometry and correction path remain separate; the watercolor is botanically credible. |
| Seed bank / memory | Pass | Pass | Archive cards, seed forms, and version-history line survive mobile reduction without relying on labels. |

## Automated acceptance

The verifier enforces:

- exactly six or seven coherent artifacts (the shipped set has seven);
- both desktop and mobile variants for every artifact;
- exact SVG dimensions and view boxes;
- per-variant byte budgets (350 KB desktop, 300 KB mobile);
- exact SHA-256 and byte-size matches;
- complete HTTPS provenance and public-domain rights metadata;
- botanical layers that match the declared source hashes;
- no `<text>` or `<foreignObject>` in artwork;
- safe relative paths and no undeclared shipped files.

## Rejected iterations

| Iteration | Rejection | Correction |
| --- | --- | --- |
| Relative-source SVGs | ImageMagick's SVG renderer dropped the external WebP layer, exposing portability risk in capture tooling. | Embedded the exact declared WebP bytes as data URIs while retaining standalone source derivatives for audit. |
| Seed-bank v1 | Seven repeated data payloads pushed both variants over budget. | Defined one embedded botanical source once and reused it as an internal SVG symbol; desktop and mobile returned below budget. |
| Seed-bank v2 | Per-card clip coordinates caused five/six browser-rendered source layers to disappear. | Removed redundant clipping because the referenced image already has exact card dimensions; rerendered both variants in Chrome. |
| ImageMagick preview set | Historical layers did not render, so the output was not valid browser acceptance evidence. | Rejected those previews and performed the final 14-variant review in headless Chrome. |

## Known constraints

The historical plates contain their original, nonessential scientific handwriting. No product instruction, status, claim, control label, or interaction depends on it. When localizing or composing the page, treat each image as a single editorial unit and keep all essential language in HTML.
