# Ticket queue — execute top to bottom

Every ticket ships with unit coverage for new domain logic and at least the named e2e assertion.
"AC" = acceptance criteria, all must hold. Files listed are the expected surface; touching others
is fine inside your lane, but never the design system, landing, showcase, or connect pages.

---

## T1 · P0 — The 60-second first skill (one-paste happy path)

The single highest-value change in the sprint. A brand-new user must go from the landing CTA to
an approved skill in under a minute without learning any nouns.

Build `/studio/quick` into the true front door (it already hosts Quick Skill; extend it, don't
fork it):

- One screen, one field: "Paste a YouTube link, an article link, or raw text." One primary button.
- On submit, Cherry silently creates whatever scaffolding it needs (workspace "My skills" if none,
  mission, lesson, source record with provenance) — the user never sees those words during the
  flow.
- Immediately present the transcript step as three plain choices with zero jargon:
  1. "Paste the transcript or captions" (textarea, accepts .srt/.vtt paste),
  2. "Transcribe while I play it" (wires the existing local Whisper tab-capture path),
  3. "My runner can fetch this page" (articles only, existing runner fetch; hidden when no
     runner is paired).
- Then: draft the skill (existing quick-skill generator), show the readable method, one approval
  card ("Approve this exact version"), done-screen with three actions: "See it in your Library",
  "Send to an agent" (→ /connect), "Teach another".
- Reuse existing services only (`quick-skill.ts`, `source-service`, `lesson-service`,
  `skillgraph-service`). No new domain concepts.

AC:
- Fresh browser → landing → CTA → paste text source → approve → skill visible install-ready in
  `/studio/skills`, in ≤ 5 clicks after the paste (count them in the e2e).
- Paste a YouTube URL → embed appears with the three transcript choices; paste-transcript path
  completes to approval.
- e2e: extend `e2e/cherry/upgrade.spec.ts` (quick-skill section) or add
  `e2e/cherry/first-skill.spec.ts` proving the click budget and the library landing.
- Landing "Try the guided example" and existing flows unbroken (full e2e suite green).

## T2 · P0 — `/ingest` route + "Save to Cherry" bookmarklet

The compliant version of "a bubble where I tab in a link".

- Route `/ingest?url=<encoded>&title=<encoded>` (also accept `text=`): requires no setup; it
  prefills the Sources "Save a source" form (kind auto-detected: youtube.com/youtu.be → youtube,
  else article) and highlights the one field left to confirm. If the app is fresh, scaffold
  silently as in T1.
- Bookmarklet generator on `/studio/sources` (and referenced from `/connect`): a draggable
  bookmark link whose href is a `javascript:` one-liner that opens
  `https://cherry-wine.vercel.app/ingest?url=' + encodeURIComponent(location.href) + '&title=' +
  encodeURIComponent(document.title)` in a new tab. Show the same for localhost dev. Label it
  honestly: "Works on any page you're viewing. Cherry only receives the address and title you
  send it."
- No browser extension in this sprint (store review can't land by Wednesday) — say exactly that
  in a quiet line so the roadmap is honest.

AC:
- e2e: visiting `/ingest?url=https%3A%2F%2Fexample.com%2Fpost&title=Example` lands in the
  prefilled form; saving creates the source with correct provenance URL.
- Bookmarklet href is exactly the documented one-liner (unit test the generator function).
- CSP unchanged.

## T3 · P0 — Watch-history import: "Cherry proposes, you choose"

The honest version of "AI sees your history and decides where skills form". Google Takeout gives
users their own `watch-history.json`; Cherry reads it locally.

- In `/studio/sources`: "Import your YouTube history" → file input accepting the Takeout
  watch-history JSON (and a pasted list of URLs as a fallback). Parsing is 100% client-side;
  nothing uploads anywhere (say so in the UI).
- Produce ranked **skill candidates**: group by channel and by recurring title keywords
  (deterministic scoring: channel frequency, recency, keyword clusters ≥3 occurrences). Show top
  10 with "why" (e.g. "14 videos from this channel in 90 days").
- Each candidate: one click → becomes a saved source draft (youtube kind, provenance
  `takeout-import`) ready for the T1 transcript step.
- Include a small anonymized fixture file for tests (`tests/fixtures/watch-history.sample.json`)
  — invent the data, don't copy anyone's real history.

AC:
- Unit: parser handles Takeout shape + malformed rows without throwing; ranking is deterministic.
- e2e: upload fixture → candidates render with reasons → clicking one creates the source draft.
- Zero network calls during import (assert no new connect-src needs).

## T4 · P1 — YouTube paste polish in Sources

- Pasting a YouTube URL into "Save a source" auto-fills title via the oEmbed endpoint **only when
  the user clicks "Fetch title"** (youtube.com/oembed is a public metadata endpoint; add it to
  CSP connect-src in the same commit, one origin only: `https://www.youtube.com`).
- "Needs transcript" state shows the same three plain transcript choices as T1 (shared component).

AC: unit for URL→videoId parsing edge cases; e2e for the needs-transcript state; CSP diff is
exactly one origin.

## T5 · P1 — Library → workflow in one action

- On each install-ready Library card and the skill detail: "Use in a routine" (prefilled routine
  draft bound to the approved revision, existing flow) and "Send to an agent" (→ `/connect`
  anchored to the right host card).
- On the done-screen of T1, same two actions.

AC: e2e from library card → routine draft form prefilled with that skill; no approval shortcuts.

## T6 · P1 — Plain-language sweep of studio surfaces

Apply `04_COPY_GUIDE.md` to: Sources, Quick Skill/T1 flow, Skills/Library labels, Routines,
Command Center empty states, Onboarding. UI labels only — never rename code identifiers, tool
names, or docs of record. Keep precise terms where the audience is judges (Compatibility page is
Claude's lane; leave it).

AC: no studio screen a first-time user hits during T1/T2/T3 contains: SkillGraph, aperture,
provenance, artifact set, actor, revision binding (plain equivalents from the guide). e2e text
assertions updated in the same commit.

## T7 · Stretch — Channel watchlist via public RSS (the honest "watcher")

Only start after T1–T6 are DONE and green.

- "Watch this channel" from any youtube source: stores channel id in a watchlist.
- "Check now" (and a runner-scheduled routine when paired): the **local runner** fetches the
  channel's public feed `https://www.youtube.com/feeds/videos.xml?channel_id=<id>` (RSS is a
  published syndication feed; static fetch, no scraping, no login). New entries appear as source
  drafts labeled `rss-watch`, needing the normal transcript step. Fail closed like every fetch.
- Runner test with a local RSS fixture; no browser-side fetch of youtube.com feeds (CSP stays).

AC: runner test proves fixture→drafts; UI shows last-checked honestly; unpaired state says
"pair the local runner to check channels" and nothing else happens.

---

Order: T1 → T2 → T3 → T4 → T5 → T6 → T7. Push after each DONE. If any ticket threatens a
non-negotiable, stop and write the conflict into STATUS instead of improvising.
