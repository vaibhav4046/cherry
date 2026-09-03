# Cherry: final handoff

**Assembled:** 2026-09-02, London morning cycle; **amended** 2026-09-02 afternoon after the Creators engine and the judge card shipped; **amended again** 2026-09-03 at 02:00 London after God Mode v2 and the Winner OS lanes went live
**Assembled by:** Claude (release manager lane)
**Signed against commit:** `9d906b5` (morning amendment after the landing lane and the red team; earlier signatures were `b6b7d11`, `e81dbc3`, `deb6c0c` and `48f82e7`)
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
| T16 | Real-usage proof runs with screenshots | **PARTIAL** | none | Marked IN_PROGRESS, never closed. No `PROOF_LOG.md` exists. 81 tracked captures exist in `docs/release/screenshots/` (`git ls-files docs/release/screenshots | wc -l`). |
| T17 | Codify the harness | VERIFIED | `6c03e41` Codex lane, `163e391` owner lane | Layered AGENTS contract, `npm run gates` / `verify:all`; `docs/HARNESS.md` written and cross-linked from README |
| T18 | Contribution-ready, star-ready repository | VERIFIED | `6c03e41` Codex lane, `7b3b64a` owner lane | `CONTRIBUTING.md`, issue and PR templates, README overhaul, `docs/GOOD_FIRST_ISSUES.md` (10 scoped issues), fresh light landing capture `docs/media/cherry-landing.png` |
| T19 | Final technical report | DONE (afternoon) | follow-up to `c8e2181` | `docs/release/TECHNICAL_REPORT.md`, assembled in the afternoon amendment from existing evidence. Was NOT DONE at the morning signature. |
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
| T24 | Five-persona judge tribunal to two perfect rounds | **PARTIAL** (three personas, one round, 2026-09-03) | `6efe318`, `e1ebfdf`, `87ec293`, `48f82e7` | Three independent reviewer sessions (WebMCP judge, first-time user and product judge, claims auditor) reviewed the production build read-only; 30 findings were fixed test-first the same night and re-verified from a fresh clone, the rest are listed as deferred with reasons. `docs/release/TRIBUNAL_LOG.md` holds the scores and the ledger. Two personas and the second round did not run. |
| T25 | This document | DONE | `b6b7d11`, amended `e81dbc3` | You are reading it. |

### Takeover (13_CLAUDE_TAKEOVER.md, afternoon)

| Ticket | What it was | Status | Commit | Evidence |
|---|---|---|---|---|
| T26 | The Creators watch engine at `/studio/creators` | VERIFIED | `84fea70` | Follow a creator, paired-runner daily feed check, deterministic skill proposals with honest readiness, human-only set-aside, Dexie v5, archive v1.2.0, `list_sources` rows (no new tool), Command Center card, inline Sources line, labelled synthetic sample creator in the starter library. Unit 406, `e2e/cherry/creators.spec.ts`, `docs/release/screenshots/creators/`, `CHERRY_RELEASE_EVIDENCE.md` creators_watch_engine, compatibility row. Built on Claude Code's snapshot after its session stopped. |
| T28 | Creators story in public copy | **PARTIAL** | `84fea70` | Landing step 01 sentence and the compatibility row shipped; the showcase "Source" chapter does not mention Creators. |
| T19 | Technical report | DONE | follow-up to `c8e2181` | `docs/release/TECHNICAL_REPORT.md`: architecture, engine, WebMCP surface, serving paths, security boundaries, harness and gate counts, what is not proven, evidence index. Assembled from existing evidence; under 200 lines. |
| T29 | Self-loop on shipped work | **PARTIAL** | `84fea70`, `e81dbc3` | The Creators and judge-card specs each ran green twice in a row; the wider three-times loop did not run. |

### God Mode v2 and the Winner OS lanes (2026-09-02 evening to 2026-09-03 night)

| Work | Status | Commit | Evidence |
|---|---|---|---|
| God Mode v2: Mission Control, validated mission graphs, policy-bound execution, runner mission executor with per-task sandboxes, agent hosts, real Codex CLI capture | VERIFIED | `6b850ae` merge of `b7a3e75`, fixes `8ba8afb` | Verified from a fresh Linux clone before merge; two Windows-hidden portability defects fixed (fixture pipe flush, 11 px overflow). `docs/release/GOD_MODE_REAL_HOST_CAPTURE.md`, `docs/release/benchmarks/god-mode-hosts.json`, `e2e/cherry/god-mode-mission.spec.ts` (browser to real runner). |
| W1 Chronicle assets (Sol lane) | VERIFIED | `fb3d13e`, integrated as `144fe1e..` | `public/media/cherry-chronicle/`, `tests/assets/cherry-chronicle-assets.test.mjs` |
| W3 evidence-first showcase and digest-pinned replay (Sol lane) | VERIFIED, one fix | `7f00e16`; fix `a9887e6` (rebased) | `/showcase` opens on the recorded Codex run; replay pinned to `replaySha256 edd88812…` (was `bd68e563…` before the 2026-09-03 evidence redaction); the lane pinned a CRLF digest that failed on Linux, fixed by normalising line endings before hashing. `e2e/cherry/final-winner-showcase.spec.ts`, `tests/cherry/showcase-winner.test.tsx`. |
| W4 Mission Control first run (Sol lane) | VERIFIED, one fix | `7ced434`; fix `b6bd8ab` | No space wall; the first plan creates the space. The lane's live-start gate could never render for a real runner (it demanded the runner-native `verification` capability from a host); the gate now considers agent nodes only, mirroring the mission service. `e2e/cherry/final-winner-control.spec.ts`, `tests/cherry/mission-control-first-run.test.tsx`. |
| W2 six-chapter landing (Sol lane) | VERIFIED | `57f3d48` and follow-ups, rebased onto main as `875c20b..04b87e4` | The landing leads with the digest-pinned recorded Codex run and fails closed when that evidence is missing or forged; six numbered chapters plus an evidence cabinet of four bounded demonstrations. Rebased onto main by the release authority (the lane was cut from `35f8d33` and would otherwise have reverted the tribunal fixes), then verified from the merged tree. `tests/cherry/landing-winner.test.tsx`, `e2e/cherry/final-winner-landing.spec.ts`. |
| W7 hostile release audit (Sol lane) | ACCEPTED, all blockers closed | `04b87e4`; fixes `d0ddefe`, `db41134` | Five blockers outside the landing's scope: fragment links never reached the Showcase proof, the Chronicle verifier was line-ending dependent, WebMCP API presence read as an attached agent (already fixed by the tribunal), stale evidence hashes, and local identity in the public capture record. Each is fixed or redacted; `docs/winner/lanes/W7_REPORT.md` carries the disposition. |
| Devpost kit and demo script for the God Mode product | DONE | `59d551b` | `docs/release/DEVPOST_SUBMISSION.md`, `docs/release/DEMO_SCRIPT.md` with a do-not-say list |

---

## 2. Final tribunal scorecard

**A three-persona tribunal ran once, on 2026-09-03 between 02:15 and 04:00 London**, against
the production build: a WebMCP judge with a mock host, a first-time user and product judge with 62
screenshots at two widths, and a claims auditor over every public page and release document. Their
scores before the fixes were WebMCP use 7, human-agent experience 5, usefulness 5, originality 7,
execution 4 (out of 10), and the claims auditor filed 18 findings, four of them blockers. Thirty
findings were fixed test-first that night and verified from a fresh clone (`docs/release/TRIBUNAL_LOG.md`
lists each with its commit); the deferred ones are listed there with the reason. The scores were
not re-issued after the fixes, so no post-fix number is claimed. The five-persona, two-round
tournament the ticket asked for did not run.

What existed before it, and what it is worth:

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

**Live, verified 2026-09-03 at 01:50 London from the built-in browser on the owner's machine and by HTTP probe:**

| Check | Result |
|---|---|
| `https://cherry-wine.vercel.app/` | 200 |
| `https://cherry-wine.vercel.app/showcase` | 200 |
| `https://cherry-wine.vercel.app/connect` | 200 |
| `https://cherry-wine.vercel.app/compatibility` | 200 |
| `https://cherry-wine.vercel.app/studio/skills` | 200 |
| `https://cherry-wine.vercel.app/studio/creators` | 200 |
| `https://cherry-wine.vercel.app/studio/control` | 200, renders "What should Cherry take care of?" |
| `/media/cherry-demo/recorded-mission.json` | 200, `replaySha256` equals the pinned trust constant; `/showcase` shows "SHA-256 PIN VERIFIED" |
| `/media/cherry-demo/mission-hero.webm` | 200, `video/webm`, 3,078,166 bytes |
| `https://cherry-wine.vercel.app/robots.txt` | 200 |
| `https://cherry-wine.vercel.app/sitemap.xml` | 200 |
| `https://getcherry.vercel.app/` (public alias) | 200, redirects to canonical |
| `/media/demo/golden-loop.webm` | 200, `video/webm`, 4,000,205 bytes |

Deploys of record are made from a locally verified prebuilt output (`vercel build --prod` then
`vercel deploy --prebuilt --prod`), because a remote build against a drifted lockfile is what
produced the one blank-page outage this project had. The Vercel Git integration also deploys on
push to `main` (`vercel.json` names the build command), so the live site can come from either
path.

**Repository:** `https://github.com/vaibhav4046/cherry`, MIT.

**Deploy of record:** `dpl_DvMdxNXjskwbZSfdK18rzZ6E4hs8`, prebuilt from the verified clone at `9d906b5` with the Vercel production env; the live entry chunk matches the built output, and the release manager checks the live routes after every deploy. Git-triggered production builds are disabled for main (`vercel.json`), so production only ever comes from output that passed the gates.

**GitHub push state:** the repository is public and current as of `599ec39`. Pushes from the owner's machine began hanging on the afternoon of 3 September (reads answer instantly, `git push` does not return), so the last copy commits may reach `origin/main` after this signature; the live deployment is built from the release manager's verified clone and does not depend on that push. `https://raw.githubusercontent.com/vaibhav4046/cherry/main/docs/release/FINAL_HANDOFF.md` returns 200 anonymously, which is only possible on a public repository.

**Gate counts on the signed commit:**

| Gate | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | 0 errors |
| Lint | `npm run lint` | 0 errors, 0 warnings |
| Unit | `npm run test` | **613 passed**, 2 opt-in skips |
| Runner and MCP bridge | `npm run test:runner` | **135 passed**, 0 failed (now includes the Chronicle asset verifier's own test) |
| Production build | `npm run build` | built, 0 errors |
| Bundle and receipt verification | `npm run verify:pack` | pass |
| Submission audit | `npm run audit:submission` | **0 FAIL, 0 WARN** |
| End to end (Playwright) | `npx playwright test` | **130 collected**, 0 failed, 0 flaky (see docs/release/e2e-results.json for the run of record), desktop 1440x1024 plus Pixel 7, including a browser-to-real-runner mission |
| Clean install | `npm ci` | exit 0, 996 packages |
| Dependency advisories | `npm audit --omit=dev --audit-level=high` | exit 0 (0 critical, 0 high, 10 moderate) |
| Service worker behaviour | `npm run verify:sw` | 5/5 (icon fetch never poisons the shell, redeploy reaches returning visitors, offline serves the freshest shell) |

Every row above was measured on 2026-09-03 from a fresh GitHub clone of the signed tree with no
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
| Technical report | `docs/release/TECHNICAL_REPORT.md` | One document: architecture, engine, WebMCP surface, serving paths, boundaries, gates, what is not proven |
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
| Playwright report | `docs/release/e2e-results.json` | The JSON report from the committed Playwright run on the signed commit |
| Real Codex mission capture | `docs/release/GOD_MODE_REAL_HOST_CAPTURE.md` | codex-cli 0.152.1 running two mission nodes in two worktrees with measured overlap, verified by the runner's own `node --test` |
| Screenshots | `docs/release/screenshots/` | 81 tracked captures across landing, studio, showcase, agent view, compatibility, creators, God Mode and final QA |
| Landing capture for README | `docs/media/cherry-landing.png` | The shipped landing, 2880x1800, recaptured 2026-09-03 from the deployed build |
| Sample bundle | `docs/release/sample-bundle.zip` and `.meta.json` | A compiled Agent Skills bundle with its standalone verify script |
| Coordination log | `docs/codex-takeover/STATUS.md` | Append-only two-agent build record: every ticket, every gate run, every bounce |
| Guardrails | `docs/codex-takeover/05_GUARDRAILS.md` | The hard lines this project refused to cross, and why |
| Starter issues | `docs/GOOD_FIRST_ISSUES.md` | 10 scoped issues for contributors |
| Contribution guide | `CONTRIBUTING.md` | Gates, lanes, claim discipline, four worked extension outlines |

| Tribunal log | `docs/release/TRIBUNAL_LOG.md` | The 2026-09-03 three-persona review: scores, every finding with its fix commit, and what was deferred |

**Not in the index because they were never produced:** `PROOF_LOG.md`, `BREAKER_LOG.md`.
Sections 1 and 2 say what stands in for each. `TECHNICAL_REPORT.md` was added in the afternoon
amendment and `TRIBUNAL_LOG.md` in the night amendment.

---

## 5. The owner's script, minute by minute

### Part A: record the video (budget 2 hours, Thursday morning 3 September)

Full narration and the do-not-say list are in `docs/release/DEMO_SCRIPT.md`. Under 3 minutes, with
audio that says what was built and how WebMCP is used (that is the stated video requirement).
Record at 1440x900 or larger. Public YouTube, not unlisted.

The one artifact nobody else can supply is a real WebMCP host session. The challenge resources say
WebMCP site tools work out of the box in the built-in browser of the ChatGPT desktop app, ChatGPT
Work and Codex (the challenge resources, as of 2 September, name GPT-5.6 Sol or Terra for site
tools; Luna has it disabled), and the judges may test the live site themselves. So the film is: ChatGPT's own browser sees Cherry's tools, plans a mission through
them, a person approves it (no tool can), ChatGPT starts it, and Codex on this machine does the
work in git worktrees while the runner verifies it.

1. **Site tools (10 min).** Update the ChatGPT desktop app. In its built-in browser open
   `https://cherry-wine.vercel.app/studio/control`, click **Site tools** in the address bar, then
   **Available site tools**: the seven global reads plus the five mission tools. Record it. If the
   item does not appear, the fallback host is Chrome 149+ with `chrome://flags/#enable-webmcp-testing`;
   DevTools lists the registered tools.
2. **Runner (5 min).** `node runner/server.mjs --root D:\project --allow-exec node --allow-exec codex --concurrency 3`,
   then pair it in Studio > Connect with the printed token. Codex CLI is found on PATH, as in the
   committed capture.
3. **Target repository (2 min).** Any small real repository under `D:\project` with a `node --test`
   suite. A game repository is a good choice because the fix is visible on screen.
4. **The mission (10 min of footage, cut to 90 s).** Ask ChatGPT: "Use this site's tools: create an
   outcome mission to fix the highest-impact onboarding defect in D:\project\<repo> and prepare the
   release notes, nothing public without my approval, then plan it and tell me what the plan
   contains." Click **Approve plan** yourself. Ask ChatGPT to start it. Show two workers running in
   two worktrees, the verify node running `node --test`, then decide the publish node. Open
   **Agent** to show every call in the log.
5. **Showcase (20 s).** `/showcase`: the committed Codex run, the pinned replay, the evidence panel.
6. **What's proven (10 s).** `/compatibility`: every surface labelled with the test or capture behind it.
7. **Three don'ts** (from DEMO_SCRIPT): never call the sandbox a VM, never call receipts "signed",
   never claim a surface the compatibility page labels Experimental.
8. **Send the recording to the release manager before the freeze.** The WebMCP capture gets
   pinned into the Showcase and the compatibility row moves from Experimental to Validated with
   its hash. Nothing changes after 13:00 PT.
9. **Upload (20 min).** YouTube, public, title `Cherry: one task, an entire AI team, human authority
   intact`, description = the "Judging-criteria cheat sheet" block from
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

**Hard deadline: Thursday 3 September 2026, 21:00 London (13:00 PT).** Submit by 18:00 London.
The remaining hours are buffer, not polish time. A submitted entry that is 90 percent polished beats
a perfect one that missed the form. After 13:00 PT nothing in the repository or the deployment
changes.

---

## 6. Anything left, honestly

| Item | State | What finishing it takes |
|---|---|---|
| **GitHub push** | **Resolved.** `origin/main` carries `deb6c0c` and the documentation commits after it; verified public. | Nothing. |
| W2 six-chapter landing (Sol) | Pending on `codex/superman-orchard`. | Rebase onto `main`, pass the same clean-clone gates, land by 14:00 London or stay out. |
| T20 launch kit, T23 landing self-demo | Not started. | Both are post-submission polish. |
| Claude Code takeover session | Stopped at 10:54 London with T26 uncommitted; its work was snapshotted and finished by the release manager. | Nothing. The worktree `D:\project\cherry-claude-takeover` and branch the takeover branch can be deleted after the hackathon. |
| `.gitattributes` line-ending normalisation | Deferred. | Nine tracked files carry CRLF; normalising them mid-flight would have conflicted with the takeover branch. Add `* text=auto eol=lf` after submission and renormalise in one commit, keeping the hash-verified example archives byte-identical. |
| T24 tribunal | One round of three personas ran on 2026-09-03; see section 2. | A second round after the fixes, and the two missing personas, are post-submission work. |
| Live WebMCP host capture | Not captured yet; the owner records it Thursday morning (Part A above). | Open the live site in the ChatGPT desktop app's built-in browser (or Chrome 149+ with the WebMCP testing flag), record the site tools and one mission driven through them, send the recording before the freeze. Until then the compatibility page labels the surface Experimental, which is the correct state, not a gap to paper over. |
| Secret rotation | Pending. | The Privy app secret and the Vercel token were shared in a chat during the build. The Privy app secret was never used and is not in the repo or the client bundle; the Vercel token was used only to set `VITE_PRIVY_APP_ID` and to deploy. **Rotate both after the hackathon**, in the Privy dashboard and in Vercel account settings. |

---

## Sign-off

Cherry does what its landing page says: a lesson becomes evidence, evidence becomes a versioned
skill, a human approves an exact revision, artifacts are built and verified with real failures kept
in the record, and the result is served to any agent that visits over WebMCP or installs over MCP
and Agent Skills. The gates in section 3 back that. The gaps in sections 1, 2 and 6 are named
rather than hidden, which is the same discipline the product applies to its own claims.

Signed in the release manager lane, 2026-09-02; night amendment signed 2026-09-03 at 02:00 London.
