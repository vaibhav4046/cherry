# Cherry

**Teach an agent once. Every agent you own gets better, and none of them can approve their own work.**

## What Cherry does

- Turns a source you are allowed to learn from into a **reusable skill**: a graph of steps, each traceable to the sentence it came from.
- Registers **WebMCP site tools** so a visiting agent (ChatGPT Work, Codex, any `document.modelContext` host) can drive the whole workflow from its own chat window.
- Stops at a **human approval bound to an exact revision and content hash**. No tool argument, chat message, or agent-supplied flag substitutes for it.
- **Verifies the work** with deterministic checks against the real files, shows the failing evidence, accepts a bounded repair, and only calls it done when the re-run passes.
- **Exports** an Agent Skill bundle, a proof receipt and the whole workspace, each with a hash the recipient can recompute.

The core path runs in your browser and asks for no model API key: no Cherry-hosted backend holds your work, and nothing leaves IndexedDB without an explicit export. Two things are opt-in and off by default, so it would be wrong to say "no accounts, no server" flatly: email sign-in through Privy, and the paired loopback runner on your own machine that executes work.

## Live product

https://cherry-wine.vercel.app

## Repository

https://github.com/vaibhav4046/cherry

## The flagship workflow

```
a lesson you may learn from
  → import_transcript          five sentences of ordinary prose
  → add_source_evidence        claims, recorded untrusted
  → derive_skill               5 steps, each quoting its own sentence
  → request_skill_approval     Cherry opens the decision on the person's screen
  ─────────────── a person clicks Approve, at revision 2 ───────────────
  → write_artifact_file        real files in a real workspace
  → run_verification           FAILED: index.html contains "TODO"
  → read_failed_assertions     the evidence, not a label
  → apply_verified_repair      PASSED, and only because the re-run passed
  → compile_skill_bundle       23 files, sha256 recomputable
  → export_proof_receipt       29 ledger events, hash-chained
```

The agent cannot cross the line in the middle. That is the product.

## Architecture

```
                    a person
                        │  decides, and only the person decides
   ChatGPT / Codex ─────┼───── Cherry Studio (the same actions, by hand)
        │ WebMCP        │
        ▼               ▼
   document.modelContext registrations
        │  aperture: 7 always-on tools + at most 5 for the current phase
        ▼
   domain services  ── approvals, revisions, content hashes
        │
        ▼
   IndexedDB  ── skills · evidence · memory · artifacts · append-only proof ledger
        │
        ▼
   exports  ── SKILL.md · AGENTS.md · .zip bundle · receipt · archive
```

## Proof it works

Every line here is a command you can run or a file you can open.

| Claim | Evidence |
| --- | --- |
| A real proprietary host called Cherry's registered tools | `docs/release/WEBMCP_LIVE_HOST_CAPTURE.md` — ChatGPT desktop, Work mode, model 5.6 Sol, 2026-09-04, against the deployed site: 10 tools registered, 3 called through `document.modelContext` |
| The complete journey runs through registered closures | `docs/release/WEBMCP_JOURNEY_CAPTURE.md` — every id, hash and count it returned, in a real browser |
| …and runs unattended | `npx playwright test e2e/cherry/webmcp-full-journey.spec.ts` |
| An agent cannot approve, whatever it sends | `tests/cherry/tool-schema-contract.test.ts` — forged `humanApproved` / `approved` / `humanConfirmed` on all registered tools, with the approvals table asserted byte-identical afterwards |
| The security boundaries hold | `tests/cherry/webmcp-security-boundaries.test.ts` |
| The approval handoff is real and read-only | `tests/cherry/approval-handoff.test.ts` |
| Hashes recompute | `npm run verify:pack` fails on a one-byte tamper |
| Unit + runner suites | `npm run gates` |

Where a surface is unproven, the product says so: `/compatibility` rates each one
and names what its evidence does **not** cover.

## Try it yourself

The shortest path to the thing that matters:

1. Open https://cherry-wine.vercel.app/studio/agent
2. Paste into the console: `sessionStorage.setItem('cherry.standInHost','1')`, then reload. This installs the stand-in host the app ships for auditing; it adds no capability.
3. `await cherryCall('start_apprenticeship', { workspaceName: 'Try it', newWorkspace: true })`
4. `await cherryCall('load_lesson', { title: 'Anything', kind: 'manual' })`
5. `await cherryCall('import_transcript', { lessonId: '<from step 4>', text: 'Lead with the outcome. Keep one call to action. Put the proof next to the claim.' })`
6. `await cherryCall('derive_skill', { lessonId: '<from step 4>' })`
7. `await cherryCall('request_skill_approval', { skillGraphId: '<from step 6>', reason: 'Ready' })`

Cherry opens the decision on screen. Now try to approve it from the console.
There is no tool that does, and `get_approval_status` will keep telling you the
truth while you look for one.

## Built with

react, typescript, vite, dexie (indexeddb), zod, jszip, web-crypto,
webmcp (`document.modelContext`), model context protocol, playwright, vitest.
