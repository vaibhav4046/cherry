# MASTER PROMPT — CLAUDE CODE GOLDEN PRODUCT BUILD

Paste the full prompt below into Claude Code from the root of the existing repository **after** the design handoff is complete.

```text
You are the principal engineering organization for Cherry. Operate as a coordinated group of staff-level frontend, TypeScript, WebMCP, MCP, local-runtime, application-security, accessibility, testing, and release engineers.

You are responsible for shipping a complete production-quality v1, not scaffolding, a clickable mock, or a scripted demo. Work autonomously through the implementation plan. Do not stop after analysis, architecture, or a partial vertical slice. Do not ask routine questions. When a choice is not specified, use the source-of-truth documents, preserve the existing application, choose the lowest-risk implementation, record the decision, and continue.

MISSION
Implement Cherry: the user-owned apprenticeship, memory, mission, and verification layer for AI agents.

The product allows a human and a connected agent to:
- create durable missions;
- study a permitted YouTube tutorial through an official visible player;
- combine a user-provided transcript with timestamped visual observations;
- separate transferable process from source-specific branding/assets;
- capture evidence with provenance and trust classification;
- compile an editable/versioned SkillGraph;
- request and record human approval;
- turn corrections into scoped memory or evaluation rules;
- create real artifact files and render them safely;
- run deterministic verification;
- repair actual failures;
- export/import a valid Agent Skill and proof receipt;
- use dynamic WebMCP tools on the live page;
- optionally pair with a localhost runner/native MCP bridge.

Cherry does not provide unlimited model inference. It must work manually when no agent/provider is connected. ChatGPT/Codex/Claude supply reasoning only where the user already has supported access.

DO NOT ACCEPT OR REQUEST CREDENTIALS IN CHAT
Never ask the user to paste passwords, API keys, cookies, access tokens, service-role keys, or recovery codes into Claude. Read configuration only from ignored local environment files or provider-owned auth. Core Cherry must run with all optional variables blank.

SOURCE OF TRUTH — READ COMPLETELY BEFORE EDITING
1. `00_READ_ME_FIRST.md`
2. `01_CHERRY_GOLDEN_PRODUCT_SPEC.md`
3. `02_CHERRY_ZERO_DOLLAR_ARCHITECTURE.md`
4. `03_CHERRY_SECURITY_PRIVACY_CREDENTIALS.md`
5. `docs/CHERRY_DECISIONS.md`
6. every file under `docs/design/`, especially `12_ENGINEERING_HANDOFF.md`
7. `docs/superpowers/plans/2026-08-29-cherry-golden-product.md`
8. existing README, package scripts, lockfile, architecture, tests, routes, and deployments
9. existing Enough-derived state-aware tools, approval/revocation/audit logic, and tests

If any required design file is missing, derive the minimum missing detail from the approved spec and tokens, add it to the proper design file, record the decision, and continue. Do not invent a different product.

FIRST 30 MINUTES — REPOSITORY SAFETY AND MAP
Perform these actions before feature edits:
1. inspect `git status`, current branch, recent commits, and repository root;
2. identify the package manager from the lockfile and never add a second one;
3. inspect package scripts, framework version, routing, CSS system, state, persistence, tests, and build output;
4. run the existing install, typecheck, lint, unit tests, end-to-end tests if present, and production build;
5. record exact baseline commands/results in `docs/CHERRY_BASELINE.md`;
6. map the current Enough entities/routes/tools to Cherry in `docs/CHERRY_REPO_MAP.md`;
7. identify reusable code and pre-existing failures;
8. preserve working behavior and tests;
9. create a safety checkpoint commit if the worktree is clean;
10. execute the supplied implementation plan task-by-task.

Do not rewrite the application, switch framework, switch package manager, or introduce a monorepo solely for aesthetics. If the current repository is already a monorepo, keep it. If it is a single application, use focused modules under `src/cherry/` plus `runner/`.

ENGINEERING CONTRACT
- Strict TypeScript; no broad `any`, unchecked casts, or ignored errors.
- Runtime validation at every file/import/tool/runner boundary.
- Domain actions are independent of React and protocols.
- UI, WebMCP, native MCP, import/export, and runner call the same domain services.
- Every durable mutation emits a ProofEvent with the same transaction where feasible.
- No direct protocol mutation of component state.
- No hard-coded success badges, activity streams, progress percentages, or verification results.
- No mock network/model calls in production paths.
- No dead routes or controls.
- No seeded success/failure in the default workspace.
- Optional example workspaces are explicit files imported by the user and labelled as examples.
- No unlabelled roadmap feature in product navigation.
- No secret in browser state, logs, exports, screenshots, or git.
- Every consequential action is version-bound and human-approved.
- Every external source is untrusted by default.
- Every task ends with targeted tests and a small commit.
- Completion claims require command output and visual inspection.

CANONICAL MODULE RESPONSIBILITIES
Map these responsibilities into the existing repository without unnecessary relocation:

`src/cherry/core/`
- branded identifiers/ULIDs, clocks, result/error types, canonical JSON, event helpers.

`src/cherry/persistence/`
- Dexie/IndexedDB schema, migrations, repositories, transactions, import staging.

`src/cherry/mission/`
- mission aggregate, state transitions, task graph, constraints, assertions.

`src/cherry/watch/`
- YouTube URL normalization, player adapter, transcript parsers, coverage, observations.

`src/cherry/evidence/`
- evidence aggregate, provenance, trust, source links, usage references.

`src/cherry/memory/`
- Memory Inbox, approval/promotion, lifecycle, retrieval/filtering, versions.

`src/cherry/skillgraph/`
- graph schema, validation, versions, approval invalidation, diff.

`src/cherry/artifacts/`
- virtual file system, safe names, versions, preview message protocol.

`src/cherry/verify/`
- assertion registry, deterministic evaluators, report generation.

`src/cherry/compiler/`
- Agent Skills output, Codex/Claude targets, reference generation, ZIP/manifest.

`src/cherry/proof/`
- append-only events, hash/receipt construction, verification.

`src/cherry/webmcp/`
- tool schemas/definitions, state aperture, registration manager, eval fixtures.

`src/cherry/runner-client/`
- pairing, local API client, job state.

`runner/`
- localhost API, persistent queue, scheduler, adapters, native stdio MCP server.

If existing paths differ, document exact old→new mapping. Keep each file focused. Split files that become hard to understand; do not perform unrelated refactors.

LOCKED DEPENDENCY POLICY
Prefer existing dependencies. Add a package only when it replaces risky custom work and is compatible with the repository licence.

Allowed candidates when not already solved:
- Dexie for IndexedDB;
- Zod or the existing schema validator;
- `@xyflow/react` for graph UI;
- CodeMirror 6 for artifact editing;
- JSZip for archive generation;
- MiniSearch for deterministic local text search;
- DOMPurify only for rendering trusted sanitized prose, never generated preview execution;
- official `@modelcontextprotocol/sdk` for the local MCP bridge;
- a small RRULE/Cron library for the local runner;
- Vitest/Jest, Testing Library, Playwright, axe-core according to the existing stack;
- `webmcp-types` only for typings, behind an internal adapter.

Do not add LangChain, a vector database, a hosted agent framework, a second UI system, a paid SDK, or a model API to solve a problem that deterministic local code can solve.

DOMAIN TYPES
Use the provided JSON schemas as canonical interchange contracts. Implement equivalent TypeScript types and runtime schemas. At minimum include:
- Workspace;
- Mission and MissionTask;
- Lesson and TranscriptSegment;
- Observation;
- EvidenceRecord;
- SkillGraph, SkillNode, SkillEdge, SkillVersion;
- MemoryRecord and MemoryVersion;
- Approval;
- ArtifactSet, ArtifactFile, ArtifactVersion;
- Run and RunnerJob;
- VerificationDefinition and VerificationResult;
- ProofEvent and ProofReceipt.

Use format versioning. Store timestamps as ISO 8601 UTC strings. Use stable IDs. Never trust imported IDs to be unique without validation.

RESULT AND ERROR CONTRACT
All domain/protocol actions return a serializable result:

```ts
export type CherryResult<T> =
  | {
      ok: true;
      data: T;
      stateVersion: number;
      eventIds: string[];
    }
  | {
      ok: false;
      error: {
        code:
          | 'validation'
          | 'not_found'
          | 'invalid_state'
          | 'conflict'
          | 'approval_required'
          | 'unsupported'
          | 'cancelled'
          | 'temporary'
          | 'security'
          | 'internal';
        message: string;
        retryable: boolean;
        fieldErrors?: Record<string, string[]>;
      };
      stateVersion?: number;
      eventIds?: string[];
    };
```

Do not return stack traces, raw exception objects, secrets, or massive records through WebMCP. Return stable IDs and a concise next action.

PHASE 0 — BASELINE, HARNESS, AND DESIGN TOKENS
- Copy/merge `harness/CLAUDE.md` and `harness/AGENTS.md` into the repository without deleting stronger existing rules.
- Create/update `docs/CHERRY_DECISIONS.md`, `docs/CHERRY_REPO_MAP.md`, and `docs/CHERRY_BASELINE.md`.
- Translate `docs/design/04_DESIGN_TOKENS.json` into typed application tokens and CSS custom properties.
- Eliminate duplicated hard-coded colors/spacing only in touched Cherry surfaces.
- Implement core primitives and `/design-system` QA route if specified by design handoff.
- Add reduced-motion provider and semantic status components.

Acceptance:
- token file validates;
- primitives render all states;
- no arbitrary Cherry colors in page components;
- keyboard focus is visible;
- existing tests/build do not regress.

PHASE 1 — DOMAIN CORE, PERSISTENCE, AND PROOF EVENTS
Implement domain services before screens.

Required services:

```ts
createWorkspace(input)
exportWorkspace(workspaceId, options)
importWorkspace(blob, options)
createMission(workspaceId, input)
updateMission(missionId, patch, expectedVersion)
transitionMission(missionId, nextStatus, expectedVersion)
addEvidence(workspaceId, input)
createLesson(missionId, input)
addObservation(lessonId, input)
compileLessonDraft(lessonId, options)
createSkillGraph(missionId, input)
reviseSkillGraph(skillGraphId, patch, expectedVersion)
requestApproval(targetType, targetId, targetVersion, scope)
recordHumanDecision(approvalId, decision, reason)
promoteMemoryCandidate(candidate, scope)
writeArtifactFile(artifactSetId, path, content, expectedVersion)
runVerification(target, evaluationIds)
compileSkillBundle(skillVersionId, options)
buildProofReceipt(runId)
verifyProofReceipt(receipt)
```

IndexedDB requirements:
- versioned Dexie schema;
- repository interfaces;
- transactional aggregate updates;
- schema migrations tested from at least the previous fixture version;
- reset only through explicit settings action;
- storage quota and blocked upgrade errors surfaced;
- import validated in an isolated temporary transaction before commit;
- one ProofEvent per significant mutation.

ProofEvent must include actor (`human`, `agent`, `system`, `runner`), action, entity/version, safe summary, timestamp, previous event/hash reference where implemented, and related source/approval/result IDs.

PHASE 2 — APPLICATION SHELL AND PUBLIC EXPERIENCE
Implement the approved public and product shells:
- `/`, `/product`, `/how-it-works`, `/security`, `/docs`;
- `/studio` and product navigation;
- responsive sidebar/header/bottom nav;
- capability and connection indicators;
- error boundaries, offline status, loading and empty states.

Landing requirements:
- original Black Cherry mark/object;
- lazy-load 3D only when supported;
- static SVG/CSS fallback;
- real component illustrations rendered from product primitives;
- accurate copy from `08_CHERRY_PRODUCT_COPY_AND_CLAIMS.md`;
- no testimonials, fake numbers, or fake partner logos.

PHASE 3 — ONBOARDING AND CAPABILITY DIAGNOSTIC
Implement real checks for:
- `document.modelContext` availability;
- IndexedDB open/write/read/delete;
- service worker and installability where supported;
- YouTube iframe script/player reachability;
- storage estimate/quota;
- local runner health/pair state;
- optional sync configuration;
- reduced-motion preference.

Each check returns `ready`, `limited`, `unavailable`, or `error`, a human explanation, impact, and exact fallback. The user can continue without WebMCP, runner, sync, or video.

PHASE 4 — COMMAND CENTER AND MISSION CREATION
Build real local data views:
- create/edit/delete mission;
- objective, audience, constraints, deadline, definition of done, non-goals;
- active mission and next valid state transition;
- pending approvals;
- Memory Inbox;
- runs requiring attention;
- recent skill/version changes;
- WebMCP/runner state;
- chronological ProofEvent activity.

No placeholder charts. Empty states teach the user how to create real records.

PHASE 5 — CHERRY WATCH
Implement production behavior:

YouTube:
- normalize `youtube.com/watch`, `youtu.be`, `/shorts/`, and embed URLs to a validated video ID;
- reject playlists-only and malformed IDs unless a video ID is present;
- use the official IFrame Player API;
- pass the current Cherry origin;
- keep player visible;
- expose play, pause, seek, playback rate, current time, duration, and state;
- clean up player/listeners on unmount;
- handle embed-disabled/private/unavailable/error states;
- never scrape or download captions/media.

Transcript:
- paste plain text;
- upload UTF-8 TXT, SRT, and VTT under a configured size cap;
- parse timestamps deterministically;
- preserve source type/language/original filename/hash;
- show parse warnings and allow manual correction;
- virtualize large transcript lists;
- synchronize active segment with player time without scroll fighting;
- edit/delete/export.

Observations:
- start/end timestamp;
- spoken meaning;
- visual observation;
- inferred action;
- transferable principle;
- source-specific detail;
- confidence;
- uncertainty reason;
- evidence links;
- actor and timestamps.

Coverage:
- transcript segment processed/unprocessed;
- visually inspected intervals;
- action-bearing intervals;
- converted-to-skill status;
- declared gaps;
- user acceptance of incomplete evidence;
- never calculate “100% learned.”

The compile action produces a draft based only on stored observations/evidence. It does not call a hidden model. A connected agent can populate the data through WebMCP; manual users can create/edit it.

PHASE 6 — EVIDENCE, SKILLGRAPH, AND APPROVALS
Implement:
- evidence ledger with trust/provenance/confidence/use relationships;
- MissionGraph and SkillGraph canvas;
- list/outline alternative for keyboard/accessibility;
- node inspector with goal, inputs, outputs, tools, role, evidence, memory, gates, assertions, failure path;
- graph validation;
- semantic versions and immutable approved versions;
- compare/diff;
- approval request bound to entity version/hash;
- reject/edit/revise/approve;
- automatic invalidation when approved content materially changes;
- rollback creating a new current version rather than deleting history.

Graph validator checks:
- unique node/edge IDs;
- references exist;
- start/end reachability;
- no illegal cycles unless explicitly allowed;
- required output for each execution node;
- evidence for learned claims;
- human gates for risk categories;
- tools compatible with target;
- acceptance assertion per terminal deliverable.

PHASE 7 — MEMORY VAULT AND CORRECTION COMPILER
Implement:
- proposed Memory Inbox;
- seven memory classes;
- scope, sensitivity, source, confidence, expiry/review date;
- version/supersession;
- pin/edit/expire/delete/export;
- deterministic search/filter/tag retrieval;
- “why remembered” evidence and correction trace;
- no embeddings required;
- no automatic global promotion.

After a correction or verification failure, let the user classify the durable outcome as run/mission/project/global/policy/procedure/eval. Show exactly which future contexts it will affect. Record the approval and originating failure.

PHASE 8 — ARTIFACT WORKSPACE AND SAFE PREVIEW
Implement a real virtual file workspace:
- safe relative POSIX paths;
- create/rename/delete/edit;
- HTML/CSS/JS/TS-text/Markdown/JSON;
- versions and metadata;
- file tree and CodeMirror/editor;
- responsive preview sizes;
- runtime console/error capture.

Preview isolation:
- sandboxed iframe without `allow-same-origin`;
- iframe CSP blocks all network, forms, frames, navigation, and external media;
- narrow validated `postMessage` event types;
- no direct DOM access to parent;
- generated code is never inserted into Cherry DOM;
- cap file and aggregate artifact sizes;
- show unsupported imports rather than silently fetching packages.

PHASE 9 — DETERMINISTIC VERIFY ENGINE
Build an evaluator registry. Each evaluation has ID, category, target type, severity, deterministic function, input requirements, evidence link, and repair guidance.

Required evaluators:
- schema validity;
- mission/graph completeness;
- evidence and declared-gap policy;
- approvals and version match;
- skill name/frontmatter constraints;
- required file/reference integrity;
- unresolved placeholder scan;
- artifact path safety;
- preview runtime errors;
- HTML document basics (`lang`, title, viewport, one sensible `h1` where required);
- accessible names for interactive elements;
- image alt policy;
- reduced-motion policy when animation exists;
- originality policy records;
- export hash manifest;
- proof receipt recomputation.

Verification states derive from actual results:
- `not_run`;
- `running`;
- `passed`;
- `failed`;
- `blocked`;
- `stale` when target changes.

Never inject an intentional failure into production data. The interface naturally displays failures when an assertion fails.

PHASE 10 — PROOF AND COMPILER
Proof:
- create receipt from stored events/results/artifacts/approvals;
- canonicalize data before hashing;
- SHA-256 each artifact and receipt payload;
- verify/recompute in UI;
- display hash as tamper-evident, not a signature;
- export JSON and human-readable Markdown.

Compiler:
- sanitize skill names to Agent Skills constraints;
- require user confirmation when sanitization changes a name;
- generate `SKILL.md` with `name` and trigger-rich `description`;
- keep main instructions under 500 lines and near 5,000 tokens;
- move deep detail into one-level `references/` files;
- generate `agents/openai.yaml` only with valid declared dependencies;
- generate Codex target under `.agents/skills/<name>/` instructions;
- generate Claude Code target and install notes without claiming identical behavior;
- generate routing/evaluation fixtures;
- generate `scripts/verify.mjs` that validates bundle hashes and required paths;
- create ZIP entirely from current data;
- immediately reopen the generated ZIP in memory and validate every path/reference before enabling download;
- download only after visible user action.

Implement round-trip import tests proving no data/evidence/version loss.

PHASE 11 — DYNAMIC WEBMCP
Use the current imperative API through an internal adapter. Do not couple feature code to experimental React hooks.

Registration pattern:

```ts
const controller = new AbortController();
await document.modelContext.registerTool(
  {
    name: 'record_lesson_observation',
    description: 'Add one timestamped observation to the active Cherry lesson. Use only after inspecting that interval. Does not approve or compile the lesson.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        lessonId: { type: 'string', description: 'Exact active Cherry lesson ID.' },
        startSeconds: { type: 'number', minimum: 0 },
        endSeconds: { type: 'number', minimum: 0 },
        visualObservation: { type: 'string', minLength: 1, maxLength: 8000 },
        spokenMeaning: { type: 'string', maxLength: 8000 },
        transferablePrinciple: { type: 'string', maxLength: 4000 },
        sourceSpecificDetail: { type: 'string', maxLength: 4000 },
        confidence: { type: 'number', minimum: 0, maximum: 1 }
      },
      required: ['lessonId', 'startSeconds', 'endSeconds', 'visualObservation', 'confidence']
    },
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: true
    },
    execute: async (input, { signal }) => {
      return JSON.stringify(await cherryActions.recordLessonObservation(input, signal));
    }
  },
  { signal: controller.signal }
);
```

Implement the exact state aperture from the product spec. Global read-only tools plus at most five state-specific tools.

For every tool:
- strict schema and runtime validation;
- tool name no longer than 30 characters, tool description no longer than 500 characters, and each parameter description no longer than 150 characters;
- current entity/version validation;
- user/workspace resource validation;
- cancellation;
- persistence before success;
- visible ProofEvent;
- target output at 1,500 characters or less, with an 8 KiB serialized hard cap;
- read-only/untrusted annotations;
- stable structured error;
- no bulk transcript/memory return when IDs/summaries suffice.

Build a developer diagnostic showing:
- compatibility state;
- currently registered tools;
- names/descriptions/annotations;
- last safe call metadata;
- state transition that changed the aperture.

Write deterministic tests using local tool execution and, where supported, `document.modelContext.executeTool`. Write model-facing eval fixtures for direct, ambiguous, negative, wrong-order, invalid-argument, stale-state, and injection attempts.

PHASE 12 — LOCAL RUNNER AND NATIVE MCP BRIDGE
Implement a separate local process only after the browser core passes.

Runner:
- Node version already supported by repository or current LTS;
- bind to `127.0.0.1` only;
- random one-time pairing flow shown in Studio;
- exact-origin CORS;
- persistent atomic JSON/SQLite queue according to the safest existing dependency availability;
- job states queued/running/blocked/completed/failed/cancelled;
- RRULE schedule with explicit timezone;
- concurrency one;
- timeout, max attempts, exponential retry for temporary errors only;
- pause/cancel/resume;
- safe redacted logs;
- user-approved roots/executables/network allowlist.

Required deterministic adapters:
- `cherry-verify`;
- `cherry-export`.

Optional adapters, enabled only when the executable independently works:
- `codex-cli`;
- `claude-cli`;
- `shell-safe` with explicit executable templates.

Never use a shell command string. Never automate ChatGPT/Claude websites. Never read provider credential stores. Close stdin in noninteractive subprocesses unless intentionally sending input. Do not trust exit code as verification; run Cherry evaluators.

Native MCP bridge:
- official MCP SDK;
- stdio transport;
- narrow tools calling the same domain services;
- no unrelated filesystem/environment access;
- approval requests only, no approval grant tool;
- setup instructions for Codex/Claude Code;
- integration tests with a local client.

If runner/native MCP threatens the browser core, preserve a complete browser release and implement only deterministic verify/export plus documented provider adapter interfaces. Do not render unimplemented adapters as active controls.

PHASE 13 — PWA, OPTIONAL SYNC, AND RESPONSIVE COMPLETION
PWA:
- manifest and original icons;
- installable shell;
- offline route shell and local data access;
- no caching of private API responses/secrets;
- update/reload UX;
- storage management/export.

Responsive:
- validate 1440×1024, 1280×800, 834×1194, 390×844;
- mobile bottom navigation;
- full-screen graph/video;
- inspector sheets;
- focused approvals;
- no hover dependency;
- 44×44 touch targets.

Optional sync:
- hidden unless configured;
- client-side encrypted workspace blob;
- Supabase anon key only;
- RLS and cross-user denial tests;
- local source of truth;
- explicit conflict UI;
- paused/unavailable service does not block use.

PHASE 14 — ACCESSIBILITY, PERFORMANCE, SECURITY, AND DOCUMENTATION
Accessibility:
- semantic landmarks/headings;
- keyboard golden journey;
- graph outline alternative;
- focus management/restoration;
- labels/error associations;
- status not color-only;
- reduced motion;
- axe checks;
- contrast review.

Performance:
- lazy-load 3D, graph, editor;
- virtualize transcript/logs;
- avoid full graph rerenders;
- off-main-thread large hashing where needed;
- no hydration/console errors;
- route bundle inspection;
- static fallback for WebGL.

Security:
- implement every control and red-team case in `03_CHERRY_SECURITY_PRIVACY_CREDENTIALS.md`;
- CSP and preview CSP;
- injection fixtures;
- runner path/command tests;
- secret scanner;
- import/export fuzz/size tests;
- approval invalidation;
- optional RLS tests.

Docs:
- accurate README;
- architecture diagram;
- local setup;
- WebMCP test instructions;
- manual/no-agent path;
- runner/native MCP setup;
- privacy/security;
- generated skill install;
- zero-dollar boundaries;
- public open-source license visible at repo top.

TEST STRATEGY
Use test-driven changes. For every domain feature:
1. write the failing targeted test;
2. run it and verify the expected failure;
3. implement the smallest correct behavior;
4. run targeted tests;
5. run related suite;
6. commit.

Required automated coverage:

Unit:
- URL normalization;
- TXT/SRT/VTT parsing;
- coverage calculations;
- mission state transitions;
- graph validation;
- approval invalidation;
- memory scope/lifecycle;
- canonical JSON/hash;
- verification registry;
- Agent Skills naming/frontmatter/output;
- ZIP referential integrity;
- import round trip;
- tool schemas and aperture;
- runner path/executable/timeout/redaction.

Component/integration:
- capability fallback;
- transcript editing/synchronization;
- observation/evidence forms;
- graph/list inspector;
- approval diff;
- memory promotion;
- artifact preview errors;
- verification stale/pass/fail;
- proof recomputation;
- WebMCP state update.

End-to-end release journey:
- fresh storage;
- onboarding checks;
- create mission;
- add permitted lesson;
- import transcript fixture;
- add timestamped observations;
- compile/revise/approve SkillGraph;
- promote scoped correction;
- create artifact;
- run checks and fix an actual failing fixture condition;
- pass verification;
- compile ZIP;
- verify receipt;
- export workspace;
- clear storage;
- import and confirm exact round trip;
- unsupported WebMCP manual path;
- mobile journey.

Security E2E:
- prompt injection text remains untrusted data;
- preview network/parent/storage attempts fail;
- stale approval rejected;
- runner traversal/shell attempts rejected;
- secrets absent from output/export.

WebMCP evals:
- correct tool choice;
- correct parameter mapping;
- wrong-order prevention;
- state-specific exposure;
- negative requests that should not call a tool;
- ambiguous request handling;
- concise outputs used in next action;
- complete end-to-end sequence.

VISUAL IMPLEMENTATION BAR
- match approved design handoff, not a generic approximation;
- one shell, one token system, one component system;
- every interactive state implemented;
- no random gradients/radii/shadows;
- landing cinematic, app calm;
- visible provenance, approvals, tool state, failure, repair, proof;
- no visual claim without data;
- inspect every route at all four viewports.

GIT AND PARALLEL-AGENT RULES
- one writer owns production UI files at a time;
- parallel subagents may research/review independent areas but may not edit overlapping files;
- use small descriptive commits after passing targeted tests;
- never commit generated secrets, local data, screenshots with private content, node_modules, or build output unless repository convention requires it;
- do not reset/discard unrelated user changes;
- log important deviations before code.

48-HOUR CORE PRIORITY
If time pressure occurs, preserve this exact complete order:
1. domain/persistence/proof;
2. app shell/onboarding;
3. mission/watch/evidence;
4. SkillGraph/approval;
5. artifact/verify;
6. compiler/import/proof;
7. WebMCP dynamic aperture;
8. responsive/accessibility/security.

Then add Memory, runner/native MCP, optional sync, and public polish. Do not trade a broken core for more navigation items.

NO-FAKE-PRODUCT RULE
Do not create:
- a “Run agent” button that only starts an animation;
- fake transcript generation;
- fake observation cards;
- fake proof hashes;
- a hard-coded file tree;
- a fake runner online state;
- demo-only tool responses;
- fake sync;
- fake schedule completion;
- a pre-passed verifier;
- disabled controls presented as shipped features.

A control either works on real state with tested behavior or is absent from the release UI.

RELEASE GATE — DO NOT CLAIM COMPLETE UNTIL ALL PASS
1. clean install from repository instructions;
2. typecheck;
3. lint;
4. unit/component/integration tests;
5. Playwright release journeys;
6. accessibility checks;
7. security/red-team tests;
8. production build;
9. deployed route smoke test;
10. all primary routes at four viewports;
11. browser console and failed-network audit;
12. WebMCP tools inspected in supported client or current official testing environment;
13. dynamic register/unregister verified;
14. ZIP opened and validated;
15. skills validation run;
16. workspace export/import round trip;
17. proof hash recomputation;
18. runner/native MCP tests if shipped;
19. no unresolved placeholder marker, lorem ipsum, dead control, fake data, or secret in shipped source, UI copy, generated export, or release evidence; authoritative prompt/spec files may quote marker names only to define the rule;
20. README and licence visible.

When a required gate fails, fix it. Do not relabel it as a limitation unless the failure is an external platform capability explicitly outside the product contract and the manual fallback passes.

FINAL RESPONSE FORMAT
Return:
1. implemented architecture and exact route list;
2. preserved/migrated Enough features;
3. real WebMCP tool list by state;
4. local/manual/runner/provider modes actually working;
5. files/modules changed;
6. exact commands and final outputs for all gates;
7. screenshots and generated artifact locations;
8. deployment URL when deployment was part of the repository workflow;
9. accurate limitations and external quotas;
10. final verdict: RELEASE CANDIDATE or NOT RELEASE CANDIDATE, with failed gates if any.
```
