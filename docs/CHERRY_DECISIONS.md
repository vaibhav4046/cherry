# Cherry decisions log

Material deviations and interpretation decisions, with reason, consequence, and rollback.

## D-001 — Fresh repository instead of Enough-derived evolution

- **Decision:** Build Cherry as a new repository at `D:\project\cherry`.
- **Reason:** The pack assumes an existing Enough-derived WebMCP repository. A full-disk search found no
  such repository on this machine (evidence in `docs/CHERRY_BASELINE.md`). The pack's own fallback
  ("if the archive was attached outside the repository…") applies.
- **Consequence:** No Enough regression tests exist to preserve; the "preserve existing behaviour"
  requirements are satisfied vacuously and the full product contract was implemented from the spec.
- **Rollback:** None needed; if the Enough repository surfaces later, this repo's `src/cherry` domain
  layer is framework-independent and can be transplanted.

## D-002 — Visual direction: Slush sticker-book system instead of Black Cherry OS

- **Decision:** Implement the user-supplied Slush style reference (pastel paper, 1px carbon outlines,
  pill radii, crushed display type, six-color sticker palette, color-band sections, no gradients, no
  box-shadows) with cherry pink/red leading the palette.
- **Reason:** The user supplied the Slush reference explicitly mid-execution; the source-of-truth order
  places the current user instruction above the pack's design section.
- **Consequence:** Spec §10's dark "Black Cherry OS" tokens are superseded. All other design
  requirements (semantic states never colour-only, reduced motion, focus visibility, responsive
  transforms) still hold and are tested.
- **Rollback:** Tokens live in one file (`src/design-system/tokens.css`); swapping palettes does not
  touch components.

## D-003 — Parent CSP allows 'unsafe-inline' scripts

- **Decision:** The deployed CSP (`public/_headers`) includes `script-src 'unsafe-inline'`.
- **Reason:** Sandboxed `srcdoc` preview iframes inherit the embedding document's CSP. A strict
  `script-src 'self'` would silently kill the artifact preview runtime — the product's core feature.
  The preview adds its own `default-src 'none'` meta CSP and `sandbox="allow-scripts"` (opaque origin,
  no network, no storage), verified by the e2e sandbox probe.
- **Consequence:** The app relies on React's output encoding for XSS safety; no `dangerouslySetInnerHTML`
  or HTML injection exists in the codebase (verified by grep in the security audit).
- **Rollback:** Serve previews from a second origin and restore `script-src 'self'`.

## D-004 — Runner is dependency-free Node ESM, not a TypeScript build

- **Decision:** `runner/server.mjs` and `runner/mcp/server.mjs` are plain Node ESM with zero
  dependencies and no build step, instead of the pack's `runner/src/*.ts` layout.
- **Reason:** Zero-dollar and zero-toolchain: the runner starts with `node runner/server.mjs` on a bare
  Node install. Behaviour (loopback bind, pairing token, allowlists, spawn without shell, timeouts,
  atomic persistence, redaction) matches the contract and is covered by 9 integration tests.
- **Consequence:** `docs/CHERRY_REPO_MAP.md` documents the mapping.
- **Rollback:** Port to TypeScript under `runner/src/` and add a build step; tests carry over.

## D-005 — Native MCP bridge operates on exported workspace files

- **Decision:** The stdio MCP bridge reads workspace exports and verifies hashes; it does not mutate
  workspace state.
- **Reason:** Studio state lives in browser IndexedDB, which a Node process cannot reach. Pretending
  otherwise would fake a capability. Reads + independent verification are what a CLI agent can honestly
  do; mutations belong in the Studio (manual or WebMCP) where the human sees them.
- **Consequence:** The optional `native_mcp_bridge` gate is scoped to read/verify tools; the
  compatibility matrix says exactly that.
- **Rollback:** A future runner-hosted store could give the bridge a writable path.

## D-006 — Fonts from Google Fonts with system fallbacks

- **Decision:** Archivo Black (display) + Inter (UI) via Google Fonts CSS, with full system fallback
  stacks (`Arial Black`, system-ui).
- **Reason:** Slush direction needs a crushed 800-weight display face; Google Fonts is $0 and licensed;
  the build does not fail offline because fallbacks render everything.
- **Consequence:** CSP includes fonts.googleapis.com/fonts.gstatic.com.
- **Rollback:** Delete the `@import` line; fallbacks take over.

## D-007 — Command Center hosts approvals/state selection; no separate /studio routes beyond spec list

- **Decision:** Route set implemented exactly as spec §6 with `settings/connections` combining
  connections + privacy and workspace deletion.
- **Reason:** Keeps every route real and populated; avoids dead navigation.

## D-008 — Auth (incl. Privy) declined for v1; guest-first stays

- **Decision:** No auth layer. Cherry remains guest-first: open the page, own your data.
- **Reason:** Cherry has no server and no per-user cloud state — there is nothing an account would
  unlock. Privy (or any auth SDK) adds an external service dependency, API keys, bundle weight, and a
  login wall in front of the 3-minute demo, all against the zero-dollar core and the golden path.
- **Consequence:** The compatibility page lists "Accounts / auth" as Roadmap with this rationale.
- **Rollback:** If encrypted sync ships later, auth rides in with it behind the same guest-first default.

## D-009 — Cherry-native identity evolution (v2 brand layer)

- **Decision:** Evolve the Slush sticker-book base into a Cherry-native system: dark-cherry/maroon +
  cream + blush palette anchors, cherry-burst hero interaction, a recurring SVG mascot that explains
  each section, scroll-depth reveals (IntersectionObserver, no scroll handlers), a CHERRY OS
  watermark band, and earned motion on the three emotional beats (approval stamp, verification pop,
  receipt print). All zero-dependency SVG/CSS; every animation is neutralised under
  prefers-reduced-motion and the burst never gates navigation.
- **Consequence:** Landing sections re-composed; axe and overflow tests still pass; Studio screens
  stay operationally calm (motion only on state-change beats).

## D-010 — Guided example + replayable walkthrough

- **Decision:** "Try the guided example" imports the real exported example workspace (produced by
  actual domain operations) and starts a replayable walkthrough whose steps navigate real routes with
  real records. Steps that need records the workspace lacks are skipped, not faked.
- **Consequence:** A judge reaches the fail→repair→pass receipt story in under a minute without
  reading docs. The walkthrough is re-launchable from the Command Center.
