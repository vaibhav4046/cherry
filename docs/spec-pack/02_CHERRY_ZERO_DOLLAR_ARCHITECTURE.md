# CHERRY — ZERO-DOLLAR PRODUCTION ARCHITECTURE

## 1. Budget definition

“Zero-dollar” means Cherry’s required v1 infrastructure has **no mandatory paid API, model, database, transcription service, or server**. It does not mean user hardware, electricity, existing subscriptions, network access, optional provider quotas, or future scale cost nothing.

The core product remains functional with:

- a static deployment;
- browser storage;
- the official YouTube embed;
- manual/user-supplied transcript text;
- deterministic parsing, compilation, evaluation, hashing, and export;
- a connected host agent only when the user chooses to use one.

## 2. Reference architecture

```text
                    ┌──────────────────────────────┐
                    │ ChatGPT/Codex compatible host│
                    │  reasoning + browser vision  │
                    └──────────────┬───────────────┘
                                   │ WebMCP site tools
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CHERRY STUDIO PWA                           │
│ React/TypeScript UI · top-level WebMCP · manual operation       │
├─────────────────────────────────────────────────────────────────┤
│ Missions · Watch · Evidence · SkillGraph · Memory · Artifacts   │
│ Approvals · Verify · Compiler · Proof · Runner client           │
├─────────────────────────────────────────────────────────────────┤
│ IndexedDB/Dexie · Web Crypto · import/export · service worker   │
└───────────────┬───────────────────────────────┬─────────────────┘
                │ localhost pairing             │ optional encrypted blob
                ▼                               ▼
┌─────────────────────────────┐       ┌────────────────────────────┐
│ Local Cherry Runtime        │       │ BYO Sync Adapter           │
│ runner + stdio MCP bridge   │       │ Supabase/Cloudflare later  │
│ schedules + CLI adapters    │       │ never required for core    │
└──────────────┬──────────────┘       └────────────────────────────┘
               │
       ┌───────┴─────────────────┐
       ▼                         ▼
  Codex CLI (optional)     Claude CLI (optional)
  user authentication      user authentication/credits
```

## 3. Repository architecture

Preserve the current repository and Enough-derived working code. Use this as the target responsibility map, not an excuse for a rewrite:

```text
src/
├── app/                         # routes, layouts, providers
├── components/                  # shared presentational components
├── design-system/               # tokens, primitives, motion, icons
└── cherry/
    ├── core/                    # IDs, errors, clocks, domain events
    ├── persistence/             # IndexedDB repositories + migrations
    ├── mission/                 # mission state machine and task graph
    ├── watch/                   # player, transcript, coverage, observations
    ├── evidence/                # provenance/trust ledger
    ├── memory/                  # memory inbox, records, retrieval, lifecycle
    ├── skillgraph/              # graph model, validation, versions, approvals
    ├── artifacts/               # virtual files, versions, preview protocol
    ├── verify/                  # deterministic assertions and reports
    ├── compiler/                # Agent Skills and host-target generation
    ├── proof/                   # append-only events, receipts, hashes
    ├── webmcp/                  # tool definitions, lifecycle, schemas, evals
    └── runner-client/           # localhost pairing and job status
runner/
├── src/
│   ├── api/                     # localhost-only API
│   ├── jobs/                    # queue, persistence, scheduler
│   ├── security/                # pairing, allowlists, redaction
│   ├── adapters/                # verify/export/shell/codex/claude
│   └── mcp/                     # stdio native MCP server
└── tests/
docs/
├── design/
├── CHERRY_DECISIONS.md
├── CHERRY_REPO_MAP.md
└── superpowers/plans/
```

Each module exposes typed public functions. UI components call application services; WebMCP and native MCP call the same services. Neither protocol layer may directly mutate Zustand/React component state.

## 4. Zero-dollar stack

### Required core

| Layer | Choice | Cost | Reason |
|---|---|---:|---|
| UI | Existing React + strict TypeScript | $0 | Mature, testable, responsive. |
| Build | Existing Vite/Next.js setup | $0 | Do not migrate frameworks under deadline. |
| Styling | Existing CSS/Tailwind + CSS variables | $0 | Token-driven consistency. |
| State | Existing store or Zustand | $0 | Small predictable application state. |
| Persistence | IndexedDB through Dexie | $0 | Durable local structured storage and migrations. |
| Runtime validation | Zod or existing validator | $0 | Shared schemas at every trust boundary. |
| Graph | `@xyflow/react` or existing graph library | $0 | Mature node/edge interactions. |
| Transcript search | deterministic text index/MiniSearch | $0 | No embedding or model dependency. |
| Editor | CodeMirror 6 or existing editor | $0 | Real artifact editing. |
| Export | JSZip | $0 | Client-side valid archives. |
| Hashing/encryption | Web Crypto API | $0 | Browser-native SHA-256, PBKDF2/HKDF, AES-GCM. |
| Video | YouTube IFrame Player API | $0/no key | Official visible player and playback control. |
| PWA | existing service worker or `vite-plugin-pwa` | $0 | Installable and resilient shell. |
| Tests | Vitest/Jest, Testing Library, Playwright, axe-core | $0 | Deterministic release gates. |
| Hosting | Cloudflare Pages Free or existing Vercel Hobby project | $0 within limits | Static app; core avoids functions. |
| Source/CI | public GitHub repository and GitHub Actions | $0 within public-repo allowances | Open-source requirement and reproducibility. |

### Optional, non-core

| Capability | Option | Boundary |
|---|---|---|
| Cloud sync | Supabase Free with client-side encrypted blobs and RLS | Free projects may pause after low activity; core must not depend on it. |
| Edge API | Cloudflare Workers Free | 100,000 requests/day and tight CPU limits; no video/model processing. |
| Local transcription | `whisper.cpp` for user-owned local files | Hardware/download cost; never required for the core journey. |
| Local model | Ollama adapter | Model quality and hardware vary; manual and host-agent flows remain primary. |
| Programmatic Claude | `claude -p` / Agent SDK | Uses plan-dependent Agent SDK credits or API billing; not unlimited. |
| Programmatic Codex | `codex exec` | Uses the user’s supported Codex authentication and limits; runner must verify output independently. |

## 5. Hosting decision

### Primary recommendation

Deploy the Studio as a static application on **Cloudflare Pages Free** or the repository’s existing **Vercel Hobby** project. Do not add server functions unless a required feature cannot run in the browser.

Cloudflare Pages static requests are free and unlimited within the documented platform constraints; Pages Functions consume Workers quotas. Vercel Hobby is free for personal/small applications with documented included usage. Both can host the challenge build. Because the core is local-first, an outage affects initial page loading but does not create server-side data loss.

### Required deployment headers

Implement equivalent controls for the selected host:

```text
Content-Security-Policy: default-src 'self'; script-src 'self' https://www.youtube.com https://s.ytimg.com; frame-src https://www.youtube.com https://www.youtube-nocookie.com; img-src 'self' data: blob: https://i.ytimg.com; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self';
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin-allow-popups
```

Tune the CSP to the actual build and remove unused origins. Do not add `*` to make an error disappear.

## 6. Local persistence

### IndexedDB stores

```text
workspaces
missions
missionTasks
lessons
transcriptSegments
observations
evidence
skillGraphs
skillVersions
memories
memoryVersions
approvals
artifactSets
artifactFiles
artifactVersions
runs
proofEvents
receipts
settings
outbox
```

Use UUID/ULID identifiers, ISO timestamps, schema versioning, and transactional updates. Every domain mutation emits a ProofEvent in the same transaction where possible.

### Data durability

- Migrations are versioned and tested with fixture databases.
- Import is validated into a temporary workspace before commit.
- Export includes a format version and hash manifest.
- Destructive deletion requires confirmation and cascades intentionally.
- Service workers must not cache workspace records or secrets.
- Storage quota errors show export-and-cleanup recovery.

## 7. Encryption and sync

Core local data may remain browser-origin storage, with clear privacy messaging. For exported sensitive workspaces and optional sync:

1. User supplies a passphrase locally.
2. Derive a key with PBKDF2 or a supported stronger browser KDF using a random salt.
3. Encrypt a canonical JSON blob with AES-GCM and a random IV.
4. Upload only ciphertext, metadata needed for versioning, and a ciphertext hash.
5. Never send the passphrase or derived key to the sync provider.
6. Never store the passphrase in localStorage, IndexedDB, logs, analytics, or source.

If Supabase is enabled, use the anonymous public key only in the client, enforce per-user RLS, and never expose a service-role key. Sync conflicts create explicit local and remote versions; no silent last-write-wins for approved SkillGraphs or memories.

## 8. YouTube and transcript architecture

- Parse and retain only the normalized video ID, canonical URL, title/user-entered metadata, current time, observations, and transcript supplied through a permitted path.
- Use the official YouTube IFrame Player API. Keep the player visible while it is active.
- Set the embed `origin` parameter to Cherry’s actual origin.
- Do not attempt to access captions through undocumented endpoints.
- Do not call the Data API for core playback.
- Transcript parsers run locally and preserve original timing/source metadata.
- Text imported from any source is untrusted data and cannot become system instructions.
- “Full lesson coverage” means declared transcript segments and action-bearing intervals were processed; it does not mean every video frame was semantically understood.

## 9. WebMCP runtime architecture

Use a protocol adapter around domain services:

```ts
export interface CherryToolDefinition<I> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint?: boolean;
  };
  execute(input: I, signal: AbortSignal): Promise<CherryToolResult>;
}
```

Registration manager responsibilities:

- feature-detect `document.modelContext`;
- register the global and state-specific tool set;
- attach an `AbortController` to each tool lifecycle;
- abort old registrations after replacement;
- let in-flight executions finish where the current browser implementation supports it;
- listen for state changes without rerender loops;
- expose a diagnostic panel showing registered names and annotations;
- keep tool names at 30 characters or fewer, tool descriptions at 500 characters or fewer, and parameter descriptions at 150 characters or fewer;
- support local deterministic execution through the same definitions for tests;
- target each tool result at 1,500 characters or less; enforce an 8 KiB serialized hard cap and return IDs/summaries instead of bulk documents.

The primary production API is `document.modelContext.registerTool`. React helper packages may be used only behind an internal adapter; the app must not couple domain logic to an experimental hook.

## 10. Native MCP bridge

A small local stdio MCP server allows Claude Code/Codex to use Cherry workspace operations when WebMCP is not available. It must expose a narrower surface than the internal service layer and use the same JSON schemas.

Required capabilities:

- read current workspace summary;
- list missions/skills/runs;
- add evidence/observation to an explicit workspace;
- propose a SkillGraph version;
- write artifact files within an approved artifact set;
- run deterministic verification;
- compile a bundle;
- request, but never self-grant, an approval.

The server must not read unrelated files, environment variables, browser profiles, or credentials.

## 11. Local runner architecture

### Process model

```text
Studio UI ──pair token──> Runner localhost API
                             │
                             ├── persistent job queue
                             ├── scheduler
                             ├── deterministic adapters
                             ├── optional provider adapters
                             └── stdio MCP server
```

### Job contract

```ts
interface RunnerJob {
  id: string;
  workspaceId: string;
  missionId: string;
  adapter: 'cherry-verify' | 'cherry-export' | 'shell-safe' | 'codex-cli' | 'claude-cli';
  workingDirectory?: string;
  input: Record<string, unknown>;
  permissions: {
    allowedRoots: string[];
    network: 'none' | 'allowlist';
    allowedOrigins: string[];
    allowedExecutables: string[];
  };
  timeoutMs: number;
  maxAttempts: number;
  schedule?: { rrule: string; timezone: string };
}
```

### Safety

- listen only on `127.0.0.1`;
- rotate pairing tokens;
- exact-origin CORS;
- `spawn(executable, args, {shell:false})` only;
- canonicalize paths and reject escapes/symlink traversal from approved roots;
- close stdin for noninteractive provider processes unless input is intentionally supplied;
- terminate process trees on timeout/cancel;
- cap stdout/stderr and redact secret-like strings;
- provider exit code alone never marks a Cherry mission verified;
- one running job by default;
- explicit opt-in for network and each executable;
- no “full access” preset in the UI.

## 12. Provider adapters and honest autonomy

### ChatGPT/WebMCP

No API key. User signs in directly in the compatible ChatGPT desktop built-in browser and grants site-tool access. Tools exist only while the page is open.

### ChatGPT/Codex scheduled tasks

Cherry can export a tested task prompt and skill for eligible host scheduling. Local project tasks may require the machine and desktop app to remain on. Cherry displays those provider constraints rather than calling them Cherry Cloud.

### Codex CLI

The runner may call `codex exec` only after feature-detecting the installed version and authentication. Use a restricted working directory and sandbox. Because provider/tool failures may not always map cleanly to the wrapper exit status, parse structured output when available and always run Cherry’s deterministic acceptance tests.

### Claude CLI

The runner may call `claude -p` with explicit allowed tools and structured output. Programmatic usage on subscription plans can draw from a separate Agent SDK credit; show quota/provider errors and do not call it unlimited.

### Local models

Ollama/whisper.cpp are opt-in. Display model/download/hardware requirements. Never make release success depend on them.

## 13. Performance budgets

- initial route JavaScript target: under 250 KiB compressed where the existing stack permits;
- lazy-load graph editor, CodeMirror, and 3D/WebGL;
- no WebGL in the critical app shell;
- keep interaction tasks under 100 ms for normal local operations;
- virtualize transcripts/logs above 500 rows;
- debounce durable text writes but flush before navigation/unload where possible;
- no blocking hash of very large files on the main thread; use a worker;
- landing Largest Contentful Paint target under 2.5 seconds on a normal broadband laptop;
- no unbounded event or observation lists rendered at once.

## 14. Availability and graceful degradation

| Failure | Required behaviour |
|---|---|
| WebMCP unavailable | Manual product remains complete; diagnostic explains supported clients. |
| YouTube blocked/unavailable | Transcript/manual lesson mode remains available. |
| Transcript missing | User can paste/upload/enter notes; no fake transcript. |
| Agent disconnected | Mission/graph/evidence remain editable manually. |
| Runner off | Queue stays local as “waiting for runner”; no false running state. |
| Sync unavailable/paused | Local state continues; sync shows paused/error and retry/export. |
| Storage quota full | Offer encrypted export, workspace size report, and selective deletion. |
| Generated preview crashes | Isolate crash, show console error, keep Cherry usable. |
| Provider quota exhausted | Mark provider blocked; retain job and allow manual/other-adapter continuation. |

## 15. Five-day delivery envelope

### First 48 hours — complete core vertical product

- app shell and design system;
- local persistence and migrations;
- mission/evidence/watch workflow;
- dynamic WebMCP tools;
- SkillGraph/approval/versioning;
- artifact workspace;
- deterministic verifier;
- real skill/proof export and import;
- responsive key routes.

### Days 3–4 — autonomy, bridge, security, quality

- local runner and native MCP bridge;
- Memory Inbox/Vault and correction compiler;
- full empty/error/offline states;
- security hardening;
- tests, accessibility, and performance.

### Day 5 — release

- all route QA;
- clean public repository and license;
- deployment from a clean clone;
- accurate product copy;
- challenge submission materials;
- no new feature work after the release candidate is stable.

The required challenge video documents a real product. It does not justify building a demo-only mode.
