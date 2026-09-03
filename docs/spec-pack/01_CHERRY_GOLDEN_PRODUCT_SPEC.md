# CHERRY — GOLDEN PRODUCT SPECIFICATION v2.0

## 1. Product identity

### Name

**Cherry**

### Category

**The apprenticeship and operating layer for user-owned AI workforces.**

### One-line pitch

**Cherry watches how useful work gets done, turns the process into trusted memory and portable skills, then gives the agents you already use a mission they can execute and prove.**

### Hero statement

**Your agents should not start from zero.**

### Product line

**Teach once. Cherry remembers. Every agent gets better.**

### Core loop

```text
WATCH / READ / OBSERVE
          ↓
UNDERSTAND AND STRUCTURE
          ↓
APPROVE THE SKILLGRAPH
          ↓
EXECUTE THROUGH AN AGENT
          ↓
VERIFY THE RESULT
          ↓
TURN CORRECTIONS INTO MEMORY
```

## 2. Problem

People repeatedly teach AI agents the same preferences, project context, procedures, quality standards, and corrections. Useful work disappears into chat transcripts. Tool catalogues become noisy. Internet and tutorial content is untrusted. Agents claim completion without deterministic proof. A workflow that succeeds in one product is difficult to inspect, version, transfer, or rerun elsewhere.

Cherry addresses five concrete failures:

1. **Workflow amnesia** — the process and corrections vanish between sessions.
2. **Tool overload** — agents see too many overlapping tools and choose badly.
3. **Untrusted learning material** — webpages, transcripts, repositories, and tool outputs can contain malicious or irrelevant instructions.
4. **Unsafe autonomy** — users cannot see or gate consequential decisions.
5. **Unverifiable completion** — a plausible final answer is treated as proof.

## 3. Target user and jobs

### Primary user

A developer, designer, founder, researcher, or AI power user who repeatedly completes complex digital work with ChatGPT, Codex, Claude Code, or MCP-enabled tools.

### Primary jobs

- “Learn the transferable process from this permitted tutorial without copying the creator’s brand or assets.”
- “Remember how I work and stop making me repeat the same correction.”
- “Turn this successful collaboration into a skill another compatible agent can use.”
- “Plan a mission, expose only the correct tools, and stop for approval at meaningful decisions.”
- “Continue work through a supported schedule or my local machine without paying for a new AI API.”
- “Show me exactly what was used, changed, failed, repaired, and exported.”

## 4. Product truth model

Cherry has four execution modes. The interface must identify the active mode and never blur the boundaries.

| Mode | What is real | Availability claim |
|---|---|---|
| **Attached WebMCP** | ChatGPT/Codex works with Cherry’s live open page through dynamically registered site tools. | Works only in a compatible client while the relevant page is open. |
| **Portable Skill** | Cherry exports a standards-aligned Agent Skill plus host-specific instructions. | Works where that host supports the generated target and required tools. |
| **Local Runner** | A local Node process schedules deterministic jobs and optional Codex/Claude CLI adapters. | Runs only while the computer and runner are on; provider quotas still apply. |
| **Optional Sync/Cloud Adapter** | Encrypted workspace blobs can be stored through a user-configured provider. | Best-effort free-tier capability, not a service-level guarantee. |

Cherry must never claim that a consumer subscription is an API, that every host implements WebMCP, or that $0 infrastructure supplies unlimited model inference.

## 5. Product modules

### 5.1 Cherry Studio

The responsive PWA and shared visual control plane. It is not an embedded chatbot. The human and agent operate the same underlying workspace state.

Studio contains:

- Command Center;
- Missions;
- Cherry Watch;
- Evidence Ledger;
- SkillGraph;
- Memory Vault;
- Skills Library;
- Artifact Workspace;
- Runs and Runner;
- Approvals;
- Verification;
- Proof;
- Connections and privacy settings.

### 5.2 Cherry Watch

A controlled apprenticeship workspace for a permitted YouTube video or user-owned/uploaded lesson material.

It must support:

- safe parsing of standard YouTube URLs and video IDs;
- an official visible YouTube iframe player;
- playback, pause, seek, speed, duration, and state tracking;
- transcript paste and `.txt`, `.srt`, `.vtt` upload;
- transcript-source labels: user text, creator-authorized captions, local transcription, unknown;
- timestamped observations;
- a distinction between spoken knowledge and visual observation;
- a distinction between transferable principles and source-specific details;
- uncertainty and uninspected-gap states;
- a coverage map that cannot reach “complete” without declared evidence criteria;
- user editing, deletion, export, and permission acknowledgement.

It must not scrape, download, cache, hide, or re-host arbitrary YouTube audiovisual content or captions.

### 5.3 Evidence Ledger

Each important claim or learned step is stored as an evidence record containing:

- source type and URL/video timestamp;
- title and creator when known;
- claim or observation;
- provenance method;
- trust classification;
- confidence;
- which SkillGraph node or decision uses it;
- created/updated timestamps;
- edit and delete history.

All internet, transcript, repository, webpage, and tool-output material defaults to `untrusted` until a person explicitly changes the trust classification.

### 5.4 MissionGraph

A mission is a durable, dependency-aware plan. Each mission contains:

- objective;
- constraints;
- definition of done;
- non-goals;
- tasks;
- dependencies;
- agent role;
- required memory;
- allowed tools;
- inputs and outputs;
- risk level;
- human gates;
- deterministic acceptance assertions;
- retries and rollback target;
- status history.

Mission states:

```text
DRAFT → LEARNING → PLANNING → AWAITING_APPROVAL
      → EXECUTING → VERIFYING → COMPLETE
                   ↘ BLOCKED / CANCELLED
```

Invalid state transitions must be rejected in both UI and tool execution.

### 5.5 SkillGraph

SkillGraph is Cherry’s vendor-neutral intermediate representation. It is not a claim that model behaviour becomes identical across hosts.

Every skill contains:

- trigger and non-trigger descriptions;
- input and output schemas;
- ordered or dependency-based nodes;
- evidence references;
- memory selectors;
- required tools;
- explicit permissions;
- guardrails;
- human gates;
- failure handling;
- evaluation definitions;
- compilation targets;
- semantic version;
- immutable version hash.

### 5.6 Memory Vault

Memory is explicit, inspectable, source-linked, scoped, and user-controlled.

Supported memory classes:

- `identity` — stable facts the user approved;
- `preference` — style, tone, defaults, and personal choices;
- `project` — repository, product, team, and mission context;
- `procedure` — repeatable steps;
- `correction` — what failed and the approved fix;
- `policy` — actions or data uses that are blocked or require approval;
- `episode` — a past run and its outcome.

Every record needs:

- source/provenance;
- confidence;
- sensitivity (`public`, `private`, `sensitive`);
- scope (`global`, `workspace`, `project`, `mission`, `run`);
- expiry or review date;
- version history and supersession relationship;
- last-used timestamp;
- pin/edit/delete/export controls.

No memory may silently move from untrusted source text into global instructions. The Memory Inbox presents proposed records for approval.

### 5.7 Correction Compiler / Cherry Reflex

After a correction, Cherry asks the user to classify it as:

- one-run instruction;
- mission rule;
- project preference;
- global preference;
- safety policy;
- procedure update;
- evaluation assertion.

The resulting record links back to the failed run and evidence. It affects future work only within its approved scope.

### 5.8 Artifact Workspace

A small real file workspace supports at minimum:

- HTML;
- CSS;
- JavaScript/TypeScript text;
- Markdown;
- JSON.

Features:

- file tree;
- create, rename, delete, edit;
- versions and diff metadata;
- sandboxed HTML preview;
- console/runtime error capture;
- size limits;
- import/export;
- association with a mission task and proof events.

The preview must be isolated from Cherry’s origin and network by sandbox and Content Security Policy.

### 5.9 Cherry Verify

Verification is deterministic wherever possible. It must test actual state and artifacts, not ask the same agent whether it succeeded.

Core checks:

- schema validity;
- allowed state transition;
- required evidence coverage;
- approval presence and version match;
- graph completeness and acyclicity where required;
- required files and references;
- no unresolved placeholder markers or lorem ipsum in shipped source, UI copy, generated exports, or release evidence; authoritative specification files may quote marker names only when defining this rule;
- valid Agent Skills frontmatter and naming;
- preview runtime errors;
- required DOM assertions;
- accessibility basics;
- policy and originality assertions;
- export referential integrity;
- SHA-256 artifact hashes;
- run timeouts and output limits.

A verification badge is shown only from stored evaluation results. It cannot be manually toggled.

### 5.10 Cherry Compiler

Cherry generates a real archive from current state:

```text
<skill-name>/
├── SKILL.md
├── cherry.json
├── skillgraph.json
├── mission.json
├── receipt.json
├── agents/
│   └── openai.yaml
├── references/
│   ├── evidence.md
│   ├── transcript.md
│   ├── observations.json
│   ├── principles.md
│   └── memory-policy.md
├── policies/
│   ├── approvals.md
│   ├── originality.md
│   └── safety.md
├── evals/
│   ├── routing-cases.json
│   └── acceptance-tests.json
├── scripts/
│   └── verify.mjs
└── targets/
    ├── codex/
    │   ├── AGENTS.md
    │   └── install.md
    └── build-lane/
        ├── CLAUDE.md
        ├── install.md
        ├── hooks.example.json
        └── agents/
```

The canonical `SKILL.md` must follow the Agent Skills specification, remain below 500 lines and approximately 5,000 tokens where practical, use a directory name that matches the skill name, and place deep reference material in one-level-deep resource files.

### 5.11 Cherry Runtime and native MCP bridge

The browser registers WebMCP tools on the top-level Cherry page. A local optional MCP bridge exposes equivalent narrow capabilities to Claude Code/Codex through the official MCP SDK. Both surfaces call the same validated domain functions so behaviour does not drift.

### 5.12 Local Cherry Runner

A localhost-only runner provides durable queues, timeouts, retries, schedules, and optional provider adapters.

Required v1 adapters:

- `cherry-verify` — deterministic verification;
- `cherry-export` — compile bundles;
- `shell-safe` — execute an explicit allowlisted executable with argument arrays, never a shell string;
- `codex-cli` — optional, only when installed and authenticated by the user;
- `claude-cli` — optional, only when installed and entitled by the user.

The runner must:

- bind to `127.0.0.1` only;
- pair with a random one-time token;
- restrict working directories to user-approved roots;
- cap output and execution duration;
- default concurrency to one;
- support pause, cancel, retry, and resume;
- persist jobs atomically;
- never dump environment variables;
- never automate consumer web interfaces;
- treat a provider exit as unverified until mission tests pass.

## 6. Information architecture

### Public routes

```text
/
/product
/how-it-works
/security
/docs
```

### Product routes

```text
/studio
/studio/onboarding
/studio/missions/new
/studio/missions/:missionId
/studio/watch/:lessonId
/studio/memory
/studio/skills
/studio/skills/:skillId
/studio/artifacts/:artifactSetId
/studio/runs
/studio/runs/:runId
/studio/proof/:receiptId
/studio/settings/connections
/studio/settings/privacy
```

All routes must have real empty, loading, unsupported, offline, error, and recovery states.

## 7. Golden end-to-end user journey

This is the release-blocking journey. It must work with real state both manually and through WebMCP.

1. User opens Cherry and passes capability checks.
2. User creates a local workspace and a mission with an objective and definition of done.
3. User opens Cherry Watch and adds a permitted YouTube URL.
4. User acknowledges source permissions and imports a transcript or enters text manually.
5. Agent or human moves through the lesson and records timestamped observations.
6. Cherry shows transcript coverage, visual coverage, evidence gaps, and uncertainty without inventing completeness.
7. Agent proposes transferable principles and a SkillGraph.
8. User edits one rule and approves a specific version.
9. Cherry promotes the correction into a scoped memory/evaluation when requested.
10. Agent or human creates a real artifact in the workspace.
11. Cherry Verify evaluates the artifact and reports actual pass/fail results.
12. A failed assertion links to its evidence and affected artifact; user/agent repairs it and reruns verification.
13. Cherry generates a proof receipt from the event ledger.
14. User compiles and downloads a valid skill archive.
15. User imports that archive into a new Cherry workspace and sees the same skill/evidence/receipt.
16. Optionally, user sends a safe job to a paired local runner or installs the generated host target.

## 8. WebMCP progressive tool aperture

Maximum active tool count per product state: **five**, excluding two global read-only tools.

### Global read-only

- `read_cherry_context`
- `list_cherry_capabilities`

### Empty/onboarding

- `create_workspace`
- `create_mission`

### Learning

- `load_lesson`
- `control_lesson_playback`
- `record_lesson_observation`
- `add_source_evidence`
- `compile_lesson_draft`

### Planning/approval

- `define_skillgraph`
- `propose_memory_rule`
- `request_checkpoint_approval`
- `revise_checkpoint`

### Execution

- `write_artifact_file`
- `record_task_result`
- `request_consequential_action`

### Verification

- `run_cherry_verification`
- `apply_verified_repair`
- `read_failed_assertions`

### Passed/export

- `compile_skill_bundle`
- `export_proof_receipt`
- `prepare_runner_job`

Rules:

- tool names use concise `snake_case`;
- every tool has one responsibility and non-overlapping description;
- all schemas set `additionalProperties: false`;
- arguments are validated at runtime, not trusted because the host validated them;
- mutations have `readOnlyHint: false`; source-returning tools use `untrustedContentHint: true`;
- registration uses the current `document.modelContext.registerTool` API and `AbortController` lifecycle;
- tool cancellation is respected;
- state is re-read at execution time to avoid stale closures;
- a tool returns success only after persistence and visible UI update complete;
- results are concise, structured, size-capped, and free of secrets;
- tool errors classify `validation`, `conflict`, `approval_required`, `unsupported`, `temporary`, or `internal`;
- current-state tools are unregistered when no longer valid;
- unsupported clients receive a complete manual UI, not a broken screen.

## 9. UI screens and non-negotiable content

### 9.1 Landing

Purpose: explain the category and show that Cherry is a human-agent operating layer, not a chatbot.

Required sections:

- cinematic Black Cherry hero;
- one-sentence problem and outcome;
- “Watch → SkillGraph → Run → Proof” interactive story;
- real product screenshots or live rendered components, not abstract mock cards;
- architecture diagram;
- local-first/zero-API statement with limitations;
- security and ownership statement;
- open-source/SDK section;
- final CTA.

### 9.2 Onboarding and capability diagnostic

Show separate checks for:

- WebMCP availability;
- IndexedDB and storage quota;
- service worker/PWA;
- YouTube embed availability;
- local runner pairing;
- optional sync;
- reduced-motion preference;
- current execution mode.

Every failed check explains impact and manual fallback.

### 9.3 Command Center

Must show:

- primary “Teach Cherry” and “Create mission” actions;
- connected host status;
- current mission and next valid action;
- pending approvals;
- runs requiring attention;
- recently learned or corrected skills;
- Memory Inbox;
- local runner status;
- chronological live ProofEvent strip.

No generic token/cost graphs, fake agent avatars, or meaningless productivity percentages.

### 9.4 Watch workspace

Desktop layout:

- left/centre: player and coverage timeline;
- lower centre: synchronized transcript;
- right: observation/evidence inspector;
- top: lesson title, source, permission status, active mode;
- bottom: next evidence gap and compile action.

Visual observation and transcript-derived knowledge must have distinct icons, labels, and filters.

### 9.5 Mission and SkillGraph workspace

Desktop layout:

- 232px phase rail/navigation;
- flexible graph canvas;
- 336px selected-node inspector;
- collapsible bottom event console.

Users can inspect every node’s evidence, memory, tools, approval, outputs, and assertions without leaving the workspace.

### 9.6 Memory Vault

Provide:

- inbox for proposed memories;
- table and graph/timeline views;
- type/scope/sensitivity/source filters;
- confidence and expiry;
- “why this was remembered” trace;
- edit, pin, supersede, expire, delete, and export.

### 9.7 Skills Library and detail

A skill card shows:

- name/version;
- purpose and triggers;
- verification status;
- source types;
- compatible targets;
- last run;
- risk/approval level.

Skill detail includes graph, evidence, memories, policies, evals, versions, exports, install instructions, and proof history.

### 9.8 Runs and Runner

Show queue status, actual start/end times, adapter, working directory label, permissions, retries, timeout, logs, produced artifacts, and final verification. Provider activity and deterministic verification are separate statuses.

### 9.9 Proof

A receipt has:

- immutable ID and hash;
- mission and skill version;
- sources and timestamps;
- approvals;
- tool calls;
- artifact hashes;
- assertions and results;
- failures/repairs;
- runner/provider information;
- export/download and verification command.

A receipt may be tamper-evident through hashes. It may not be called cryptographically signed unless an actual signing key is implemented.

## 10. Visual direction

### Direction name

**Black Cherry OS**

### Personality

Premium, alive, technical, calm under complexity, trustworthy, precise, and unlike the standard purple-gradient AI dashboard.

### Required token baseline

```json
{
  "color": {
    "canvas": "#09070A",
    "canvasRaised": "#0F0A0D",
    "surface1": "#151014",
    "surface2": "#1D151A",
    "surface3": "#281A21",
    "borderSubtle": "rgba(255,255,255,0.07)",
    "borderDefault": "rgba(255,255,255,0.12)",
    "textPrimary": "#FFF8FA",
    "textSecondary": "#D0C2C8",
    "textTertiary": "#95878E",
    "cherryPrimary": "#FF4F78",
    "cherryStrong": "#E93262",
    "cherryDeep": "#7A1738",
    "raspberry": "#B92355",
    "success": "#58D6A3",
    "warning": "#FFC968",
    "danger": "#FF6B73",
    "info": "#7DB9FF"
  },
  "radius": {"xs": 6, "sm": 10, "md": 14, "lg": 20, "pill": 999},
  "space": {"1": 4, "2": 8, "3": 12, "4": 16, "5": 20, "6": 24, "8": 32, "10": 40, "12": 48, "16": 64},
  "motion": {"fast": 140, "standard": 220, "deliberate": 360}
}
```

The design agent may tune values for contrast and optical balance, but must preserve the system and record changes.

### Typography

Use a zero-cost, production-safe stack:

```css
font-family: Inter, Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
```

Do not make the build depend on proprietary fonts or raw font files.

### Shape and motion

- graph edges subtly echo cherry stems;
- approved nodes become filled cherry forms; incomplete nodes remain seed outlines;
- the 3D cherry neural cluster appears only in marketing/empty states;
- operational screens use restrained depth and thin borders;
- motion communicates connection, observation capture, memory commit, approval wait, compilation, failure, repair, and completion;
- no continuous distracting animation behind work surfaces;
- respect `prefers-reduced-motion` and provide static equivalents.

## 11. Responsive system

Reference viewports:

- 1440×1024 desktop;
- 1280×800 laptop;
- 834×1194 tablet;
- 390×844 mobile.

On mobile:

- bottom navigation replaces the sidebar;
- inspectors become full-height sheets;
- graph and video can enter full-screen mode;
- approvals become focused single-task screens;
- no horizontal dashboard shrinkage;
- touch targets are at least 44×44 CSS pixels;
- all core journeys work without hover.

## 12. Accessibility

Meet WCAG 2.2 AA where applicable:

- semantic landmarks and heading hierarchy;
- full keyboard operation;
- visible focus, never removed without replacement;
- labels, descriptions, and inline error association;
- status not conveyed by colour alone;
- live regions for tool/run updates without excessive announcements;
- reduced motion;
- contrast checks;
- captions/transcript controls;
- correct tab order in graph/editor/inspector;
- escape restores focus from dialogs and sheets.

## 13. Golden v1 acceptance criteria

Release is blocked unless all are true:

1. A fresh user can complete the golden journey manually without an AI provider.
2. A compatible ChatGPT/Codex host can discover the correct current-state WebMCP tools and mutate the same visible workspace.
3. WebMCP tools disappear when state no longer permits them.
4. YouTube lesson import uses the official player and never scrapes media/captions.
5. A transcript can be imported, parsed, edited, and deleted.
6. Observations and evidence have timestamps and trust labels.
7. A SkillGraph can be created, revised, versioned, approved, rejected, and rolled back.
8. A correction can become a scoped memory/evaluation only with user approval.
9. Artifacts are real files and preview isolation prevents access to Cherry data/network.
10. Verification derives from real checks and stores exact results.
11. ZIP export passes Agent Skills validation and all file references resolve.
12. Workspace export/import round-trips without data loss.
13. Proof hashes can be recomputed and match.
14. Refresh, offline shell, unsupported WebMCP, unavailable video, missing runner, and storage errors have recovery paths.
15. No secret is present in browser storage, logs, exports, source control, or screenshots.
16. Typecheck, lint, unit tests, end-to-end tests, accessibility checks, and production build pass.
17. Every primary route works at all four reference viewports.
18. No dead control, fake activity, seeded verification, unlabelled roadmap feature, unresolved placeholder marker, lorem ipsum, or console error remains in shipped source, UI copy, generated exports, or release evidence. Authoritative prompt/spec files may quote marker names only to define the rule.

## 14. Deliberate exclusions from golden v1

These are not allowed to become release blockers or misleading marketing claims:

- arbitrary video download or caption scraping;
- training or fine-tuning a foundation model;
- guaranteed semantic understanding of every frame;
- automatic extraction of all private personal memory;
- automating ChatGPT/Claude consumer websites by stealing sessions/cookies;
- unlimited API inference;
- cloud computer supplied by WebMCP;
- unsupervised financial, legal, medical, employment, purchase, account-permission, or messaging actions;
- public skill marketplace;
- billing;
- native Android background service;
- enterprise multi-user tenancy;
- every SaaS connector;
- claiming identical behaviour across models.

The product can expose clear extension interfaces for these areas. It cannot render them as working controls.
