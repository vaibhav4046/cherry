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

## D-011 — Quick Skill pipeline is deterministic derivation, not AI

- **Decision:** "Paste a YouTube link → get a skill" ships as: official player + user-pasted
  transcript (YouTube's own Show-transcript copy formats are parsed natively) → deterministic
  imperative-sentence derivation into steps/principles → per-step transcript evidence (untrusted,
  timestamped) → drafted graph → human review with per-step keep/drop → exact-revision approval →
  verification → receipt → downloadable bundle. One screen, ~4 clicks, zero credentials.
- **Reason:** Caption scraping violates YouTube ToS and the product contract; a model call violates
  the zero-dollar core. Deterministic structure extraction that the human owns is the honest maximum
  — and it is genuinely fast.
- **Consequence:** The wizard labels the derivation "deterministic rules — not a model". Evidence
  provenance and trust semantics are identical to the manual flow (unit-proven).

## D-012 — Live Claude Code host validation (2026-08-29)

- **What actually happened:** (1) A Cherry-compiled bundle (semantic-hero-section… workflow, produced
  by the Quick Skill pipeline from a pasted transcript) was unzipped into a real Claude Code host's
  `~/.claude/skills/`; the host discovered it and listed it as an available skill in a live session.
  Its standalone `scripts/verify.mjs` passed all 22 file hashes + the receipt hash beforehand.
  (2) The native MCP bridge was registered in the same host via
  `claude mcp add cherry-wine -- node runner/mcp/server.mjs --workspace <export>`;
  `claude mcp list` reported **✔ Connected**.
- **Consequence:** /compatibility upgrades "Claude Code skill install" and the bridge row to
  Validated (live host). ChatGPT/Codex browser hosts remain honestly Experimental — no such client
  was available on this machine.

## D-013 — "AI does everything" ships as the Autopilot brief, not an API key

- **Decision:** NotebookLM-style autonomy is delivered through the user's OWN ChatGPT/Claude
  subscription attached over WebMCP: a copyable Autopilot brief on the Agent View instructs the
  attached agent to drive the entire loop (create → load lesson → watch the embedded player with the
  host's browser vision at 1.5–3x → record visual/spoken observations → import_transcript (append
  for multi-source) → generate_quick_skill auto-named → request approval → stop for the human →
  verify → receipt → bundle). New tools import_transcript and generate_quick_skill were added to the
  learning aperture (still ≤ 5 + 2); load_lesson now advances DRAFT→LEARNING like the UI.
- **Reason:** Zero-dollar core forbids API keys; WebMCP makes the user's existing subscription the
  brain. Approval, trust, and memory promotion remain human-only.

## D-014 — Third global tool: introduce_agent
The Workforce spec keeps exactly two global reads. Cherry ships a third global, `introduce_agent`
(write: names the attached session). Rationale: the owner explicitly requested auto-assigned,
chat-nameable agents; the tool grants no authority and the aperture tests cap globals at 3.
Deviation recorded per autonomy policy.

## D-015 — Surface-selected apertures
WebMCP tools are selected by (route surface, product state): /studio/inbox|/studio/work → inbox set,
/studio/crew → crew set, /studio/runs → run set, otherwise the mission-state table. Each surface set
is capped at five tools; the registration manager re-registers (and reports retired tools) on both
surface and state changes.

## D-016 — Success is earned
`transitionWorkItem` refuses SUCCEEDED for actorType 'agent' (approval_required). Verification-linked
success enforcement for runner-backed runs lands with Runner v2 integration; until then the human or
system verifier records the outcome, matching manual-mode parity.

## D-017 — Editorial asset pack integration (2026-08-30)

The Cherry Claude god-mode pack shipped editorial plates, a transparent seal mark, an OG plate,
and three linked 8-second 16:9 brand clips (lesson-seed → proof-approval → carry-forward).
Integration decisions:

- The three linked clips replace the previous Teach/Prove/Carry chapter clips on the landing page
  (thematically exact match; 1280×720, same `clip-card` 16:9 frame). The replaced files
  (`split-reveal.mp4`, `proof-seal.mp4`, `carry-case.mp4`) were grep-proven unused and removed.
- Every landing clip now has a first-frame poster (extracted with ffmpeg, WebP 15–67 KB):
  instant paint before video load, and `ClipVideo` now renders the static poster under
  `prefers-reduced-motion` instead of nothing (no blank narrative slots with motion disabled).
- Opaque editorial plates ship as AVIF + WebP only (no 2.5 MB PNG masters in the deploy);
  WebP support is universal in the supported-browser set. The transparent
  `cherry-seal-mark` keeps WebP + PNG (alpha preserved, per pack instruction) and appears as a
  small decorative ornament (alt="") in the Trust section.
- `public/og.jpg` (1200×630, 88 KB) generated from the pack's `cherry-og-social` master replaces
  `og.png` in the OG/Twitter meta; `og.png` stays on disk so previously scraped links keep working.
- Assets live under `public/media/cherry-editorial/` with the pack's manifest JSON copied verbatim.
  Copy, claims, and labels remain live DOM — nothing was baked into media.

## D-018 — verify:pack made real (2026-08-30)

`package.json` wired `verify:pack` to `scripts/verify-release.mjs`, but the script never existed
in any commit. It now exists: it hash-checks `docs/release/sample-bundle.zip` against its meta,
extracts with a path-traversal guard, runs the bundle's embedded standalone verifier, and proves
tamper-evidence (one-byte mutation must fail; deleted evidence file must fail). The gate passes
6/6; a release claim about bundle verification is now backed by a runnable command.

## D-019 — Optional Privy auth behind a provider-neutral boundary (supersedes D-008)

- **Decision:** Cherry supports Privy email-OTP sign-in via a provider-neutral `AuthBoundary`.
  Guest mode stays the default and fully functional; auth activates only when
  `VITE_PRIVY_APP_ID` is set at build time.
- **Reason:** The product owner now requires account support, and D-008's objections are
  neutralised: the SDK ships in a lazy chunk never requested in guest mode (entry grew ~1.7 kB
  gzip), there is no login wall (sign-in is one optional card on Connections), and zero-config
  deploys behave exactly as before. Privy failing to load degrades to a "setup required" notice,
  never a broken app.
- **Consequence:** New workspaces can key off `authScopeKey()` ('guest' or 'privy:<userId>');
  existing guest data stays local until exported/imported — no silent migration, no fake sync.
  Setup lives in docs/PRIVY_SETUP.md; `PRIVY_APP_SECRET` remains server-only and unused by the
  client.

## D-020 — Canonical origin (2026-08-31)

`https://cherry-wine.vercel.app` is the canonical production origin: it is what the README,
Devpost draft, OG tags, PRIVY_SETUP origins, and receipts documentation use. The Vercel project
also answers on `getcherry.vercel.app`; that alias should be removed or redirected in the Vercel
dashboard (owner action — dashboard/DNS changes are outside this environment's autonomy contract).
No document may introduce the duplicate origin.

## D-021 — Fresh-journey WebMCP repair (2026-08-31)

Three real gaps in the agent-driven fresh journey were found and fixed: (1) tool mutations never
resynchronised the app shell, so an agent-created workspace/mission did not advance the aperture
until a human clicked — every successful mutating tool now triggers a shared refresh, and
create/start tools atomically switch the active selection; (2) `load_lesson` was unreachable in
the onboarding aperture, deadlocking the journey after `create_mission`; (3) `generate_quick_skill`
did not link the drafted graph to the mission on the agent path. Two tools were added —
`get_cherry_status` (4th global read) and `start_apprenticeship` (empty/onboarding) — and the
whole path is pinned by a registered-closure Playwright journey (`e2e/cherry/showcase-host.spec.ts`)
that never touches `executeLocal`.
