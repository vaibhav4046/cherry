# OpenAI integration and host connectivity

Facts come from `RESEARCH.md` (official pages accessed 2026-09-02). Each integration below states
what Cherry does on this branch and what it does not claim.

## 1. WebMCP in ChatGPT (site tools)

Documented: site tools are provided by the page currently open in the ChatGPT desktop app's
built-in browser and its signed-in session; they do not carry across tabs or sites and are gone once
the page closes. The W3C draft `ModelContext` interface is `registerTool`, `getTools`,
`executeTool`, `ontoolchange`; unregistration happens only through the `AbortSignal` passed to
`registerTool`; tool names are 1 to 128 characters.

Cherry: `src/cherry/webmcp/registration-manager.ts` feature-detects `document.modelContext`,
registers with an `AbortController` per state and surface, and re-registers on route and state
changes. This matches the documented contract. On this branch Mission Control adds a `control`
surface with five bounded tools (GOD-8). Every call lands in Agent View. WebMCP is not Cherry's
runtime: work that must continue after the page closes is owned by the paired runner.

Claim status: SHIPPED_TESTED against the mock host; EXPERIMENTAL in the live ChatGPT desktop
browser until a real capture exists (none on this machine).

## 2. Codex (subscription-first worker)

Documented: Codex is included across ChatGPT plans with plan-dependent usage limits; sign in with
ChatGPT from the CLI, app, IDE or web. Non-interactive `codex exec "prompt"` supports `--json`
(JSONL events `thread.started`, `turn.started`, `item.started`, `item.completed`, `turn.completed`,
`turn.failed`, `error`), `--output-schema <path>`, `-o/--output-last-message <path>`, `--sandbox`
(`read-only`, `workspace-write`, `danger-full-access`), `-C/--cd`, `--ephemeral`. `--full-auto` is
deprecated and warning-only; `--dangerously-bypass-approvals-and-sandbox` (`--yolo`) exists and
Cherry never uses it. `approval_policy = "untrusted"` fails to start on CLI 0.149.0 and later.
`codex app-server` speaks JSON-RPC 2.0 (without the `jsonrpc` header) as JSONL over stdio, requires
one `initialize` request per connection, and documents `generate-json-schema --out`.
`codex mcp-server` is deprecated. SDKs: `@openai/codex-sdk` (TypeScript) and `openai-codex` (Python).

Cherry on this branch (runner lane, GOD-4): the `codex` host adapter probes `codex --version` and
`codex exec --help` and builds argv only from flags observed in the help text, always passing an
explicit `--sandbox workspace-write`, `-C <sandbox root>` and, when present,
`--output-last-message`. The user's global `~/.codex/config.toml` on this machine sets
`approval_policy = "never"` and `sandbox_mode = "danger-full-access"`; the explicit `--sandbox` flag
overrides the sandbox default for Cherry's runs. Provider completion is recorded as `completed`,
never `verified`. UI copy: "Uses your Codex sign-in and available Codex usage." Never
"unlimited", "free inference" or "bypasses API billing".

Codex App Server client: DESIGNED (schema must be generated from the installed binary; no binary
on PATH here). Codex Automations: Cherry exports a recipe (GOD-10, P1); no programmatic creation
API is documented, so no "create automatically" control exists.

Claim status: SHIPPED_TESTED for the adapter contract with fake executables; VALIDATED_REAL only
after an opt-in real run (`CHERRY_REAL_CODEX=1`) is captured in `docs/release/GOD_MODE_REAL_HOST_CAPTURE.md`.
The Codex CLI is not on PATH on this machine on 2026-09-02; the 2026-09-01 MCP bridge capture used
an ephemeral CLI.

## 3. ChatGPT Work and Scheduled Tasks

Documented: Work runs in the cloud on web and mobile, can run once, on a schedule, or on Gmail,
Slack and GitHub events on eligible plans; event triggers are created on web or mobile only;
approvals pause a task; no programmatic API is documented. Codex uses separate automations.

Cherry: "Run with ChatGPT Work" generates a `WorkTaskRecipe` (trigger, prompt, required apps,
approval boundaries, destination, Cherry mission id) that the person creates through supported
ChatGPT controls. GOD-10, P1. No fake "create automatically" button.

## 4. Plugins

Documented: a plugin packages skills and optionally an MCP server or app reference; the documented
layout is `<plugin>/.codex-plugin/plugin.json` with fields `name`, `version`, `description`,
`skills`, plus `skills/<name>/SKILL.md`; plugins that declare MCP servers in `mcp.json` or
`.mcp.json` are labelled Desktop only; marketplaces are JSON catalogs importable from GitHub.

Cherry: Agent Skills bundles already ship `SKILL.md`; a Cherry plugin package using only the four
documented manifest fields is a P1 deliverable and stays EXPERIMENTAL until installed in a real
Codex or ChatGPT surface. No manifest field beyond the documented four is invented.

## 5. Claude Code

Documented: `claude -p` non-interactive mode with `--output-format text|json|stream-json`,
`--json-schema`, `claude mcp add`, `claude mcp serve`, Agent SDK for Python and TypeScript.

Cherry: the `claude` host adapter probes `claude --version` and `claude --help` and uses `-p`,
`--output-format json` and `--permission-mode acceptEdits` only when the help text lists them.
Claude Code 2.1.224 is installed here; an opt-in real run (`CHERRY_REAL_CLAUDE=1`) is the P0 capture
target. The Cherry MCP bridge was registered in a live Claude Code host on 2026-08-29 (D-012).

## 6. Other hosts

| Host | Documented interface | Cherry status |
|---|---|---|
| Kilo | `kilo run --auto --format json`, `kilo mcp add/list/auth/logout` | Not installed; descriptor and probe only; EXPERIMENTAL when found, `--auto` never used outside an explicit sandbox |
| Kimi | Documentation inconsistent between kimi-cli and Kimi Code CLI references | Not installed; probe only; UNVERIFIED interface |
| Ollama | `/api/chat`, `/api/generate`, `/api/tags`, tool calling, structured outputs, OpenAI-compatible `/v1` | Installed (0.32.13, 7 models); probe only on this branch; EXPERIMENTAL |
| OmniRoute | The installed program is the only evidence; internet projects with the same name are not | Installed (npm global 3.8.49); `/v1/models` not yet observed; `unknown` until probed |
| OpenAI-compatible endpoint | Standard chat completions | Descriptor only; DESIGNED |

## 7. Model Context Protocol

Documented: the current specification revision is 2026-07-28; authorization is OAuth 2.1 with PKCE,
RFC 8707 resource indicators, and no token passthrough. Cherry's stdio bridge targets the 2025-06-18
handshake that the live Codex host accepted on 2026-09-01; moving to the stateless revision and
building a general MCP client host are ROADMAP items.

## 8. LinkedIn, Gmail, Calendar, GitHub

Documented in `RESEARCH.md` section I. LinkedIn self-serve `w_member_social` covers posting on the
member's behalf; member post analytics are partner-gated. Gmail draft creation uses narrower scopes
than sending. None of these connectors exist in Cherry; the capability catalogue marks them
`designed` and the landing labels them Roadmap.
