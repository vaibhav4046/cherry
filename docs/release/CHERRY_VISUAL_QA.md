# Cherry visual QA

**Date:** 2026-08-29 · Direction: Slush sticker-book (decision D-002)

## Method

- Playwright screenshots at 390×844, 834×1194, 1280×800, 1440×1024 for the landing page and Studio
  (`docs/release/screenshots/*.png`), plus a populated Command Center at desktop.
- Automated overflow assertions in `e2e/cherry/responsive.spec.ts`: horizontal scroll ≤ 1px at all
  four viewports on landing and Studio — passing.
- Mobile: rail hidden, bottom navigation shown (asserted).

## Design-system conformance

- Marquee strip, pill nav (1600px radius), 1px carbon outlines on every interactive element,
  20–40px card radii, crushed uppercase display type, section colour bands
  (cherry wash → white → gray → sky), sticker palette used as a set — all present on the landing page
  screenshot and shared by the Studio via the same tokens.
- No gradients; no box-shadows; elevation is bands + outlines only (grep over CSS: zero `box-shadow`,
  zero `gradient`).
- Both marketing ribbon motifs are decorative SVG with `aria-hidden`.

## Findings & fixes

- F-1: `.sticker-cherry` white-on-pink failed contrast → moved to cherry-wash bg + carbon text (fixed,
  re-verified by axe).
- F-2: preview host binding (`localhost` vs `127.0.0.1`) broke the e2e web server → pinned vite
  preview/server host to 127.0.0.1 (fixed).

No dead states, clipping, or compressed-desktop mobile layouts remain on the captured routes.
