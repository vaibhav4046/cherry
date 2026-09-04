# Supademo interactive walkthrough — assembly kit

Everything for the walkthrough exists except the upload itself, which needs a signed-in Supademo
session in a browser. This session has the Supademo API (workspace `My Company`, Admin) but no way
to put a local file into that workspace: the upload portal is browser-only, and the browser
available here cannot attach files. That is the one genuinely blocked step.

## The one action needed

1. Open the upload portal while signed in to Supademo:
   **https://app.supademo.com/upload/JoCtLgmP8VZgd3IdzHKsLJmP**
   (job `JoCtLgmP8VZgd3IdzHKsLJmP`, expires 60 minutes after it was created — if it has lapsed,
   ask for a fresh one; creating it takes a second.)
2. Upload the nine PNGs in `docs/release/screenshots/walkthrough/`, **in filename order**. The
   names sort into the right sequence already.
3. Say so, and the demo gets built from the returned handles with the captions below.

## The steps, in order

Captured from the live deployment at https://cherry-wine.vercel.app on 2026-09-04T05:15:24.972Z, one viewport throughout
(1280x720 at 2x), zero page errors during capture.

| # | File | Route | Step caption |
| --- | --- | --- | --- |
| 1 | `docs\release\screenshots\walkthrough\01-landing.png` | / | Cherry runs supervised work on your own computer. Give it a goal; it plans, runs and checks the work, and comes back to you for the decisions. |
| 2 | `docs\release\screenshots\walkthrough\02-proof-rail.png` | / | The numbers on the page are the run’s own: two tasks, two separate work areas, 34.5 seconds in parallel, two checks passed. |
| 3 | `docs\release\screenshots\walkthrough\03-showcase.png` | /showcase | The claim, stated so you can attack it: two agents ran one job, and neither of them could publish it. |
| 4 | `docs\release\screenshots\walkthrough\04-run-steps.png` | /showcase | Every step of the run is on the record — what ran, where, and what it produced. |
| 5 | `docs\release\screenshots\walkthrough\05-approval.png` | /showcase | Publishing stops at a human decision. No agent tool can make it. |
| 6 | `docs\release\screenshots\walkthrough\06-aperture.png` | /studio/agent | Open Agent View with a WebMCP host attached: Cherry has registered eleven site tools for this page. |
| 7 | `docs\release\screenshots\walkthrough\07-tool-table.png` | /studio/agent | The aperture is state-aware. Seven tools are always on; at most five more appear, and only when the state earns them. |
| 8 | `docs\release\screenshots\walkthrough\08-registrations.png` | /studio/agent | These are the live registrations and the real call log — the closures themselves, not a description of them. |
| 9 | `docs\release\screenshots\walkthrough\09-compatibility.png` | /compatibility | Every host row says what was actually observed. ChatGPT desktop in Work mode is Validated because a real session did it. |

## Title

**Cherry — a page that hands an agent its tools, and keeps the decision**

## Why these nine

The walkthrough has to survive a judge who does not read: it opens on the claim, shows the receipt
behind it, then shows the aperture that makes the claim a WebMCP claim rather than a product claim,
and closes on the compatibility table where every row states what was actually observed. Steps 6-8
are the ones that matter for this challenge, which is why three of nine are the aperture.
