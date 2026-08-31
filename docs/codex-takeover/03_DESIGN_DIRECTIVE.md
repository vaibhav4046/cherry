# Design directive — Cherry Wine × Hermes

Owner: Claude (architect session). Codex builds **inside** this system and never modifies it.
This file exists so every new screen you build lands looking like it was always here.

## The identity in one line

Hermes-grade restraint (light, quiet, enormous whitespace, one accent, type does the talking)
wearing Cherry Wine's color: a single deep wine-red accent on a warm off-white canvas, with the
cherry as the only brand gesture. Reference points: the Hermes Agent site's minimal light system;
Apple's type/spacing restraint (already tokenized in the repo). Not: glassmorphism showcases,
gradient heroes, icon walls, dark panels inside light pages.

## Tokens (implemented by Claude in the design system; consume, don't redefine)

- Canvas: warm off-white (`--surface-canvas`), cards on hairline borders, existing subtle
  elevation only.
- Accent (the ONLY accent): cherry wine `#8C1D2F`; hover/active `#731826`;
  tint wash `#F7ECEE`; focus ring uses the accent. Replaces every blue accent use (primary
  buttons, links, logo mark, active states). Semantic stickers keep their meanings (pass=green,
  fail=red, wait=amber) — do not wine-wash semantics.
- Type: existing scale (display/subhead/body/label). No new sizes, no new fonts.
- Spacing: existing `--sp-*` scale. When in doubt, add space, not boxes.
- Radius/shadows: existing tokens only.

## Rules for any screen you touch

1. One primary action per screen, accent-colored. Everything else is quiet (`btn`, `link-quiet`).
2. Empty states teach in one sentence and offer exactly one next step (two max).
3. Forms: one column, labeled fields, no placeholder-as-label, visible focus, Enter submits.
4. Long content scrolls inside its container; the page never scrolls horizontally.
5. Motion: none beyond existing transitions; everything honors `prefers-reduced-motion`.
6. No emoji in UI. No exclamation marks in UI copy. No decorative icons — the existing brand
   SVG marks (Slack/Teams/Discord/Telegram/GitHub/YouTube) appear only where integration is
   real or explicitly labeled as a target.
7. Accessibility is a gate: keyboard path through every new flow, aria-labels on icon buttons,
   axe-clean (the e2e suite checks; keep it green).
8. Every state honest: loading says loading, absence says why, failure says what failed and the
   one thing to try. Never a fake progress bar, never a disabled control with no explanation.

## What "cherry wine vibe" does NOT mean

Not a dark theme, not maroon backgrounds, not wine-colored text blocks, not photographic
textures. The wine is jewelry: buttons, links, the mark, focus, tiny moments (the receipt seal).
The page stays airy and light; the accent makes it unmistakably Cherry.
