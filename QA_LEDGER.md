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
| PL-1 | P0 | all routes | fixed, pending live re-verify | Auth SDK now loads only on the sign-in surface (AccountPanel calls activate) or when a stored session exists; guests never request it. Local build with the production app id: landing = 8 requests, 0 privy or walletconnect requests, 0 console errors. Residual risk: on /studio/settings/connections, after activation, the SDK may attempt its walletconnect registry fetches, which CSP blocks; config route taken first (loginMethods email only, empty wallet list). If the two blocked-fetch messages persist there, waive per rule 4: sign-in screen only, guests unaffected, config route exhausted. |
| PL-2 | P1 | / weight | fixed, pending live re-verify | Same change removes the eager 2.35MB provider chunk and auth iframes from the landing for guests. |
| PL-3 | P1 | /connect mobile | fixed | .grid-cards children get min-width:0 and pre max-width:100%; at 390px scrollWidth equals innerWidth (no panning). |
| PL-4 | P1 | /studio/quick refresh | open, Codex T1 lane | Persist wizard draft per step. |
| PL-5 | P1 | /studio/quick empty submit | open, Codex T1 lane | Inline alert, do not advance. |
| PL-6 | P2 | dead or private videos | open, Codex | Catch player error codes 100, 101, 150 and block Continue with Cherry's own message. |
| PL-7 | P2 | runner polling noise | open, Codex | Exponential backoff after refusals, calm "runner not detected" state. |
| PL-8 | P2 | crawl files and 404 | partial | robots.txt, sitemap.xml, favicon.ico shipped. Real 404 status waived with reason: the SPA rewrite must serve the app shell for client routes; the custom NotFound view covers the user experience, and unknown paths get the "Page not found" title. |
| PL-9 | P2 | identical titles | fixed | RouteMeta sets a unique title and meta description per route; em dash removed from the base title, description, and OG or Twitter titles. |
| PL-10 | P3 | copy nits | open, Codex suite H | Includes the "recognised" variant sweep and the three message rewrites. |
| PL-11 | P3 | small items | partial | /connect compatibility link now a 44px tap target (.tap-link). Icon-row wrap at 1440 and the compute-pressure warning stay open for Codex. |

## Runs

(append protocol suite runs here)
