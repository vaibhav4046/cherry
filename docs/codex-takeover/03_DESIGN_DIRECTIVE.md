# Design directive — Cherry Wine

**Owner:** the repository maintainer working through Codex. Any file may be changed when the task requires it, but every visual change must preserve the system below and pass accessibility and browser verification.

## Identity

Cherry uses restrained editorial product design: warm off-white canvas, deep wine-red accent, strong typography, generous whitespace, and the cherry mark as the only recurring brand gesture. The interface should feel like a serious tool, not an effects demo.

## Tokens

- Canvas: existing warm off-white surface tokens.
- Accent: `#8C1D2F`; hover/active `#731826`; tint `#F7ECEE`.
- Semantic states keep their own meanings. Do not recolor pass, fail, or waiting states for branding.
- Use the existing type, spacing, radius, shadow, and motion tokens. Do not create local substitutes.

## Rules

1. One primary action per screen. Secondary actions stay quiet.
2. Empty states explain why the screen is empty and provide one useful next step.
3. Forms use visible labels, one clear column, keyboard submission, and visible focus.
4. No horizontal page overflow. Long material scrolls inside a bounded region.
5. Motion must communicate state and respect `prefers-reduced-motion`.
6. No decorative icon walls, fake progress, hype copy, or visual effects that reduce legibility.
7. Every changed surface must remain keyboard usable and axe-clean.
8. Loading, failure, absence, and experimental states must be stated honestly.
9. Screenshots and recordings must show the current build, never an obsolete mockup.
10. Review at desktop and Pixel 7 dimensions before claiming the UI is complete.

## What the Cherry Wine style is not

It is not a dark theme, a maroon canvas, glassmorphism, a gradient showcase, or a dense dashboard by default. The wine color is punctuation. Content, evidence, and decisions remain the focus.
