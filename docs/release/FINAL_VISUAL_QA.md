# Cherry final visual and accessibility QA

**Date:** 2026-09-02 · **Branch:** `claude/final-visual-qa` (worktree from `origin/main` @ `c4a0af1`)
**Lane:** `src/design-system/**`, `src/components/BrandIcons.tsx`, the four public pages, one focused
Playwright sweep, this report. Nothing in `src/cherry/**`, `runner/**`, `scraper/**`, service worker,
proof, compiler, approval, persistence, WebMCP, or source-domain logic was touched.

## Routes and viewports inspected

| Route | 1440×900 | 390×844 | States covered |
| --- | --- | --- | --- |
| `/` | yes | yes | live lesson card loaded, keyboard tab order |
| `/showcase` | yes | yes | fresh session (no workspace), recording section |
| `/connect` | yes | yes | all five host cards, copy blocks |
| `/compatibility` | yes | yes | full status table |
| `/studio` | yes | yes | setup-required (no space) and populated by the guided example |
| `/studio/sources` | yes | yes | empty inbox and populated |
| `/studio/quick` | yes | yes | empty wizard and populated |
| `/studio/skills` | yes | yes | empty library and populated |

Method: a Playwright sweep (`e2e/cherry/visual-qa.spec.ts`) drives every route at both sizes and
asserts, per page: horizontal overflow ≤ 1px, zero axe serious/critical violations, zero console
errors, every visible button/link has an accessible name, the first heading is an `h1` with no skipped
levels, and (desktop) every tabbable control in the first 14 tab stops shows a ≥2px focus ring in the
accent colour. Screenshots are written to `docs/release/screenshots/final-qa/`. Before-state captures
were taken with the same tooling for comparison.

## Problems found

Confirmed by the sweep or by direct inspection; each maps to a change below or to a blocker.

1. **Blue cherry.** `--color-cherry-pop` was aliased to Apple blue, so the mascot on the Studio first
   run, the Skill Library empty-state illustration, run fail glyphs and definition-of-done bullets all
   rendered blue on a wine-accent system. Cheeks used a blue-tinted `--color-blush`.
2. **Off-system focus rings.** Global `:focus-visible` was signal blue; Studio rail links and source
   options used a copper `#d99a72`. The sweep reported 13 blue rings on `/` and 12 copper rings in
   the Studio rail. The design directive says the focus ring uses the accent.
3. **Undefined spacing tokens.** `--sp-7` and `--sp-9` do not exist. `.home-hero` used them in its
   `padding` shorthand, so the whole declaration was dropped: computed hero padding was `136px 0px`
   at desktop and `56px 0px` on the phone (text flush to the edge). `/connect` used `--sp-7` as a
   stack gap and silently fell back to the class default.
4. **Mobile bottom navigation clipped.** Twelve Studio sections were squeezed into a 390px fixed bar
   (`scrollWidth` 538 vs `clientWidth` 390): "Command" rendered as "OMMAN" and Crew/Routines/Agent/
   Memory were unreachable. The 90%-opaque bar also let the wine primary button bleed through.
5. **Public pages unreachable on phones.** The landing nav links were `display: none` under 834px, so
   `/compatibility` had no route from the home page on a phone.
6. **Untruthful brand row.** The home hero showed Slack, Microsoft Teams, Discord, Telegram, GitHub and
   YouTube marks under an invisible `aria-label="Connect your existing tools"`. Only YouTube is a real
   source; no code under `src/cherry`, `runner` or `scraper` references the others. The directive allows
   brand marks only where the integration is real or explicitly labelled as a target.
7. **Contradictory Codex label.** `/connect` said the Codex bridge was "Shipped" and that "a live Codex
   host was not available on this machine", while `/compatibility` and `docs/release/CODEX_MCP_CAPTURE.md`
   record a live Codex CLI validation on 2026-09-01.
8. **Contrast failures (axe serious).** Unreached milestone labels on `/showcase` faded with
   `opacity: 0.45` to 2.8:1. The 11px "add a source" rail hint sat at 4.28:1 on the active wine tint.
9. **Scrollable code blocks without keyboard access (axe serious).** The two `<pre>` blocks on
   `/connect` overflowed sideways and were not focusable.
10. **Two primary actions per screen.** The landing showed a wine "Open Studio" in the nav, a wine
    hero CTA and a wine "Connect your agent" band button at once.
11. **Copy drift.** "aperture" appeared three times on `/compatibility`; "Approval binds to a hashed
    revision, not to a vibe" on `/showcase`; two stale test counts ("30 workforce unit tests",
    "19 e2e tests total") that no longer match the suites (18 + 13 workforce/routine unit tests; the
    e2e run below reports its own count).
12. **Screen-reader noise.** Each `BrandMark` announced "Slack icon Slack". The lesson card's failure
    state was `aria-hidden`, hiding the message from assistive tech. Two "Copy" buttons on `/connect`
    had identical names. A hex receipt hash was uppercased by the label style.
13. **Decorative pulse on static labels.** The infinite `.sticker-blue` opacity pulse (meant for a
    running work item) animated "Shipped", "Local-first", step counts and target chips.
14. **Host card grid orphan.** Five host cards at 1440px laid out 4 + 1 with the config lines cut off
    inside 300px tracks.

## Changes made

Design system (`src/design-system/`):

- `tokens.css`: `--color-cherry-pop` → accent; `--color-blush` → cherry tint; `:focus-visible` outline
  → accent; `.bottom-nav` scrolls sideways with non-shrinking items; landing nav links wrap under the
  logo on phones instead of hiding; `.host-grid` variant (3 across at desktop, 1 on phones); status
  pulse scoped to `.event-row .sticker-blue`.
- `ui-foundation.css`: hero padding uses existing tokens (`--sp-10`/`--sp-6`, phone `--sp-6`/`--sp-5`);
  `.brand-groups` layout for the labelled brand rows; lesson-card hairline uses the carbon hairline.
- `apple.css`: `.sticker-cherry` (current-step and loading chips) is wine tint, `.sticker-blue` stays
  blue; `.rail-hint` graphite for 4.5:1; opaque bottom bar; tighter nav-pill padding on phones.
- `showcase.css`: milestone rail uses colour (graphite → carbon when reached) instead of opacity.
- `shell.css`: removed the two copper `:focus-visible` overrides so the accent ring applies.
- `contract.css`: run pass/fail glyphs use the pass/fail sticker inks.

Components and pages:

- `BrandIcons.tsx`: single label map; an `aria-hidden` icon no longer carries `role="img"` or an
  `aria-label`; `BrandMark` hides its icon so only the text is announced.
- `Landing.tsx`: nav "Open Studio" and the band "Connect your agent" are quiet buttons (hero keeps the
  single primary); brand marks split into a `<dl>` with "Learns from" (YouTube) and "Delivery targets ·
  not shipped yet" (Slack, Teams, Discord, Telegram, GitHub); failure state is `role="status"`; receipt
  line reads "Proof <hash>… — recompute it yourself" without uppercase transform.
- `Connect.tsx`: Codex card is Validated with the 2026-09-01 capture note and "The IDE extension was
  not exercised"; copy buttons are named ("Copy Codex configuration", "Copy Claude Code MCP
  registration") with an `sr-only` status line; code blocks wrap instead of scrolling; `host-grid`;
  stack gap uses an existing token.
- `Compatibility.tsx`: "aperture" replaced with "tools the agent can use right now" wording; stale
  counts removed; rows are a real `<ul>/<li>` list; legend paragraph labelled.
- `Showcase.tsx`: step 5 reads "Approval is pinned to the exact revision you read. Any edit makes it
  stale."

Tests:

- `e2e/cherry/visual-qa.spec.ts` (new): the sweep described above, 6 tests (3 per viewport). It runs
  under the standard `playwright.config.ts` (`npx playwright test e2e/cherry/visual-qa.spec.ts`).

## Screenshots

After-state, produced by the sweep, in `docs/release/screenshots/final-qa/`:

- `desktop-home.png`, `mobile-home.png`
- `desktop-showcase.png`, `mobile-showcase.png`
- `desktop-connect.png`, `mobile-connect.png`
- `desktop-compatibility.png`, `mobile-compatibility.png`
- `desktop-studio-empty.png`, `mobile-studio-empty.png`, `desktop-studio-populated.png`,
  `mobile-studio-populated.png`
- `desktop-studio-sources-{empty,populated}.png`, `mobile-studio-sources-{empty,populated}.png`
- `desktop-studio-quick-{empty,populated}.png`, `mobile-studio-quick-{empty,populated}.png`
- `desktop-studio-skills-{empty,populated}.png`, `mobile-studio-skills-{empty,populated}.png`

## Commands and results

All run from `D:\project\cherry-claude-final` on 2026-09-02 after the changes above. The dev server
for the sweep ran on `127.0.0.1:4175`; the full e2e run built and previewed on `127.0.0.1:4176` via a
local mirror of `playwright.config.ts` so the shared 4173 preview was never touched.

```text
npm run typecheck      → tsc --noEmit: clean (exit 0)
npm run lint           → eslint .: clean (exit 0)
npm run test           → vitest: 42 files passed, 1 skipped · 385 tests passed, 2 skipped (exit 0)
npm run build          → tsc -b && vite build: built in 20.33s (exit 0);
                         the chunk-size warning for the lazy privy-provider chunk is pre-existing
npx playwright test e2e/cherry/visual-qa.spec.ts (dev server :4175)
                       → 6 passed, 0 failed (1.0m)
                         before the fixes the same sweep failed 6 of 6
full e2e (uncommitted mirror of playwright.config.ts on :4176, build + preview)
                       → 97 passed, 5 failed (5.9m)
                         2 failures are port-only: ingest.spec.ts hard-codes the bookmarklet origin
                         http://127.0.0.1:4173 and this run served 4176 (received string is identical
                         apart from the port)
                         3 failures reproduce identically on pristine origin/main c4a0af1 with this
                         branch's changes stashed (attribution run of the same three specs: 3 failed,
                         9 passed) and are outside this lane; see blockers 7 to 9
npm run audit:submission → 13 PASS, 0 FAIL, 0 WARN
git diff --check       → clean
```

To reproduce on the shared port, Codex can run `npx playwright test` (standard config, 4173); the two
ingest tests pass there by construction, and the three main regressions will fail until fixed.

## Console-error result

Public pages (`/`, `/showcase`, `/connect`, `/compatibility`): **0 console errors, 0 page errors, 0
failed requests** at both viewports (a media range request Chrome cancels itself on navigation is
excluded by name, `net::ERR_ABORTED`, and is not an error).

Studio routes: **0 script or page errors.** Chrome does log `Failed to load resource:
net::ERR_CONNECTION_REFUSED` for `http://127.0.0.1:47821/status` on every Studio route when no local
runner is paired (8 per empty pass, 12 per populated pass across the four routes). The sweep counts these
separately and prints them; they come from the runner client, which is outside this lane (see blockers).

## Accessibility result

- axe-core (serious + critical): **0 violations** on all 8 routes × 2 viewports × the empty and
  populated Studio states, after the fixes. Before: 7 contrast nodes on `/showcase`, 1 on
  `/studio/quick`, 2 scrollable regions on `/connect`.
- Keyboard: every tab stop reached on the four public pages and four Studio routes shows a 3px accent
  ring (`rgb(140, 29, 47)`); before, 27 stops showed blue or copper rings (13 on `/`, 14 in the Studio).
- Accessible names: no visible button or link without a name on any route.
- Heading order: each route starts at `h1` with no skipped levels.
- Horizontal overflow: 0px on every route at both viewports.
- Brand marks: decorative icons hidden; text labels carry the name.

## Truthful-capability check

- Browser-host WebMCP (ChatGPT in-app, Chrome flag) stays **Experimental** on `/connect` and
  `/compatibility`.
- Codex is **Validated** on both pages with the same capture reference; the IDE path is stated as not
  exercised.
- Brand marks are labelled as a real source (YouTube) or as targets that are not shipped.
- No page claims automatic caption download, LinkedIn scraping, cloud autonomy, automatic approval, or
  signed receipts. "Tamper-evident" appears only in the Showcase detail step and the Compatibility row.

## Remaining blockers outside this lane

Recorded, not patched:

1. **Runner probe logs console errors on every Studio route** (`src/cherry/runner-client`, out of
   lane). `GET http://127.0.0.1:47821/status` is attempted repeatedly with no pairing; Chrome reports
   each refusal in the console. A judge opening DevTools sees red. Suggested fix: probe only when a
   pairing token exists or the user is on Connections, and back off after the first refusal.
2. **Internal process language in the Sources page** (`src/pages/studio/Sources.tsx`): "A BROWSER
   EXTENSION IS NOT PART OF THIS SPRINT." reads as a team note, not product copy.
3. **"Copied!" in the shared copy button** (`src/components/Icons.tsx`, `CopyButton`): the only
   exclamation mark in UI copy; the directive bans them.
4. **Bottom navigation lists twelve sections** (`src/pages/studio/StudioLayout.tsx`). The CSS fix makes
   it scroll instead of clip, but a phone still cannot see Crew/Routines/Agent/Memory without scrolling
   the bar. A trimmed mobile list would be the real fix.
5. **Mascot palette** (`src/components/CherryMascot.tsx`): hands are sunburst yellow and mint green with
   black strokes, a leftover of the sticker-book direction; only the body colour is fixed by tokens.
6. **Blue "Shipped" / "Local-first" stickers** keep the semantic info blue by design; if the team wants
   a strictly one-accent public surface, the status class for "shipped" should move to the neutral
   sticker.
7. **e2e regression on main: `library-actions.spec.ts:17`.** Two raw-text Quick Skills are both titled
   "Pasted notes" (`src/pages/studio/QuickSkill.tsx:432`), so the test's card filter by skill name
   matches 2 cards instead of 1. Either the title should carry a distinguishing suffix or the test
   should select by id.
8. **e2e regression on main: `memory-routine.spec.ts:97`.** After seeding runs the test expects the
   "Runner paired" sticker (`src/pages/studio/Runs.tsx:86`), which never appears; most likely a
   consequence of the runner boundary change (`15de518`). Needs a product decision on what Runs shows
   without a paired runner.
9. **e2e stale copy: `t11-misc-copy.spec.ts:90`.** The test expects "Sandboxed · no network · no access
   to Cherry data", which `f36e026` (inert static previews) removed from `Artifacts.tsx`. Update the
   assertion to the new preview label.
