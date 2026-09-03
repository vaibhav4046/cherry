# CHERRY — RESEARCH, COMPETITIVE POSITION, AND REFERENCE INDEX

**Research cutoff:** 29 August 2026  
**Use:** Product decisions, design research, engineering constraints, truthful public claims, and final challenge verification.  
**Rule:** Recheck volatile plan limits, client support, API names, quotas, prices, and event rules immediately before release.

## 1. Research conclusion

The broad problem is not a shortage of chatbots. People can already ask models to research, code, use tools, schedule prompts, and create reusable skills. The unresolved product layer is that a useful working process is usually fragmented across chats, provider-specific instructions, browser actions, corrections, evidence, and local files. It is difficult to inspect, transfer, govern, replay, or prove.

Cherry’s strongest defensible product is therefore:

> A local-first apprenticeship and mission control system that captures permitted source material and observed work, converts it into an editable evidence-backed SkillGraph, attaches user-approved memory and policy, exposes only the tools needed for the current state, verifies real artifacts, and compiles the result into portable skill targets.

Cherry must not compete by claiming a larger model. It competes through structure, provenance, control, portability, verification, and graceful degradation.

## 2. Load-bearing user and developer problems

### 2.1 Workflow loss and provider lock-in

Successful work often remains trapped in one chat, one provider, one repository instruction file, or one automation platform. MCP standardises portions of the agent-to-tool boundary, but it does not by itself standardise memory, evidence, approvals, task graphs, evaluations, receipts, or model behaviour.

**Cherry answer:** SkillGraph plus portable export targets, with host-specific compatibility notes rather than a false promise of identical behaviour.

Primary references:
- MCP specification: https://modelcontextprotocol.io/specification/latest
- MCP introduction: https://modelcontextprotocol.io/introduction
- A2A protocol: https://a2a-protocol.org/latest/
- OpenAI Codex MCP documentation: https://developers.openai.com/codex/mcp

### 2.2 Persistent memory without ownership or provenance

Memory is useful only when the user can see what was stored, why it was stored, where it applies, whether it is sensitive, and how to correct/delete/export it. Opaque memory creates privacy and instruction-conflict problems.

**Cherry answer:** Memory Inbox, source links, confidence, sensitivity, scope, expiry, supersession, edit/delete/export, and no silent promotion from external content to durable instruction.

Primary references:
- OpenAI Memory FAQ: https://help.openai.com/en/articles/8590148-memory-faq
- LangGraph memory concepts: https://langchain-ai.github.io/langgraph/concepts/memory/
- Claude Code memory: https://docs.anthropic.com/en/docs/build-lane/memory

### 2.3 Tool overload and ambiguous tool choice

Large overlapping tool inventories consume context and increase selection ambiguity and security surface. A workflow needs the right tool at the right phase, not every connector at once.

**Cherry answer:** Progressive Tool Aperture—dynamically register only narrow state-valid WebMCP tools and keep deterministic domain functions shared by UI, WebMCP, and native MCP.

Primary references:
- Chrome WebMCP best practices: https://developer.chrome.com/docs/ai/webmcp/best-practices
- WebMCP imperative API: https://developer.chrome.com/docs/ai/webmcp/imperative-api
- Anthropic, Building effective agents: https://www.anthropic.com/research/building-effective-agents
- MCP tools specification: https://modelcontextprotocol.io/specification/latest/server/tools

### 2.4 Untrusted content and prompt injection

Tutorials, transcripts, webpages, repositories, messages, and tool outputs can contain adversarial instructions. There is no reliable model-only separator that turns every untrusted instruction into harmless data.

**Cherry answer:** Mark source-derived output as untrusted, preserve provenance through every derived object, separate policy from evidence, use narrow tools, redact output, require approval for consequential actions, and run deterministic checks outside the reasoning model.

Primary references:
- Chrome WebMCP security: https://developer.chrome.com/docs/ai/webmcp/secure-tools
- OWASP LLM01 Prompt Injection: https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- MCP security best practices: https://modelcontextprotocol.io/specification/latest/basic/security_best_practices

### 2.5 Plausible completion without proof

An agent can say a task is finished even when a file is missing, a browser runtime failed, an approval applies to an older revision, or an external side effect did not happen.

**Cherry answer:** deterministic assertions, artifact/runtime checks, exact-version approvals, export integrity, hashes, failed-repair history, and a receipt whose status derives from stored evidence—not a manually toggled badge.

Primary references:
- Chrome WebMCP evaluation guide: https://developer.chrome.com/docs/ai/webmcp/evals
- Anthropic, Building effective agents: https://www.anthropic.com/research/building-effective-agents
- OpenAI system cards and agent safety documentation: https://openai.com/safety/

### 2.6 Long-running work and recovery

Long jobs need checkpoints, idempotency, durable queues, timeouts, cancellation, retries, and deterministic verification. A page-scoped tool registry is not an always-on service.

**Cherry answer:** attached WebMCP for interactive use; portable skill targets; optional localhost Runner for user-owned scheduled execution; optional sync as an adapter. The UI always distinguishes provider completion from verification.

Primary references:
- ChatGPT site tools/WebMCP: https://learn.chatgpt.com/docs/webmcp
- Codex automations: https://developers.openai.com/codex/automations
- LangGraph durable execution: https://langchain-ai.github.io/langgraph/concepts/durable_execution/

### 2.7 Learning from video is more than transcription

A transcript may omit cursor movement, state transitions, layout changes, values, timing, visual hierarchy, and corrections performed silently. Conversely, “watching” every frame perfectly is not credible. A useful system needs explicit coverage and uncertainty.

**Cherry answer:** official YouTube embed control, user-supplied or authorised transcript input, timestamped visual observations, evidence-gap coverage, teach-back, transfer practice on a different task, and verification against approved principles.

Primary references:
- YouTube IFrame Player API: https://developers.google.com/youtube/iframe_api_reference
- YouTube captions API: https://developers.google.com/youtube/v3/docs/captions
- YouTube API Services Terms: https://developers.google.com/youtube/terms/api-services-terms-of-service
- YouTube Terms: https://www.youtube.com/t/terms

## 3. Adjacent products and the gap Cherry owns

### OpenAI/Codex/ChatGPT

Adjacent capabilities include Agent Skills, Skill Creator, Record & Replay, MCP, scheduled tasks/automations, computer use, connected apps, and provider-managed memory. These validate the need for reusable workflows but make a generic `SKILL.md` generator insufficient.

Cherry’s gap:
- source-linked Watch-to-Skill;
- vendor-neutral SkillGraph;
- user-owned portable MemoryGraph;
- exact-version approvals;
- deterministic artifact verification;
- dynamic WebMCP Tool Aperture;
- cross-target compilation and proof.

References:
- https://developers.openai.com/codex/build-skills
- https://github.com/openai/skills
- https://developers.openai.com/codex/mcp
- https://developers.openai.com/codex/automations
- https://learn.chatgpt.com/docs/webmcp

### Claude Code

Adjacent capabilities include skills, subagents, hooks, project/user memory, MCP, and non-interactive CLI/SDK operation. Cherry should compile into these capabilities instead of pretending to replace them.

Cherry’s gap:
- visual human-agent workspace;
- provenance and correction lifecycle;
- host-neutral representation;
- approval/evaluation/receipt layer;
- manual mode that works without a model.

References:
- https://docs.anthropic.com/en/docs/build-lane/overview
- https://docs.anthropic.com/en/docs/build-lane/skills
- https://docs.anthropic.com/en/docs/build-lane/sub-agents
- https://docs.anthropic.com/en/docs/build-lane/hooks
- https://docs.anthropic.com/en/docs/build-lane/memory

### n8n and deterministic workflow builders

These products provide explicit visual graphs, schedules, connectors, logs, and approvals. Cherry should not rebuild a general integration catalogue.

Cherry’s gap:
- learn a candidate workflow from permitted evidence and observed work;
- distinguish observation, principle, procedure, and preference;
- compile the learned workflow into portable agent assets;
- store user correction as scoped memory/evaluation;
- preserve proof of how the skill was learned and validated.

References:
- https://docs.n8n.io/advanced-ai/
- https://docs.n8n.io/hosting/installation/
- https://n8n.io/integrations/mcp/

### Workflow capture tools

Playwright Codegen and RPA recorders capture selectors and actions. Documentation tools capture SOP screenshots. These are useful but often miss intent, policy, evidence, transfer, and model-facing skill packaging.

Cherry’s gap:
- capture intent and expected outcome;
- infer a reviewable semantic process;
- require approval;
- transfer to a different task;
- verify results;
- export a skill plus evidence and policy.

References:
- https://playwright.dev/docs/codegen
- https://learn.microsoft.com/en-us/power-automate/desktop/recorders

## 4. WebMCP facts that constrain the design

- WebMCP is experimental and host/client support is not universal.
- Tools are registered by the live top-level page and are page/state scoped.
- Cherry must feature-detect current APIs and preserve full manual operation.
- WebMCP does not grant arbitrary browser privileges or cross-origin access.
- Tool input and tool output remain untrusted surfaces.
- Narrow tools, runtime validation, cancellation, dynamic registration, and explicit side-effect control are required.
- A browser page is not a persistent cloud computer. Closing it can remove the tool surface.
- The exact current API must be rechecked before coding and before submission.

Primary references:
- https://developer.chrome.com/docs/ai/webmcp
- https://developer.chrome.com/docs/ai/webmcp/imperative-api
- https://developer.chrome.com/docs/ai/webmcp/secure-tools
- https://developer.chrome.com/docs/ai/webmcp/best-practices
- https://developer.chrome.com/docs/ai/webmcp/evals
- https://webmachinelearning.github.io/webmcp/
- https://github.com/webmachinelearning/webmcp

## 5. Agent Skills compatibility facts

The canonical skill export uses a skill directory containing `SKILL.md`. The directory and skill name must match applicable format constraints. Keep the main skill concise and use one-level-deep resource directories for supporting material. Validate generated skills rather than relying on a visual file tree.

Primary references:
- https://agentskills.io/specification
- https://developers.openai.com/codex/build-skills
- https://github.com/openai/skills

## 6. YouTube and source permissions

Release behavior:
- use the official embedded player;
- store video ID/URL, timestamps, user notes, source labels, and derived observations;
- accept pasted or uploaded transcript text the user is entitled to use;
- permit authorised owner caption integrations as optional adapters;
- never scrape captions or download/re-host video as a hidden dependency;
- show an unavailable/manual path when embed/caption access fails;
- separate source-specific assets/copy from transferable principles;
- require user acknowledgement of source rights/permission.

The application must not claim that a YouTube link alone guarantees a transcript or perfect full-video understanding.

## 7. Zero-dollar infrastructure decisions

### Core release—mandatory and cost-free

| Layer | Locked choice | Why |
|---|---|---|
| Front end | Existing React/TypeScript application; Vite or existing framework | Preserve working project and avoid rewrite |
| State | Typed domain functions plus event records | Same behavior for UI, WebMCP, and native MCP |
| Persistence | IndexedDB through Dexie or existing equivalent | Local, offline, no account/database cost |
| Validation | Zod/AJV plus JSON Schema exports | Runtime safety and portable contracts |
| Graph | Existing graph library or React Flow, loaded on demand | Real editable MissionGraph/SkillGraph |
| Editor | Existing editor or CodeMirror, loaded on demand | Real artifact files and JSON/Markdown editing |
| Archive | JSZip or equivalent in browser | Real deterministic exports |
| Hashing | Web Crypto SHA-256 | No service cost; recomputable proof |
| Preview | sandboxed iframe with restrictive CSP | Isolate generated artifacts |
| PWA | service worker and manifest | Android-installable, offline-capable shell |
| Hosting | Cloudflare Pages or current Vercel Hobby project | Static hosting without mandatory spend |
| Tests | Vitest, Testing Library, Playwright, axe-core | Free local/CI quality gates |
| CI | GitHub Actions for public/open-source repository | Free public-repository runner allocation subject to current terms |

### Optional adapters—not release dependencies

| Adapter | Choice | Limit/risk |
|---|---|---|
| Sync/auth | Supabase free project | Project quotas/pausing; never required for core workflow |
| Static hosting alternative | Vercel Hobby | Current non-commercial/usage policy and limits must be checked |
| Edge functions | Cloudflare Workers free allocation | Daily CPU/request limits; not an always-on agent runtime |
| Local model | Ollama | Uses user hardware, download, RAM, and power; quality varies |
| Local transcription | whisper.cpp | User-provided media only; performance/device dependent |
| Codex CLI | User-installed and authenticated | Entitlement/rate limits; process success is not task proof |
| Claude CLI | User-installed and entitled | Subscription/SDK/API terms vary; not Cherry infrastructure |

Current official service references:
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- Vercel pricing: https://vercel.com/pricing
- Supabase pricing: https://supabase.com/pricing
- GitHub Actions billing: https://docs.github.com/en/billing/concepts/product-billing/github-actions
- Ollama: https://docs.ollama.com/
- whisper.cpp: https://github.com/ggml-org/whisper.cpp

## 8. Challenge facts to verify immediately before submission

As researched on 29 August 2026:
- submission deadline: 3 September 2026, 1:00 PM Pacific / 9:00 PM British Summer Time;
- product must make meaningful use of WebMCP;
- working live URL and public source repository with visible open-source licence are required;
- public demonstration video must be under three minutes and include audio;
- judging covers WebMCP leverage, execution, potential impact, and creativity/ambition;
- participant count is live and volatile; do not publish or hard-code a fixed count without checking the official page immediately before submission.

Official pages:
- https://openai.com/webmcp-challenge/
- https://webmcp.devpost.com/

## 9. Design reference board

These references are for interaction principles, hierarchy, density, graph inspection, and visual storytelling. They are not assets to copy.

### Product references
- Linear: https://linear.app/
- Linear design refresh: https://linear.app/now/behind-the-latest-design-refresh
- n8n AI: https://n8n.io/ai/
- Replit Agent: https://replit.com/ai
- Figma Make: https://www.figma.com/make/
- Figma dashboard templates: https://www.figma.com/templates/dashboard-designs/

### Figma Community discovery
- https://www.figma.com/community/search?query=AI%20agent%20dashboard
- https://www.figma.com/community/search?query=workflow%20builder%20dark%20dashboard
- https://www.figma.com/community/search?query=knowledge%20graph%20dashboard
- https://www.figma.com/community/search?query=video%20transcript%20editor
- https://www.figma.com/community/search?query=mission%20control%20dashboard

### Dribbble discovery
- https://dribbble.com/search/ai-agent-dashboard
- https://dribbble.com/search/workflow-builder-dark
- https://dribbble.com/search/knowledge-graph
- https://dribbble.com/search/ai-infrastructure
- https://dribbble.com/search/video-editor-dashboard

Reference rule: extract reusable principles—hierarchy, density, navigation, feedback, graph inspection, timeline treatment, motion restraint—and record them in `docs/design/CHERRY_REFERENCE_NOTES.md`. Do not copy branded assets, exact compositions, copy, illustrations, or protected visual identity.

## 10. Locked research-to-product decision

Cherry v1 must deliver one complete reusable system, not a theatrical prototype:

```text
Permitted source or manual instruction
→ transcript/visual evidence with coverage and uncertainty
→ editable SkillGraph and MissionGraph
→ exact-version human approval
→ real artifact creation and sandboxed preview
→ deterministic failed/repair/passed verification
→ scoped correction memory
→ portable skill/workspace/proof export
→ the same operations through manual UI and state-aware WebMCP
```

Local Runner, native MCP, and sync are releasable only if they pass their own gates. They are not allowed to weaken the core local product.
