# Cherry accessibility audit

**Date:** 2026-08-29 · Target: WCAG 2.2 AA where applicable

## Automated

- axe-core (via @axe-core/playwright) on the landing page and Studio empty state at desktop and mobile:
  **0 serious/critical violations** (e2e `responsive.spec.ts`). The one finding surfaced during
  development (white-on-cherry sticker text at 3.16:1) was fixed by moving the cherry sticker to a
  wash background with carbon text.

## Keyboard

- Full keyboard path verified by e2e: workspace creation completes with typing + Enter only.
- All interactive elements are native `button`/`a`/`input`/`select`/`textarea`/`details` — no
  div-with-onClick anywhere (grep-verified).
- `:focus-visible` renders a 3px violet outline on every control; never removed without replacement.

## Structure

- Semantic landmarks on every page: `header`, `nav` (labelled), `main`, `footer`, `section` with
  `aria-labelledby` headings; heading hierarchy starts at h1 per route.
- Status changes announce through `role="status"` / `role="alert"` and `aria-live="polite"` on the
  event strip and preview console — no continuous announcement sources.
- Tables use real `table/thead/th[scope]` markup; icon-only buttons carry `aria-label`.

## Motion & touch

- `prefers-reduced-motion: reduce` disables the marquee animation and all transitions globally
  (CSS media query), reported in the capability diagnostic.
- Touch targets: buttons and nav pills are min-height 44px; mobile bottom-nav items are 44×44.

## Colour

- Status is never colour-only: every status sticker carries its text label ("passed", "failed",
  "untrusted", "waiting for runner").
- Sticker palette on pastel surfaces uses carbon text; white text appears only on carbon/violet/ember
  fills (≥ 4.5:1).

## Graph alternative

- The SkillGraph workspace is a semantic ordered list of nodes with full text (title, goal, kind) —
  the list IS the primary representation, so no separate outline fallback is needed.

## Known limitations

- Automated axe coverage runs on two representative routes; deeper routes share the same component
  vocabulary but were checked manually, not with axe.
