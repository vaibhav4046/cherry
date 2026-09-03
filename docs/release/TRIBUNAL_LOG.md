# Judge tribunal, 2026-09-03 (night before submission)

Three independent reviewer sessions, each read-only, each working from the production build
(`dist` of the deployed tree) on a local preview with Playwright, screenshots and the source.
Nothing was accepted on self-report: every finding names a file and a line, and every fix below
was made test-first and re-verified from a fresh clone before it shipped. Findings that were not
fixed are listed as deferred with the reason, not hidden.

| Persona | What it did | Scores it gave (1 to 10) |
|---|---|---|
| WebMCP judge | Installed a mock `document.modelContext` host, listed the registered tools on 12 routes, called every read tool, drove the mission tools on `/studio/control`, read the tool definitions and Agent View | Thoughtful use of WebMCP 7, human-agent experience 5 |
| First-time user and product judge | Walked landing, Showcase, Command Center, Missions, Agent, Creators, Skills, Proof, What's proven and Connect at 1440x900 and 390x844 with 62 screenshots, tried two misuses | Usefulness 5, originality 7, execution 4, human-agent experience 5 |
| Claims auditor | Read every public page and release document line by line and checked each number, date, "validated", "captured" and host claim against tests, captures and fixtures | 18 findings, 4 blockers |

The scores are the reviewers' own, before the fixes. They are kept here unedited.

## Fixed the same night

| Id | Finding | Fix | Commit |
|---|---|---|---|
| W1 | Agent mission writes recorded as human acts in the proof ledger (`mission.created`, `mission.plan_created`, cancel reason) | actorType threads from the tool into every event; cancel reason names the agent | `6efe318` |
| W2 | A refused hostile outcome still persisted a project | Template validated before anything is written; message ends "Nothing was created." | `6efe318` |
| W3 | Write tools aborted their own registration before returning; globals re-registered on every navigation | Globals register once; contextual tools diffed; no abort while a host awaits a result | `6efe318` |
| W4 | The agent brief named three tools that never register | Brief uses the registered names; alias descriptions say so | `e1ebfdf` |
| W5 | `list_skills` could not page; `get_skill` summary cut the purpose to "Review a thumbnai" | `offset` and `nextOffset`; purpose fitted before deduplicated citations | `6efe318` |
| W6 | "Agent connected" shown whenever the API exists, with no agent | "Site tools available" until a host calls a tool or introduces itself | `e1ebfdf` |
| W7, W8, W9, W11 | One-word recommendation match, over-promising capabilities description, schema gaps, cancelled missions advertising ready work | Fixed as described in the commit | `6efe318` |
| U1 (blocker) | Planning while a sample space was active put the plan in the sample space; Reset demo deleted it | Plans always land in the person's own space; the composer says so | `e1ebfdf` |
| U2 | The mission page was a dead end without a runner; Sync now claimed a sync | The live-start gate says why nothing can be pressed; Sync now is honest | `e1ebfdf` |
| U3 | Planned missions opened the old project page from Command Center | Rows with a plan open Mission Control | `e1ebfdf` |
| U4 | Sample missions read "Running" beside "No runner detected" | Sample label in sample spaces | `e1ebfdf` |
| U5 | Loading the sample library said nothing | A notice on arrival | `e1ebfdf` |
| U6 | The zip bundle failed on install-ready sample skills and wrote a blocked receipt | The button says a passed verification is needed first | `e1ebfdf` |
| U8 | Naming drift (Team, Missions, Mission Control) | Nav item renamed Missions; Give Cherry an outcome on Command Center | `e1ebfdf` |
| U9 | Never-started plans sat under Working | A Planned column | `6efe318` |
| U11, U15, U16 | Em dashes in touched copy; bottom nav covering the last line on phones; a garbled sample skill name | Copy split into sentences; mobile padding restored; task-shaped titles name the skill, fixture re-pinned | `e1ebfdf` |
| C1, C5, C6, C17, C18 | Compatibility rows contradicting the captured Codex mission or describing an old preview design; Claude Code rows without a cited record; legend; runner test count | Rows rewritten to what the repository holds | `e1ebfdf` |
| C2 | Meta descriptions named Kimi and local models as teammates | Descriptions name captured and experimental hosts honestly | `e1ebfdf` |
| C3, C4, C7 to C15 | Stale counts, dates, hashes and tables across README and release documents | Corrected in one documentation pass | `87ec293` |
| C10 | The handoff claimed a byte-exact live chunk while the Git integration also deployed | Git-triggered production deploys disabled; deploys come only from verified prebuilt output | `48f82e7` |

## Deferred, with the reason

| Id | Finding | Why it waits |
|---|---|---|
| U7 | The landing's "Watch the real run" opens the older skill-journey recording | The landing is owned by the W2 lane until 14:00 London; if W2 lands, its landing replaces this; if not, the two links are relabelled before the freeze |
| U10, U12, U13, U14 | First ask on a fresh Studio, a legend detail, "90 seconds" beside "27 seconds", the Proof page's empty-table hint | Copy-level, low risk, after the recording |
| W10 | Agent View forgets calls on reload and cannot list surface tools | Needs a persistence decision (session storage) that is not worth taking hours before the freeze |
| C16 | Showcase film caption | Fixed in `e1ebfdf` ("Silent animated summary, recorded in a browser") |

## What the tribunal did not do

It did not run inside a real WebMCP host; the mock host proves the registration contract, not
a proprietary client. The owner's recording in the ChatGPT desktop app's built-in browser is the
missing artifact, and the compatibility page keeps that row Experimental until it exists.
