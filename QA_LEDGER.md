# QA LEDGER — Cherry

Shared ledger for the QA Ultimatum (docs/codex-takeover/12_QA_ULTIMATUM.md). Append, never
rewrite history. Evidence or it did not happen.

## HUMAN_TODO

1. Privy dashboard (dashboard.privy.io, app cmthq…nc5w): confirm Login methods = Email only
   (the product implements email codes; Google can come after the hackathon). Confirm Allowed
   origins include https://cherry-wine.vercel.app, https://getcherry.vercel.app, and
   http://127.0.0.1:4173 so local sign-in is testable.
2. Rotate the Privy app secret and the Vercel deploy token before judging, not after. This is a
   public repository, so a ledger line describing live credentials is itself a finding. Rotate,
   then replace this entry with the date it was done.

## Defect table

| id | sev | route | status | evidence |
| --- | --- | --- | --- | --- |
| PL-0 | P0 | all routes, returning visitors | fixed, proven | Service worker served the app shell cache-first, so a returning visitor kept an old index.html whose hashed asset URLs the new deploy had removed: the app could not boot (blank page). This is the most likely true root of the Sep 1 incident, and it also explains stale titles and stale asset hashes in console history. sw.js v2: network-first navigations with an HTTP-cache bypass, cache-first only for immutable /assets/, old caches purged on activate. Proven locally (simulated redeploy serves fresh HTML; offline fallback still renders) and live (sw.js on cherry-wine.vercel.app reports cherry-shell-v2 with the reload bypass). Commit 620e42c. |
| PL-1 | P0 | all routes | fixed, proven live | Auth SDK now loads only on the sign-in surface (AccountPanel calls activate) or when a stored session exists; guests never request it. Local build with the production app id: landing = 8 requests, 0 privy or walletconnect requests, 0 console errors. Residual risk: on /studio/settings/connections, after activation, the SDK may attempt its walletconnect registry fetches, which CSP blocks; config route taken first (loginMethods email only, empty wallet list). Live measurement on cherry-wine.vercel.app after clearing any stored session (built-in browser, guest): 6 requests, zero privy and zero walletconnect requests, correct per-route title. A visitor who has previously signed in does load the auth chunk on any route, by design (session restore). |
| PL-2 | P1 | / weight | fixed, proven live | Guest landing measured live at approximately 739 KB over 6 requests (was about 7.0 MB over 47), no third-party auth iframes. Target under 1.5 MB: pass. |
| PL-3 | P1 | /connect mobile | fixed, proven live | scrollWidth 813 vs innerWidth 828 on the live page: no horizontal scroll. |
| PL-3b | P1 | /connect narrow | superseded | .grid-cards children get min-width:0 and pre max-width:100%; at 390px scrollWidth equals innerWidth (no panning). |
| PL-4 | P1 | /studio/quick refresh | open, Codex T1 lane | Persist wizard draft per step. |
| PL-5 | P1 | /studio/quick empty submit | open, Codex T1 lane | Inline alert, do not advance. |
| PL-6 | P2 | dead or private videos | open, Codex | Catch player error codes 100, 101, 150 and block Continue with Cherry's own message. |
| PL-7 | P2 | runner polling noise | open, Codex | Exponential backoff after refusals, calm "runner not detected" state. |
| PL-8 | P2 | crawl files and 404 | partial | robots.txt, sitemap.xml, favicon.ico shipped. Real 404 status waived with reason: the SPA rewrite must serve the app shell for client routes; the custom NotFound view covers the user experience, and unknown paths get the "Page not found" title. |
| PL-9 | P2 | identical titles | fixed, proven live | Live: "/" reports "Cherry Wine · Turn lessons into skills every agent can run", "/connect" reports "Connect your agent · Cherry Wine" with its own meta description. |
| PL-9b | P2 | titles detail | superseded | RouteMeta sets a unique title and meta description per route; em dash removed from the base title, description, and OG or Twitter titles. |
| PL-10 | P3 | copy nits | open, Codex suite H | Includes the "recognised" variant sweep and the three message rewrites. |
| PL-11 | P3 | small items | partial | /connect compatibility link now a 44px tap target (.tap-link). Icon-row wrap at 1440 and the compute-pressure warning stay open for Codex. |

## Runs

### Live verification, Sep 2 (Claude, release manager)

Deployed the QA wave from the merged tree after full gates (typecheck, lint, 179 unit + 2 skipped,
42 runner, 45 e2e, build). Live checks on cherry-wine.vercel.app:

- Route status sweep: /, /showcase, /connect, /compatibility, /studio, an unknown path,
  /robots.txt, /sitemap.xml, /favicon.ico all answer 200. Real 404 status waived (SPA rewrite);
  the custom NotFound view and the "Page not found" title cover the user experience.
- OG image intact (og.jpg); alias getcherry.vercel.app 307s to the canonical domain.
- Guest landing: 6 requests, about 739 KB, zero third-party auth.
- /connect: no horizontal scroll, own title and description.
- sw.js live reports cherry-shell-v2 with the navigation cache bypass.

Note for whoever reads console logs in a long-lived browser session: the pane keeps console
history across navigations, so walletconnect errors from earlier builds (asset hashes
index-CdotWFOt.js, index-BD7fE6zt.js) persist in the log. Verify against the current asset hash
(index-DXrOsuLx.js or later) or use a fresh context; resource-timing measurements above are the
authoritative check.

## Run entry — 2026-09-04, commit `01212e0`

Measured, not quoted from an earlier row.

| suite | command | result |
| --- | --- | --- |
| unit | `npx vitest run` | 762 passed, 2 skipped, 74 files (1 file skipped) |
| runner | `npm run test:runner` | 135 passed, 0 failed, 2 suites |
| e2e (WebMCP full journey) | `npx playwright test e2e/cherry/webmcp-full-journey.spec.ts` | 1 passed (44.5s) |

New this run: `approval-handoff.test.ts` (13), `tool-schema-contract.test.ts` (73),
`webmcp-security-boundaries.test.ts` (14), `library-recommendation-contract.test.ts` (6),
`auto-draft.test.ts` (6), `lazy-route.test.ts` (4), and the end-to-end journey spec.

Defects found and fixed during this run, each with a test that failed first:

| id | sev | what | evidence |
| --- | --- | --- | --- |
| AP-1 | P0 | The workflow stopped dead at `AWAITING_APPROVAL`: an agent could request approval and then had no way to see the pending decision, point a person at it, or learn the outcome. | `get_approval_status`, the deep link, the studio approval bar, `tests/cherry/approval-handoff.test.ts` |
| AP-2 | P0 | A human approval did not move the product. Approving left the mission in `AWAITING_APPROVAL`, so execution stayed unreachable. Quick Skill's own `EXECUTING` transition was issued as `'system'` and had been silently refused for the same reason. | `decideSkillGraphApproval` advances the mission as the human who decided; `approval-handoff.test.ts` |
| AP-3 | P0 | A passing verification never completed the mission, so the export aperture never registered. An agent could finish the entire journey and find no way to hand the result over. | `verification-service.ts`; found by `e2e/cherry/webmcp-full-journey.spec.ts`, not by inspection |
| AP-4 | P1 | Approvals bound to a revision number only. An edit that kept the revision but changed the content inherited the decision. | Content hash recorded at request time and re-checked at decision; `approval-handoff.test.ts` |
| DR-1 | P1 | Derivation dropped every declarative sentence, so a lesson teaching five things produced one node called "Review the lesson material" and counted one piece of evidence. | `auto-draft.ts`, `quick-skill.ts`, `tests/cherry/auto-draft.test.ts`, `tests/fixtures/landing-page-transcript.ts`. Now 5 nodes, 8 evidence records. |
| UI-1 | P1 | A deploy landing under an open tab rendered a blank page: the next navigation requested a hashed route chunk the server no longer had. Hit in a real browser while verifying an unrelated change. | `src/app/lazy-route.ts`, `tests/cherry/lazy-route.test.ts` |
| CL-1 | P1 | Five surfaces still told a judge the live ChatGPT host capture had not happened, including `/connect`, which sits between two pages that say it did. | `/connect`, Agent View, `docs/CAPABILITY_MATRIX.md`, `docs/release/DEVPOST_SUBMISSION.md` |
| CSS-1 | P2 | `--paper-2` and `--ink-secondary` are defined nowhere; both silently fell back. The rail's active-link rule in `shell.css` set cream on near-white at 1.23:1, invisible if import order ever changed. `theme-color` painted the phone address bar from a retired palette, and no `color-scheme` was declared. | `premium.css`, `shell.css`, `tokens.css`, `index.html` |

Still open, unchanged from earlier rows: PL-4, PL-5 (Quick Skill wizard draft
persistence and empty-submit guard), PL-6, PL-7.
