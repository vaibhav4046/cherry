# Cherry Chronicle source and rights ledger

The Chronicle artwork uses only the three sources below plus original vector overlays authored for Cherry. No AI image generation, stock library, scraped social media, or unlicensed reference image was used.

The original downloads were used only to create mechanical, metadata-stripped WebP derivatives. They are not shipped. The original byte counts and hashes below identify the exact inputs; the manifest identifies and verifies every shipped derivative.

## Source records

| ID | Work / creator / date | Source and rights evidence | Original capture | Shipped derivative |
| --- | --- | --- | --- | --- |
| `flora-batava-0226` | *Prunus avium*, plate 0226, *Flora Batava*, vol. 3; published by Jan Christiaan Sepp; 1814 | [Wikimedia Commons source page](https://commons.wikimedia.org/wiki/File:Prunus_avium_-_Pl0226_-_FloraBatava-KB-v03.jpg); marked as a faithful reproduction of a two-dimensional public-domain work and free of known restrictions under the [Public Domain Mark 1.0](https://creativecommons.org/publicdomain/mark/1.0/) | 2905×3655 JPEG; 2,938,564 bytes; SHA-256 `a29478d9bd9a8a0090a2666bde9e2b1795ebb49d16d5132278e1feda187983e7` | `sources/flora-batava-0226.webp`; 1200×1510; 140,478 bytes; SHA-256 `6b0d0cde2b42a3d5baabf82a4cc7eb20c5efad838fe68357d7cf929826559054` |
| `usda-pom00004708` | *Short Stemmed Montmorency* cherries, POM00004708; Harriet L. Thompson for USDA; 1915 | [Wikimedia Commons source page](https://commons.wikimedia.org/wiki/File:Pomological_Watercolor_POM00004708.jpg); identified as part of the USDA Pomological Watercolor Collection and a U.S. federal-government work in the public domain in the United States; [NAL web policy](https://www.nal.usda.gov/web-policies-and-important-links) | 2667×4000 JPEG; 8,708,312 bytes; SHA-256 `817a4de367ad4d4e1bdd63c8d2a5abe00a2ed5da32e5a810c9801ca9abab0db6` | `sources/usda-pom00004708.webp`; 1067×1600; 143,432 bytes; SHA-256 `c9bb81e32306a781f200c988f8e031c938f36554664e4cafd8aece9eae91f480` |
| `usda-pom00004719` | Cherry branch section, POM00004719; J. Marion Shull for USDA; 1909 | [Wikimedia Commons source page](https://commons.wikimedia.org/wiki/File:Pomological_Watercolor_POM00004719.jpg); identified as part of the USDA Pomological Watercolor Collection and a U.S. federal-government work in the public domain in the United States; [NAL web policy](https://www.nal.usda.gov/web-policies-and-important-links) | 2725×4000 JPEG; 7,957,294 bytes; SHA-256 `fd0ff3d597c609aaa904b4041b3446d6d9cd1501cdaf11beb75d1ebaae3ed213` | `sources/usda-pom00004719.webp`; 1090×1600; 79,504 bytes; SHA-256 `f0a5dd6e22f741dc0449c8e158fda660789f5b611b0aa9a297cd3d54adf4d6c0` |

## Derivative operation

Each source was auto-oriented, resized to fit within 1200×1600 pixels, stripped of metadata, converted to sRGB WebP at quality 82, and otherwise left unaltered. The overlays are original SVG paths, circles, ellipses, rectangles, patterns, and clipping geometry. They do not trace or borrow a competitor layout.

Public-domain status and source-page claims were checked on 2026-09-02. The two USDA records are explicitly scoped as public domain in the United States; distribution teams targeting another jurisdiction should retain this ledger and perform their normal jurisdiction-specific review.

## Rejected source candidates

| Candidate | Reason rejected |
| --- | --- |
| Wikimedia Commons `Illustration Prunus avium0.jpg` | The page title says *Prunus avium*, but its current description and category identify *Prunus padus*. The taxonomic conflict made provenance insufficiently precise. |
| Wikimedia Commons `314 Prunus avium.jpg` | Rights were clear, but the 434×728 original was too small for the 1600×1000 editorial treatment. |
| Existing `public/media/cherry-editorial/**` pack | Inspected for continuity only. The pack's manifest contains absent PNG/video master entries and no source-rights ledger; several images also use the prohibited cherry-robot/retro-AI motif. None was reused or modified. |

## Preservation rule

Do not replace a derivative without updating its dimensions, bytes, SHA-256, source record, and every embedding artifact hash in the manifest. `node scripts/verify-cherry-chronicle-assets.mjs` fails closed on missing files, drift, undeclared botanical layers, traversal, visible SVG text, wrong dimensions, budget overruns, and unmanifested files.
