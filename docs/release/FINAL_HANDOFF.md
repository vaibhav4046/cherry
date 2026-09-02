# Cherry: final handoff

**Assembled:** 2026-09-02, London morning cycle; **amended** 2026-09-02 afternoon after the Creators engine and the judge card shipped
**Assembled by:** Claude (release manager lane)
**Signed against commit:** `e81dbc3` (afternoon amendment; the morning signature was `b6b7d11`)
**Rule this document follows:** nothing is claimed here that a commit, a gate log, a captured
session, or a live HTTP response does not show. Where work was not finished, it says so and says
what finishing it would take.

---

## 1. Sprint verification table

Status vocabulary: **VERIFIED** means Claude re-ran the gates on a clean snapshot and confirmed the
behaviour in a browser or against the live deployment. **DONE** means Codex completed and self-gated
it and the code is in the tree, without a separate Claude verification pass. **PARTIAL** means part
of the ticket shipped and the rest did not. **NOT DONE** means it was never completed.

### Sprint 1 (02_TICKETS.md)

| Ticket | What it was | Status | Commit | Evidence |
|---|---|---|---|---|
| T1 | 60-second first skill, one-paste happy path | VERIFIED | `7ff543a`, `991255b` | `/studio/quick` live; e2e `quick-skill*.spec.ts`; STATUS 2026-08-31 |
| T2 | `/ingest` route plus "Save to Cherry" bookmarklet | VERIFIED | `ca048ab` | `/ingest` live; bookmarklet section on `/connect` |
| T3 | Watch-history import, Cherry proposes and you choose | DONE | `144b587` | `/studio/sources` history import path; unit coverage in `src/cherry/sources` |
| T4 | YouTube paste polish in Sources | VERIFIED | `dd8d095` feature, `1aee0b7` CSP | oEmbed title lookup is user-triggered, 5s timeout, 16KB cap; live CSP header confirmed |
| T5 | Library to workflow in one action | DONE | `6c7fc89` | `/studio/skills` install actions |
| T6 | Plain-language sweep of studio surfaces | VERIFIED | `003853d`, verified at `1aee0b7` | Gates on clean snapshot: unit 223 (+2 skips), runner 42, e2e 65 |
| T7 | Channel watchlist via approved public RSS | DONE | `320d35f` | Paired-runner path only; no unattended cloud execution |

### Sprint 2 (08_SPRINT2_ULTIMATUM.md)

| Ticket | What it was | Status | Commit | Evidence |
|---|---|---|---|---|
| T8 | Judge is never empty-handed, real starter library | DONE | `1dd0d92` | Guided example imports a genuine exported workspace |
| T9 | Uncut recording on the site | VERIFIED | `e603c95` | `public/media/demo/golden-loop.webm`, serves live as `video/webm`, 4,000,205 bytes |
| T10 | Validate the Codex path against a live Codex host | VERIFIED | `2ab9a1a` | `docs/release/CODEX_MCP_CAPTURE.md`, codex-cli 0.151.0-alpha.7.2, captured 2026-09-01 |
| T11 | Inspection sweep, every screen against the reference bar | DONE | `e48ed8e` | 81 route/width combinations logged in STATUS 2026-09-01 15:42 |
| T12 | Performance and meta polish | VERIFIED | `76e5b14`, verified at `2660569` | Per-route titles, wine favicon, 1200x630 OG image, entry chunk 480,795 bytes |
| T13 | The 90-second judge card on `/showcase` | VERIFIED | `e81dbc3` | Dismissible card with four real steps, dismissal remembered per browser, restore link; folds the old judge script into one surface; `e2e/cherry/judge-card.spec.ts` (render, links, dismiss and restore across reloads, mobile overflow, axe, keyboard, reset leaves it alone). Fixing its axe run also made the showcase event timeline keyboard-scrollable. |
| T14 | "Add anything", one door for every ingestion path | DONE | `7f4f117` | One Add to Cherry menu reaches 7 entry points within two clicks |

### Sprint 3 (09_SPRINT3_ENDGAME.md)

| Ticket | What it was | Status | Commit | Evidence |
|---|---|---|---|---|
| T15 | Continuous 10/10 rubric loop | **PARTIAL** | none | Marked IN_PROGRESS 2026-09-01 18:37, never closed. The T11 sweep covered the same ground once; the repeating loop did not run. |
| T16 | Real-usage proof runs with screenshots | **PARTIAL** | none | Marked IN_PROGRESS, never closed. No `PROOF_LOG.md` exists. 30 tracked screenshots exist in `docs/release/screenshots/` from earlier passes. |
| T17 | Codify the harness | VERIFIED | `6c03e41` Codex lane, `163e391` owner lane | Layered AGENTS contract, `npm run gates` / `verify:all`; `docs/HARNESS.md` written and cross-linked from README |
| T18 | Contribution-ready, star-ready repository | VERIFIED | `6c03e41` Codex lane, `7b3b64a` owner lane | `CONTRIBUTING.md`, issue and PR templates, README overhaul, `docs/GOOD_FIRST_ISSUES.md` (10 scoped issues), fresh light landing capture `docs/media/cherry-landing.png` |
| T19 | Final technical report | **NOT DONE** | none | No `TECHNICAL_REPORT.md`. The material exists across `docs/HARNESS.md`, `docs/ARCHITECTURE.md`, `CHERRY_RELEASE_EVIDENCE.md` and this handoff, but was never assembled into one report. |
| T20 | Launch kit | **NOT DONE** | none | Stretch ticket, never started. |

### Sprint 4 (10_SPRINT4_BREAKER.md)

| Ticket | What it was | Status | Commit | Evidence |
|---|---|---|---|---|
| T21 | The attack catalog, run it all and log it all | DONE | `aedbd90`, `4521f92`, `45ffc17`, `15de518` | Four logged breaker rounds: upload and import hardening, workspace archive v1.1 round-trip, Quick Skill flow recovery, proof boundary fail-closed, runner boundary. Unit grew 311 to 385, runner 63 to 69. |
| T22 | Chaos battery becomes permanent e2e | **PARTIAL** | inside T21 commits | T21 left permanent regressions for every defect it found, which is most of the intent. A separately named chaos suite was never created and no `BREAKER_LOG.md` exists; the breaker record lives in STATUS.md instead. |
| T23 | The landing proves itself harder | **NOT DONE** | none | Never started. |

### Sprint 5 (11_SPRINT5_TRIBUNAL.md)

| Ticket | What it was | Status | Commit | Evidence |
|---|---|---|---|---|
| T24 | Five-persona judge tribunal to two perfect rounds | **NOT RUN** | none | No tribunal sessions were run and no `TRIBUNAL_LOG.md` exists. The honest consequence is stated in section 2. |
| T25 | This document | DONE | `b6b7d11`, amended `e81dbc3` | You are reading it. |

### Takeover (13_CLAUDE_TAKEOVER.md, afternoon)

| Ticket | What it was | Status | Commit | Evidence |
|---|---|---|---|---|
| T26 | The Creators watch engine at `/studio/creators` | VERIFIED | `84fea70` | Follow a creator, paired-runner daily feed check, deterministic skill proposals with honest readiness, human-only set-aside, Dexie v5, archive v1.2.0, `list_sources` rows (no new tool), Command Center card, inline Sources line, labelled synthetic sample creator in the starter library. Unit 406, `e2e/cherry/creators.spec.ts`, `docs/release/screenshots/creators/`, `CHERRY_RELEASE_EVIDENCE.md` creators_watch_engine, compatibility row. Built on Claude Code's snapshot after its session stopped. |
| T28 | Creators story in public copy | **PARTIAL** | `84fea70` | Landing step 01 sentence and the compatibility row shipped; the showcase "Source" chapter does not mention Creators. |
| T19 | Technical report | **NOT DONE** | none | Unchanged from the morning: the material exists across `docs/HARNESS.md`, `docs/ARCHITECTURE.md`, `CHERRY_RELEASE_EVIDENCE.md` and this document. |
| T29 | Self-loop on shipped work | **PARTIAL** | `84fea70`, `e81dbc3` | The Creators and judge-card specs each ran green twice in a row; the wider three-times loop did not run. |

---

## 2. Final tribunal scorecard

**The tribunal did not run.** There is no scorecard, and inventing one would break the single rule
this project has held to since the first day: no claim beyond what happened.

What exists in place of it, and what it is worth:

- **T11 inspection sweep (2026-09-01):** 27 routes at 3 widths each, 81 combinations, every result
  logged individually in `docs/codex-takeover/STATUS.md`. This is a real, complete UI audit by one
  reviewer, not five personas, and it ran once rather than looping to convergence.
- **Independent review passes** were run by Codex per ticket (code, UX, accessibility, security,
  adversarial) and recorded per commit in STATUS.
- **Claude verification cycles** on 2026-09-01 (two) and 2026-09-02 (one) re-ran the full gates on
  clean snapshots, did browser QA at 390px, and verified the live deployment.
- **Two false or overstated product claims were found and removed** during those cycles: the
  Diagrams component said an agent "watches the lesson with you" when Cherry is transcript-grounded,
  and the Codex install target was labelled beyond what the capture supported. Both are fixed.

A judge reading this should treat the product as audited but not tournament-hardened.

---

## 3. State of the product

**Live, verified 2026-09-02 at the time of this commit:**

| Check | Result |
|---|---|
| `https://cherry-wine.vercel.app/` | 200 |
| `https://cherry-wine.vercel.app/showcase` | 200 |
| `https://cherry-wine.vercel.app/connect` | 200 |
| `https://cherry-wine.vercel.app/compatibility` | 200 |
| `https://cherry-wine.vercel.app/studio/skills` | 200 |
| `https://cherry-wine.vercel.app/studio/creators` | 200 |
| `https://cherry-wine.vercel.app/robots.txt` | 200 |
| `https://cherry-wine.vercel.app/sitemap.xml` | 200 |
| `https://getcherry.vercel.app/` (public alias) | 200, redirects to canonical |
| `/media/demo/golden-loop.webm` | 200, `video/webm`, 4,000,205 bytes |

Deploys are made from a locally verified prebuilt output (`vercel build --prod` then
`vercel deploy --prebuilt --prod`), never from a remote build, because a remote build against a
drifted lockfile is what produced the one blank-page outage this project had.

**Repository:** `https://github.com/vaibhav4046/cherry`, MIT.

**Deploy of record:** `dpl_6jUGHVjEt4p44rsA6DVTE7WnSmtH`, prebuilt from the fresh clone with the Vercel production env; the live index chunk matches the built output byte-for-byte.

**GitHub push state:** pushed and verified. `origin/main` and local `HEAD` are both `e81dbc3`,
0 commits ahead. `https://raw.githubusercontent.com/vaibhav4046/cherry/main/docs/release/FINAL_HANDOFF.md`
returns 200 anonymously, which is only possible on a public repository, and `README.md`,
`docs/HARNESS.md`, and `docs/media/cherry-landing.png` do the same.

**Gate counts on the signed commit:**

| Gate | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | 0 errors |
| Lint | `npm run lint` | 0 errors, 0 warnings |
| Unit | `npm run test` | **406 passed**, 2 opt-in skips |
| Runner and MCP bridge | `npm run test:runner` | **69 passed**, 0 failed |
| Production build | `npm run build` | built, 0 errors |
| Bundle and receipt verification | `npm run verify:pack` | pass |
| Submission audit | `npm run audit:submission` | **0 FAIL, 0 WARN** |
| End to end (Playwright) | `npx playwright test` | **105 passed**, 0 failed, 0 flaky, desktop 1440x1024 plus Pixel 7 |
| Clean install | `npm ci` | exit 0, 996 packages |
| Dependency advisories | `npm audit --omit=dev --audit-level=high` | exit 0 (0 critical, 0 high, 10 moderate) |
| Service worker behaviour | `npm run verify:sw` | 5/5 (icon fetch never poisons the shell, redeploy reaches returning visitors, offline serves the freshest shell) |

Every row above was measured on 2026-09-02 from a fresh GitHub clone of the signed commit with no
pre-existing `node_modules`, on Linux with Node 22.22.2. The Playwright JSON report from that
exact run is committed at `docs/release/e2e-results.json`.

There is no separate "chaos" gate. Sprint 4's breaker work turned each defect it found into a
permanent unit or e2e regression inside the counts above, which is why unit went from 311 to 385
and runner from 63 to 69 during that sprint. Section 1 says so plainly rather than inventing a
chaos number.

The gate commands are in `package.json`: `npm run gates` for the fast loop, `npm run verify:all`
for everything including the full Playwright suite. `docs/HARNESS.md` explains what each layer
proves and, just as importantly, what it does not.

---

## 4. Evidence index

Everything a judge or a contributor can open and check for themselves.

| Evidence | Path | What it shows |
|---|---|---|
| Harness architecture | `docs/HARNESS.md` | The two harnesses (product harness, verification harness), layer by layer, with the precise YouTube boundary |
| Architecture | `docs/ARCHITECTURE.md` | Domain layer, WebMCP layer, runner, persistence |
| Release evidence | `docs/release/CHERRY_RELEASE_EVIDENCE.md` | Per-claim evidence with the test or capture behind it |
| Live Codex host capture | `docs/release/CODEX_MCP_CAPTURE.md` | codex-cli 0.151.0-alpha.7.2 registering and calling the Cherry MCP bridge, 2026-09-01 |
| Security audit | `docs/release/CHERRY_SECURITY_AUDIT.md` | Adversarial pass against our own claims, including the one that broke and was fixed |
| Accessibility audit | `docs/release/CHERRY_ACCESSIBILITY_AUDIT.md` | axe results and keyboard journeys |
| Dependency audit | `docs/release/DEPENDENCY_AUDIT.md` | Clean `npm ci`, `npm audit --omit=dev --audit-level=high` exit 0, narrow overrides with the boundary checked for each |
| Compatibility matrix | `docs/release/CHERRY_COMPATIBILITY_MATRIX.md` and the live `/compatibility` page | Every surface labelled Validated / Shipped / Experimental / Roadmap with the test behind the label |
| WebMCP changelog | `docs/release/WEBMCP_CHANGELOG.md` | Tool aperture history and the register/unregister contract |
| Uncut recording | `public/media/demo/golden-loop.webm` | The real loop, on the site, at `/showcase` |
| Playwright report | `docs/release/e2e-results.json` | The JSON report from the 96-test run on the signed commit |
| Screenshots | `docs/release/screenshots/` | 30 tracked captures across landing, studio, showcase, agent view, compatibility |
| Landing capture for README | `docs/media/cherry-landing.png` | Current light Cherry Wine landing, 2880x1800, captured 2026-09-02 |
| Sample bundle | `docs/release/sample-bundle.zip` and `.meta.json` | A compiled Agent Skills bundle with its standalone verify script |
| Coordination log | `docs/codex-takeover/STATUS.md` | Append-only two-agent build record: every ticket, every gate run, every bounce |
| Guardrails | `docs/codex-takeover/05_GUARDRAILS.md` | The hard lines this project refused to cross, and why |
| Starter issues | `docs/GOOD_FIRST_ISSUES.md` | 10 scoped issues for contributors |
| Contribution guide | `CONTRIBUTING.md` | Gates, lanes, claim discipline, four worked extension outlines |

**Not in the index because they were never produced:** `PROOF_LOG.md`, `BREAKER_LOG.md`,
`TRIBUNAL_LOG.md`, `TECHNICAL_REPORT.md`. Sections 1 and 2 say what stands in for each.

---

## 5. The owner's script, minute by minute

### Part A: record the video (budget 90 minutes, do this today, Wednesday 2 September)

Full narration is in `docs/release/DEMO_SCRIPT.md`. Record at 1440x900 or larger, in a normal
browser window, incognito for the fresh-user shot. Target under 3 minutes. Public YouTube, not
unlisted, because Devpost judges must be able to open it without an account.

1. **Set up (10 min).** Close every other tab. Open one incognito window at 1440x900.
   Turn off notifications. Start the screen recorder. Do a 20-second throwaway take to check audio
   levels before the real one.
2. **0:00 to 0:20, the hook.** Open `https://cherry-wine.vercel.app`. Let the hero settle.
   Read the hook line from DEMO_SCRIPT.
3. **0:20 to 0:50, guided example.** Click **Try the guided example**. Say the line about it being
   a real exported workspace, not a mock. Point at the **untrusted** labels in the evidence ledger.
4. **0:50 to 1:25, honest failure.** Walk to the SkillGraph step, then artifacts, then Proof.
   Open **failures and repairs** on the receipt. Click **Recompute hashes**. This is the
   credibility peak. Do not cut it.
5. **1:25 to 1:55, Agent View.** Show the aperture table and the call log. If you are in a normal
   browser it will say manual mode and nothing registered, and you should say that out loud. That
   honesty is the point.
6. **1:55 to 2:15, Creators.** Open `/studio/creators` with the sample library loaded. Point at the
   followed creator (SAMPLE DATA), the **Needs transcript** row and the **Ready to draft** row.
   Say the Creators lines from DEMO_SCRIPT: the runner checks the public feed daily, Cherry never
   downloads the video, you add the transcript, you approve.
7. **2:15 to 2:40, take it anywhere.** `/studio/skills`, point at the install-ready sticker and the
   approval hash chip, open a skill, show **Download SKILL.md**, **Copy AGENTS.md (Codex)**,
   **Compile skill bundle**. Flash `/connect` and its `config.toml` block.
8. **2:40 to 2:55, close.** Back to landing, the "Teach once. Every agent gets better." band.
9. **Three don'ts** (from DEMO_SCRIPT): do not claim live ChatGPT attachment, do not call receipts
   "signed" (they are tamper-evident hashes), do not trim the failed-verification beat.
10. **Upload (20 min).** YouTube, public, title `Cherry: teach a workflow once, every agent gets
   better`, description = the "Judging-criteria cheat sheet" block from
   `docs/release/DEVPOST_SUBMISSION.md` plus the live URL and the repo URL. Copy the watch link.

### Part B: the Devpost form (budget 45 minutes, do this today straight after Part A)

Open `https://webmcp.devpost.com/`, start the submission, and paste each field from
`docs/release/DEVPOST_SUBMISSION.md`. That file is written in Devpost's own field order:

| Devpost field | Source in DEVPOST_SUBMISSION.md |
|---|---|
| Project name | "Project name" |
| Elevator pitch / tagline | "Tagline" |
| Try it out links | "Links" (live app, judge route, repository) |
| Video demo link | The YouTube watch link from Part A step 9 |
| Inspiration | "Inspiration" |
| What it does | "What it does" |
| How we built it | "How we built it" |
| Challenges we ran into | "Challenges" |
| Accomplishments | "Accomplishments" |
| What's next | "What's next" |
| Built with (tags) | "Built with" |
| Image / thumbnail | `docs/media/cherry-landing.png` |

### Part C: the 15-minute pre-submit checklist (immediately before you press submit)

- [ ] `https://github.com/vaibhav4046/cherry` opens in a private window, is public, and the README
      renders with the landing image
- [ ] `https://cherry-wine.vercel.app` loads in a fresh incognito window with no console errors
- [ ] `https://getcherry.vercel.app` loads and reaches the same app
- [ ] `/showcase` loads and the recording plays
- [ ] The YouTube link plays in a private window with no sign-in prompt
- [ ] Every Devpost field is filled, no placeholder text like "(add after recording)" remains
- [ ] The repository link in the Devpost form matches the repo that is actually public
- [ ] Press submit, then reopen the submission page and confirm it shows as submitted

**Hard deadline: Thursday 3 September 2026, 21:00 London (13:00 PT).** Today is Wednesday
2 September, so submitting today leaves a full day of buffer. Do not spend that buffer on polish.
A submitted entry that is 90 percent polished beats a perfect one that missed the form.

---

## 6. Anything left, honestly

| Item | State | What finishing it takes |
|---|---|---|
| **GitHub push** | **Resolved.** Pushed to `origin/main` at `b6b7d11` and verified public. | Nothing. This was the last blocking item and it is closed. |
| T19, the technical report | Not assembled. | The content exists in `docs/HARNESS.md`, `docs/ARCHITECTURE.md`, `CHERRY_RELEASE_EVIDENCE.md` and this handoff. Devpost does not ask for a separate report, so this is a post-submission tidy. |
| T20 launch kit, T23 landing self-demo | Not started. | Both are post-submission polish. |
| Claude Code takeover session | Stopped at 10:54 London with T26 uncommitted; its work was snapshotted and finished by Claude Cowork. | Nothing. The worktree `D:\project\cherry-claude-takeover` and branch `claude/takeover` can be deleted after the hackathon. |
| `.gitattributes` line-ending normalisation | Deferred. | Nine tracked files carry CRLF; normalising them mid-flight would have conflicted with the takeover branch. Add `* text=auto eol=lf` after submission and renormalise in one commit, keeping the hash-verified example archives byte-identical. |
| T24 tribunal | Not run. | Section 2 is the honest replacement. |
| Live ChatGPT in-app browser capture | Not captured. | Requires access to a WebMCP-enabled host. The compatibility page labels this Experimental and says so plainly, which is the correct state, not a gap to paper over. |
| Secret rotation | Pending. | The Privy app secret and the Vercel token were shared in a chat during the build. The Privy app secret was never used and is not in the repo or the client bundle; the Vercel token was used only to set `VITE_PRIVY_APP_ID` and to deploy. **Rotate both after the hackathon**, in the Privy dashboard and in Vercel account settings. |

---

## Sign-off

Cherry does what its landing page says: a lesson becomes evidence, evidence becomes a versioned
skill, a human approves an exact revision, artifacts are built and verified with real failures kept
in the record, and the result is served to any agent that visits over WebMCP or installs over MCP
and Agent Skills. The gates in section 3 back that. The gaps in sections 1, 2 and 6 are named
rather than hidden, which is the same discipline the product applies to its own claims.

Signed in the release manager lane, 2026-09-02.
