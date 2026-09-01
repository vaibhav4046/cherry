# QA LEDGER — Cherry

Shared ledger for the QA Ultimatum (docs/codex-takeover/12_QA_ULTIMATUM.md). Append, never
rewrite history. Evidence or it did not happen.

## HUMAN_TODO

1. Privy dashboard (dashboard.privy.io, app cmthq…nc5w): confirm Login methods = Email only
   (the product implements email codes; Google can come after the hackathon). Confirm Allowed
   origins include https://cherry-wine.vercel.app, https://getcherry.vercel.app, and
   http://127.0.0.1:4173 so local sign-in is testable.
2. After the hackathon: rotate the Privy app secret and the Vercel token (both were pasted in
   chat during the sprint).

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
