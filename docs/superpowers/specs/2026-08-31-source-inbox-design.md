# Cherry Source Inbox and Compliant Article Import

**Status:** Proposed implementation design after the product-direction approval in this task.

## Goal

Give Cherry a durable, agent-readable Source Inbox where a person can save a YouTube lesson,
article, post, note, or local text file, preserve its provenance, and send it into the existing
evidence → SkillGraph → human approval → verification loop.

The milestone is intentionally narrow: it improves source capture and reuse with an optional,
user-clicked fetch of compliant public pages, without scraping protected sites, silently calling a
paid model, watching the internet in the background, or granting an agent approval authority.

## Product decision

Cherry is a source-to-skill compiler, not a general-purpose reader or autonomous crawler. The user
intentionally saves a source and either supplies its readable content or explicitly requests one
compliant public-page fetch through the paired local Scrapling adapter. Cherry stores the source
metadata and content provenance, creates an inspectable lesson, and keeps the existing exact-revision
approval and deterministic verification guarantees.

## Existing baseline to preserve

- `Lesson`, transcript segments, observations, evidence, SkillGraph revisions, approvals, artifacts,
  verification, memories, routines, receipts, and WebMCP are already shipped.
- `/studio/quick` is the existing source-to-skill wizard and must remain fully functional.
- `/studio/inbox` is the existing workforce inbox and must not be renamed or repurposed.
- IndexedDB is the authoritative local store; every mutation emits a `ProofEvent` in the same user
  action flow.
- External source material remains untrusted until a human promotes trust.
- Manual mode remains complete when no WebMCP host is available.

## Scope

### In scope

1. A new `/studio/sources` route and Studio navigation item named **Sources**.
2. A persisted `SourceRecord` metadata layer linked to a `Lesson`.
3. Save source types:
   - YouTube lesson (official embed URL, user acknowledgement required).
   - Article or post (URL optional; body is pasted/uploaded by the user or obtained through the
     explicit compliant-fetch action).
   - Note (user-authored text).
   - Text file (`.txt`, `.md`, `.json`, `.srt`, `.vtt`).
4. Optional user-clicked URL extraction for compliant public pages through a local Scrapling
   adapter. The adapter returns sanitized Markdown and provenance; it does not run in the static
   Vercel browser bundle.
5. Source list with status, type, title, creator, URL, imported timestamp, fetch status, and linked
   lesson.
6. Duplicate detection by normalized URL when a URL exists, otherwise by content SHA-256.
7. One-click **Open lesson**, **Fetch selected page**, and **Create skill** actions that use existing
   domain services.
8. WebMCP read/save tools on the Sources surface, with the existing aperture cap and no approval
   tool.
9. Workspace export/import and migration support for source records.
10. Unit, migration, accessibility, responsive, scraper-contract, and Playwright coverage.

### Explicitly out of scope

- Scraping LinkedIn, YouTube captions, or any site behind a login.
- Fetching arbitrary web pages server-side or bypassing CORS, robots.txt, rate limits, or access controls.
- Using Scrapling's stealth fetchers, proxy rotation, CAPTCHA/anti-bot bypass, session cookies, or
  remote browsers.
- Automatic background watching, channel monitoring, RSS scheduling, or notifications.
- Model-powered extraction inside Cherry. Existing deterministic extraction remains the fallback;
  the user's attached agent or future BYOK adapter may perform optional extraction later.
- Cross-device sync, billing, a cloud database, or treating a Codex/ChatGPT subscription as a
  server-side API.
- Changes to the current artifact sandbox, runner security model, approval policy, or receipt format.

## User experience

### Sources route

`/studio/sources` opens with:

- Heading: **Sources**
- Supporting copy: “Save the material you want Cherry to turn into a method. Outside content stays
  untrusted until you review it.”
- Primary **Save a source** button.
- Filter controls for All, Needs transcript, Ready for skill, and Archived.
- Cards showing type icon + text label, title, creator, URL domain, content status, and last updated
  date.
- Empty state linking to `/studio/quick` and the labelled `/showcase` sample.

### Save source dialog

The dialog uses four labelled choices, not emoji or generic brand marks:

1. **YouTube lesson** — official player; paste transcript yourself.
2. **Article or post** — paste the body or upload a permitted text export; URL is metadata only.
3. **Note** — author a private note in Cherry.
4. **Text file** — import `.txt`, `.md`, `.json`, `.srt`, or `.vtt` locally.

The form collects title, optional creator, optional URL, content (or file), and a plain-language
rights acknowledgement. The acknowledgement is recorded as a proof event; it is not a legal claim
that Cherry verified ownership.

After saving, the user sees the source card and chooses **Open lesson** or **Create skill**. Create
skill navigates to `/studio/quick?sourceId=<id>`; the wizard reuses the linked lesson rather than
creating a duplicate lesson.

### Quick Skill integration

When `sourceId` is present:

- Load the source and linked lesson.
- If the lesson has no mission, create one and link it using existing mission services.
- If the source already has imported segments, open the Review stage.
- Otherwise open the Transcript stage with the source title and content status.
- Preserve the existing user review, keep/drop, approval, verification, receipt, and download flow.

## Domain model

Create `src/cherry/source/source-model.ts`:

```ts
export type SourceKind = 'youtube' | 'article' | 'note' | 'file';
export type SourceStatus = 'saved' | 'ready' | 'archived';
export type SourceContentFormat = 'plain' | 'markdown' | 'json' | 'srt' | 'vtt';
export type SourceFetchStatus = 'not_requested' | 'queued' | 'fetched' | 'blocked' | 'failed';

export interface SourceRecord {
  id: string;
  workspaceId: string;
  lessonId: string;
  kind: SourceKind;
  status: SourceStatus;
  title: string;
  creator: string | null;
  url: string | null;
  contentFormat: SourceContentFormat | null;
  contentHash: string | null;
  fetchStatus: SourceFetchStatus;
  fetchMethod: 'user_paste' | 'upload' | 'scrapling_fetch' | null;
  fetchedAt: string | null;
  fetchError: string | null;
  permissionAcknowledgedAt: string | null;
  permissionNote: string | null;
  createdAt: string;
  updatedAt: string;
}
```

The source record does not duplicate transcript text. Transcript segments remain the canonical
content ledger and continue to carry their existing source labels. `lessonId` is required so a
source always resolves to a real lesson and the existing observation/evidence pipeline can be used.

Create `src/cherry/source/source-service.ts` with these public functions:

```ts
createSource(input: CreateSourceInput, actorType?: ActorType): Promise<Result<SourceRecord>>
getSource(sourceId: string): Promise<SourceRecord | undefined>
listSources(workspaceId: string, options?: { includeArchived?: boolean }): Promise<SourceRecord[]>
updateSource(sourceId: string, patch: UpdateSourcePatch, actorType?: ActorType): Promise<Result<SourceRecord>>
archiveSource(sourceId: string, actorType?: ActorType): Promise<Result<SourceRecord>>
findDuplicateSource(workspaceId: string, input: { url?: string; contentHash?: string }): Promise<SourceRecord | undefined>
requestSourceFetch(sourceId: string, actorType?: ActorType): Promise<Result<SourceRecord>>
completeSourceFetch(sourceId: string, input: { markdown: string; contentHash: string }, actorType?: ActorType): Promise<Result<SourceRecord>>
failSourceFetch(sourceId: string, reason: string, actorType?: ActorType): Promise<Result<SourceRecord>>
```

`createSource` validates the source kind, normalizes URL metadata, creates a lesson through the
existing lesson service, persists the source record, and emits `source.saved`. It must return a
duplicate error with the existing source ID when the normalized URL or content hash already exists.

`updateSource` may change title, creator, URL, status, content format, content hash, and permission
note. It must not rewrite transcript segments or bypass trust/approval rules. `archiveSource` is
recoverable and never deletes the lesson or its evidence. Fetch lifecycle functions only update
metadata; transcript import remains an explicit, separately audited operation.

## Scrapling adapter

Create an optional local worker under `scraper/` using Scrapling's BSD-3-Clause package. The worker
is not bundled into the React app and is never required for guest/manual mode. It accepts one
structured JSON request per invocation:

```json
{
  "url": "https://example.com/article",
  "maxBytes": 262144,
  "respectRobots": true,
  "allowedDomains": ["example.com"]
}
```

The worker must:

- allow only `http` and `https` URLs;
- reject embedded credentials, localhost/private IPs, URL fragments, and disallowed domains;
- check `robots.txt` before fetching and fail closed when it cannot establish permission;
- use Scrapling's ordinary non-stealth fetcher only;
- never use `StealthyFetcher`, proxy rotation, CAPTCHA solving, session cookies, or remote CDP;
- cap response bytes, redirects, timeout, and extracted text length;
- remove scripts, styles, forms, hidden text, and obvious prompt-injection payloads before returning
  Markdown;
- return title, canonical URL, author when available, fetched timestamp, content hash, and a bounded
  Markdown body;
- return a structured blocked/failed reason without leaking response bodies into logs.

The runner exposes this as a setup-required `scrapling-fetch` adapter. The Sources UI shows “Local
fetcher not connected” until the user starts and pairs the worker. A fetch always requires a visible
user click or an explicit WebMCP request that creates a queued job; no timer or background crawler may
start it. The fetched page is still untrusted evidence and cannot become an approved skill without
human review.

Domain policy:

- YouTube URLs never go through Scrapling; use the official player and user-supplied transcript or
  local transcription.
- LinkedIn URLs are blocked by the default domain policy. The supported path is pasted/exported text
  or a future official API connector with the user's authorization.
- Public article/document domains may be enabled one at a time in the user's allowlist, with robots
  compliance and an attribution link preserved in the source record.

## Persistence and migration

Add a new Dexie migration after the current version:

```text
sourceRecords: id, workspaceId, lessonId, kind, status, updatedAt
```

Register the table in `CherryDatabase` and `ALL_STORES`. Workspace export/import must include source
records and remap `id`, `workspaceId`, and `lessonId` consistently with existing archive logic.

Every source mutation emits a proof event containing metadata only: source kind, lesson ID, URL
domain (not query strings), content format, and hash. Proof summaries must not include source body
text or sensitive note contents.

## UI and route integration

- Create `src/pages/studio/Sources.tsx`.
- Add a lazy route in `src/app/App.tsx` at `/studio/sources`.
- Add the item to `NAV_PRIMARY` or the existing learning group without removing the workforce Inbox.
- Update the route-to-surface mapping so `/studio/sources` uses a dedicated `sources` surface.
- Add source-specific styles to `src/design-system/apple.css` only where existing shared classes are
  insufficient. Keep the Apple-inspired light glass system: Frost canvas, Carbon text, Apple Blue
  primary actions, hairline borders, 8px cards, pill controls, and real SVG brand marks.
- Update `CommandCenter`'s Add a source dialog with a link to `/studio/sources` while keeping the
  existing Quick Skill choices.
- Update `QuickSkill` to load an existing `sourceId` without breaking its current no-query flow.

## WebMCP integration

Add a `sources` surface in the existing state/surface tables, capped at five tools:

- `list_sources` — read the current workspace's source metadata and statuses.
- `save_source` — save metadata and user-supplied content references; never fetches arbitrary URLs.
- `request_source_fetch` — enqueue one explicit Scrapling fetch for an allowlisted public URL; returns
  setup-required when the local worker is not paired.
- `archive_source` — recoverably archive a source.
- `prepare_source_for_skill` — create/link the mission and return the route to continue manually.

All tools call `source-service.ts` or existing mission/lesson services. They must be retired on route
change, return bounded UTF-8 output, reject stale closures, and never approve a skill or memory.
When no WebMCP host exists, the Sources page remains fully usable manually.

## Security and rights handling

- A URL is metadata, not permission to fetch or redistribute its contents. Fetch permission is a
  separate, visible action and is still constrained by the target site's terms and robots policy.
- Article/post content must be pasted, uploaded, or obtained through a future official connector.
- LinkedIn URLs are blocked by the default Scrapling allowlist. LinkedIn content is supported only as
  user-supplied text/export in the `article` path or through a future official API integration.
- YouTube remains official-player-only with user-supplied transcript or local transcription.
- Imported content is untrusted data and cannot become active instructions without human approval.
- URL normalization strips fragments and tracking parameters before duplicate comparison; the original
  display URL may be retained only if it does not include credentials or secrets.
- Reject URLs containing embedded credentials, `javascript:`, `data:`, or non-http(s) schemes.

## Acceptance criteria

1. A user can save each of the four source kinds from `/studio/sources`.
2. A saved source persists across reload and appears in the correct filter state.
3. Duplicate URL/content submissions are rejected with a link to the existing source.
4. A user can explicitly request a Scrapling fetch for one allowlisted public page when the local
   worker is paired; the fetched body and provenance are bounded and visible.
5. Robots-disallowed, private-network, LinkedIn, YouTube, credential-bearing, and non-http(s) URLs
   fail closed with an explanatory state.
6. A saved source opens a real lesson and uses existing transcript/evidence services.
7. `QuickSkill?sourceId=` reuses the source lesson and never creates a duplicate lesson.
8. Existing Quick Skill, Showcase, Watch, Memory, Routines, Runner, export/import, and proof flows
   remain green.
9. Source mutations are represented in the proof ledger without leaking source body content.
10. WebMCP tools are available only on the Sources surface and cannot approve or promote anything.
11. Keyboard navigation, focus-visible states, reduced motion, mobile layout, and axe checks pass.
12. Release docs state clearly that background crawling, LinkedIn scraping, cloud execution, and live
    browser-host WebMCP validation remain outside this milestone.

## Test plan

- `tests/cherry/source.test.ts`: validation, URL normalization, duplicate detection, source lifecycle,
  proof-event summaries, archive behavior, fetch state transitions, and actor boundaries.
- `scraper/tests/contract.test.py`: Scrapling worker rejects disallowed schemes/domains, private
  addresses, robots denial, oversized responses, and prompt-injection markup; permitted fixture HTML
  becomes bounded Markdown with metadata.
- Runner adapter tests: `scrapling-fetch` requires an allowlisted executable/paired worker and never
  reports a provider fetch as verification.
- Migration/archive tests: source records survive workspace export/import with remapped IDs.
- WebMCP tests: source aperture registration, stale closure refusal, output caps, and no approval
  tool.
- Playwright: save each source type, reload, filter, open lesson, create skill from `sourceId`, and
  verify no duplicate lesson appears.
- Accessibility/responsive suite: `/studio/sources` desktop/mobile, dialog keyboard close, axe, and
  overflow checks.
- Full gates required by `AGENTS.md`: typecheck, lint, unit, runner, build, and E2E.

## Non-regression and rollout

The first implementation may ship behind no feature flag because it is additive and local-only. If
an existing database cannot migrate, Cherry must fail closed with a clear setup error rather than
delete or rewrite user data. The release record must include the migration version, source-route
E2E evidence, and a concise limitations note.
