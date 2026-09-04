# Cherry demo video: shooting script

> **The shipped cut runs 2:26 (145.8 s)** — `public/media/demo/cherry-demo-final.mp4`, with
> `cherry-demo-final.srt` (20 cues, none running past the end of the video). The per-beat timings
> below are the **planning budget** that cut was shot against; the finished edit came in tighter
> than the budget. Where this file and the shipped video disagree on a timestamp, the video is the
> truth, and `DEVPOST_SUBMISSION.md` quotes the video's 2:26.

Hard limit: the OpenAI WebMCP Challenge requires **under 3:00**, and judges are not required to
watch past 3:00. This script was budgeted to land at **2:40** so titles, a top card and an export
fade still fit under the wire.

Everything here is shootable today, on this machine, in an ordinary browser, with no live WebMCP
host, no dev server dependency and no live Codex run. Record at 1440x900 or larger against
https://cherry-wine.vercel.app.

## The arithmetic

| Quantity | Value |
| --- | --- |
| Total spoken words | **341** |
| Narration rate assumed | 150 wpm |
| Narration duration | 341 / 150 = 2.2733 min = **136.4 s** |
| Total runtime budget | 2:40 = **160.0 s** |
| Slack left for clicks, page loads and transitions | 160.0 - 136.4 = **23.6 s** |

The previous script was about 472 words, which is 3:09 of narration alone before a single click. It
did not fit. This one fits, with 26.4 seconds of deliberate dead air distributed across the beats.

## Beat table

Speech s = words x 0.4. Action slack = the seconds inside the beat with no words over them; that is
where the clicking, scrolling and page loads happen.

| # | Timecode | On screen | Exact words to say | Words | Speech s | Action slack s |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0:00 - 0:18 | Landing at `/`. Hero, then a slow scroll toward `02 / PARALLEL WORK`. | "Every agent you pay for is capable, and none of them share your tools, your memory, or your judgement. And when an agent says a job is done, that is a claim, not a fact. This is Cherry." | 38 | 15.2 | 2.8 |
| 2 | 0:18 - 0:46 | `/studio/control` with the outcome **already typed**. Click **Plan the mission**. The plan renders. | "I give Cherry an outcome. It returns a bounded plan: tasks with dependencies, a definition of done, and a real check on every one. That is why this use case fits WebMCP. Planning work is a page with live state, and a visiting agent should drive that state through the site's own tools instead of guessing at buttons." | 58 | 23.2 | 4.8 |
| 3 | 0:46 - 1:10 | Mission detail. Hover the human-decision node, then click **Approve plan r1**. Hold on the confirmation. | "Here is the gate. Site tools let an agent create a mission, plan it, start it, cancel it, and request a decision. None of them can approve. That is the better experience: I stop typing prompts and start reading decisions, and every agent call lands in a log I can read." | 51 | 20.4 | 3.6 |
| 4 | 1:10 - 1:34 | `/studio/agent`. Show the **Manual mode, no agent host** sticker. Open the disclosure, paste the stand-in host into the console, reload. The sticker flips and the aperture fills. Run `cherryTools()`. | "How it is implemented: the page calls document.modelContext.registerTool, and it registers nothing until a host exists. Watch. That is a stand-in host, not a real one, and the page still says the live row is Experimental. But those registrations are real, and so are the seven always-on tools plus at most five for the surface you are on." | 57 | 22.8 | 1.2 |
| 5 | 1:34 - 2:02 | `/showcase`. Scroll to `02 / Parallel work`, hold on the 34,513 ms overlap and the two worktree cards, then `03 / Verification` and its checks. | "This is a real Codex run, committed to the repository and replayed here from evidence checked against its fingerprint. Two agents, thirty-four and a half seconds of measured overlap, each in its own git worktree. The boundary is a worktree process, never a virtual machine. Completion came from the host. Success came from the runner's own checks." | 57 | 22.8 | 5.2 |
| 6 | 2:02 - 2:26 | `/studio/skills` with the sample library loaded. Open one skill. Hold on **Download SKILL.md** and **Copy AGENTS.md (Codex)**. | "Most agent-ready sites let an agent operate them. Cherry's site upgrades the agent. recommend_skills hands a visiting agent my approved methods, pinned to the revision I read, with a hash it verifies. People and agents could not build one library together before. Now they can, and only I approve what enters it." | 52 | 20.8 | 3.2 |
| 7 | 2:26 - 2:40 | `/studio/proof`, click **Recompute hashes**, then cut to `/compatibility` and hold on the Experimental row for a live host. | "Every claim is labelled by the test or capture behind it. A live browser host is still Experimental, and we say so. No API key. MIT licensed. Cherry." | 28 | 11.2 | 2.8 |
| | | | **Total** | **334** | **133.6** | **26.4** |

## Per-beat action budget and fallbacks

### Beat 1, 0:00 - 0:18 (2.8 s of action slack)

Action: 1.5 s of hero hold before the first word, 1.3 s of slow scroll under the last sentence.

**FALLBACK:** if the recorded-run panel in the hero has not finished loading its fixture, do not
wait for it. Stay on the headline and the two buttons; the same numbers appear in beat 5.

### Beat 2, 0:18 - 0:46 (4.8 s of action slack)

Action: 2.0 s from clicking **Plan the mission** to the plan rendering, 2.8 s holding the plan. The
outcome is pre-typed before the take, so no typing time is budgeted.

**FALLBACK:** if planning errors or stalls, open a mission planned before the take from the mission
list and say the same words over it. Nothing in the narration claims the plan was made in this shot.

### Beat 3, 0:46 - 1:10 (3.6 s of action slack)

Action: 1.6 s hovering the human-decision node, 2.0 s from clicking **Approve plan r1** to the
confirmation line.

**FALLBACK:** if no plan-level approve control is visible, hold on any node's **Approve this exact
plan** button instead. Do not click **Start**: there is no runner in this take, and the narration
never says there is.

### Beat 4, 1:10 - 1:34 (4.0 s of action slack)

Action: 2.0 s of route change and settle, 2.0 s of scroll to the aperture table.

**FALLBACK:** if the console paste or the reload misbehaves, do not fight it. Say instead: "This
browser has no WebMCP host, so nothing is registered, and the page says so," hold on the aperture
table, and move on - that is the original beat and it still lands.

**Do not overclaim here.** The stand-in host proves the registrations and the closures are real. It
is not a proprietary WebMCP client. Say "stand-in" out loud. Never switch to a browser that claims
a real host you have not verified.

### Beat 5, 1:34 - 2:02 (5.2 s of action slack)

Action: 2.4 s of scroll into `02 / Parallel work`, 2.8 s of scroll into `03 / Verification`.

**FALLBACK:** if the page shows "Recorded evidence unavailable", hard-refresh once. If it still
fails, cut to `/compatibility` and say the same words over the Validated row for the mission
surface, changing "replayed here" to "recorded in the repository".

### Beat 6, 2:02 - 2:26 (3.2 s of action slack)

Action: 1.4 s to open the skill, 1.8 s holding the two export controls.

**FALLBACK:** the export controls are disabled unless the skill is approved at its current revision.
If they are greyed out, do not click them. Cut to `/studio/agent` and hold on `recommend_skills`,
`get_skill` and `list_skills` in the Global row. The words still fit exactly.

### Beat 7, 2:26 - 2:40 (2.8 s of action slack)

Action: 1.4 s from clicking **Recompute hashes** to the verdict, 1.4 s on the compatibility row.

**FALLBACK:** if no receipt exists in the current space, skip the Proof click and open
`/compatibility` at the start of the beat. The narration does not name the Proof page.

## Devpost description coverage

The description is judged alongside the video, so all four required points are spoken in the audio,
not only written on the form:

| Requirement | Where it is said |
| --- | --- |
| Why this use case fits WebMCP | Beat 2: "Planning work is a page with live state, and a visiting agent should drive that state through the site's own tools instead of guessing at buttons." |
| How it makes a better user experience | Beat 3: "I stop typing prompts and start reading decisions, and every agent call lands in a log I can read." |
| What people and agents can now do together that was hard before | Beat 6: "People and agents could not build one library together before. Now they can, and only I approve what enters it." |
| How WebMCP was implemented | Beat 4: `document.modelContext.registerTool`, seven always-on tools, at most five per surface, registered and retired as state changes. |

## One-take shooting order

Do all of this **before** hitting record. Every item removes a cold start from a beat.

**Pre-open, in this tab order, all fully loaded:**

1. `https://cherry-wine.vercel.app/` scrolled to the top.
2. `https://cherry-wine.vercel.app/studio/control`.
3. `https://cherry-wine.vercel.app/studio/agent`.
4. `https://cherry-wine.vercel.app/showcase`, scrolled once to the bottom and back to the top so the
   recorded-mission fixture and every image are warm in cache.
5. `https://cherry-wine.vercel.app/studio/skills`.
6. `https://cherry-wine.vercel.app/studio/proof`.
7. `https://cherry-wine.vercel.app/compatibility`.

**Pre-type and pre-warm:**

- Paste the outcome into the Mission Control **Outcome** box and leave it unsubmitted: "Fix the
  highest-impact onboarding defect in Orbit Runner and prepare the release notes. Nothing public
  without my approval."
- Open **Execution settings** once, put "Nothing public without approval." in Constraints so beat 3
  has a human-decision node to hover, then collapse it again.
- From `/showcase`, click **Load sample library** once. It navigates to
  `/studio/skills?sample=loaded`. Open the skill you intend to show and confirm **Download
  SKILL.md** is enabled, then navigate back.
- Plan one throwaway mission before the take so `/studio/proof` has at least one receipt.
- Confirm `/studio/agent` reads **Manual mode, no agent host**. That is the honest state, and the
  narration is written to it.

**Recording hygiene:**

- Hide the bookmarks bar, notifications and any second monitor.
- Zoom at 100 percent, one browser window, no devtools.
- Record picture and voice separately if you can; the beat table assumes narration is laid over a
  clean screen capture rather than performed live.
- Subtitles: `docs/release/DEMO_SUBTITLES.srt` is cut to these exact timecodes. If you shift a beat,
  shift its cues by the same amount.

## Do not say

Cloud VM or container (it is a worktree-process boundary). Signed receipts (they are tamper-evident
hashes). Runs 24/7 (it runs while your paired runner is online). Connected to LinkedIn. Watches
videos. Replaces any named product. "Works in ChatGPT", "the tools are registered", or anything
implying a live WebMCP host session, because none was captured. AAA anything.

## Do say

Runs while your paired runner is online. Uses your Codex sign-in and available Codex usage.
Worktree-process boundary. Tamper-evident hashes. Experimental where the compatibility page says
experimental.
