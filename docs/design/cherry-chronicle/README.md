# Cherry Chronicle art direction

Cherry Chronicle is a seven-artifact editorial system: a nineteenth-century botanical archive made operational through precise, original vector overlays. It expresses one continuous story:

```text
seed → roots → branches → grafts → glasshouse → harvest → seed bank
outcome → capabilities → workforce → portability → isolation → proof → reusable memory
```

The system uses three layers:

1. A documented public-domain botanical source.
2. Original Cherry technical linework in wine, cherry, moss, and proof blue.
3. Live HTML for every product label, status, claim, and interaction.

No AI-generated imagery was used. The shipped SVGs embed exact byte copies of their declared public-domain WebP derivatives, so they remain self-contained and render without network access. The three derivative files remain alongside the SVGs for provenance inspection and future, traceable art direction.

## Visual system

| Token | Value | Use |
| --- | --- | --- |
| Paper | `#f7efe3` | archival ground |
| Deep paper | `#ead9c4` | bounded nodes and cards |
| Carbon | `#211417` | rare structural contrast |
| Wine | `#641c37` | primary technical line |
| Cherry | `#b7234a` | seed and completion accent |
| Blush | `#d98599` | secondary ring and revision cue |
| Moss | `#647650` | living rootstock/capability cue |
| Proof blue | `#365a9b` | independent verification only |

All compositions use flat colour: no gradient, glow, particle field, generic circuit fruit, or floating dashboard. Registration corners and a quiet 34-unit paper-dot rhythm hold the family together. Botanical paint remains soft enough for product UI to own the hierarchy.

## Artifact map

| Artifact | Product meaning | Desktop live-copy area | Mobile live-copy area |
| --- | --- | --- | --- |
| `seed-outcome` | define the outcome and first dependency split | open left field | open upper field |
| `roots-capability` | bounded tools, files, WebMCP, MCP, and approved apps | open left field | band below the botanical plate |
| `branches-workforce` | parallel tasks and checked terminals | right-side terminal field | upper band and exterior node anchors |
| `grafts-portability` | interchangeable workers on stable Cherry state | bilateral endpoint fields | endpoint field around central rootstock |
| `glasshouse-sandboxes` | isolated worktrees and execution boundaries | three compartment labels outside artwork | three live labels below or above compartments |
| `harvest-proof` | independent checks, repair, and human authority | right inspection field | upper band or adjacent proof card |
| `seed-bank-memory` | exact-revision skills and reusable procedures | header plus seven live card labels | header plus six visible cards; seventh can follow in DOM |

## Responsive contract

Every motif has a 1600×1000 desktop SVG intended to display at 800×500 CSS pixels and a 780×1040 mobile SVG intended to display at 390×520 CSS pixels. The mobile files are recomposed, not cropped desktop art: primary forms enlarge, branching reduces, and safe zones move above the illustration.

Use the files through a `<picture>` element and keep product semantics in the surrounding DOM:

```html
<picture>
  <source media="(max-width: 767px)" srcset="/media/cherry-chronicle/artifacts/seed-outcome-mobile.svg">
  <img
    src="/media/cherry-chronicle/artifacts/seed-outcome-desktop.svg"
    alt="A historic cherry study overlaid with a seed opening into a two-branch mission graph."
    width="1600"
    height="1000"
  >
</picture>
```

Decorative use should set `alt=""`. Explanatory use should take the concise recommendation from the manifest. Do not use the SVG `<title>` as a substitute for the page's accessible name.

## Product truth and interaction

- Proof-blue geometry is an editorial cue, never evidence that a check passed. Bind live check text to actual stored results.
- A terminal node does not imply an agent completed work. Render real task state next to it.
- The harvest medallion does not imply approval. Human approval remains an explicit live control.
- Model names belong in live chips around `grafts-portability`; the art stays vendor-neutral.
- The assets make no network request. Their embedded source layers work inside the product's network-blocked preview model.

The machine-readable inventory and integration metadata live in `public/media/cherry-chronicle/cherry-chronicle-manifest.json`. Rights evidence is recorded in [SOURCE_LEDGER.md](SOURCE_LEDGER.md), and visual acceptance is recorded in [VISUAL_ACCEPTANCE.md](VISUAL_ACCEPTANCE.md).
