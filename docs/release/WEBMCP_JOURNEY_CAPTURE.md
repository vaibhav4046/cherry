# Full WebMCP journey, captured in a browser

Captured 2026-09-04 against a production build of commit `3fc22ee` served by
`vite preview` on `http://127.0.0.1:4173`, driven through the opt-in stand-in
host (`sessionStorage['cherry.standInHost'] = '1'`), which stores the
registrations Cherry offers, honours the AbortSignal Cherry passes when a tool
is retired, and forwards calls to Cherry's own execute function.

## What this is, and what it is not

This **is** the complete learn to export journey running through registered
WebMCP tool closures against real IndexedDB in a real browser, with a real
person's click as the only way past the approval.

This **is not** a proprietary host session. That is a separate capture:
`WEBMCP_LIVE_HOST_CAPTURE.md` records a real ChatGPT desktop Work session
calling three of these tools through `document.modelContext` against the
deployed site. Neither capture is presented as the other.

## The journey, with the values it returned

### 1. A space and a project, asked for explicitly

`start_apprenticeship { workspaceName: "Judge live check", newWorkspace: true, title: "Write a landing page hero that converts" }`

```json
{ "workspaceId": "ws-01M1NDA5CTCJNQC23D7F6VBJ5G", "workspaceName": "Judge live check",
  "workspaceCreated": true, "missionId": "ms-01M1NDA6QTSGS88XRVPP20VQHG", "state": "DRAFT",
  "note": "Created a new workspace and made it active. Existing workspaces were left untouched." }
```

### 2. A manual lesson, then five sentences of ordinary prose

`load_lesson { kind: "manual" }` then `import_transcript` with a five-sentence
landing-page teardown: outcome-first messaging, one call to action, proof beside
the claim, five-second comprehension, and cutting generic copy.

### 3. Derivation produced a workflow, not a placeholder

`derive_skill { lessonId }`

```json
{ "skillGraphId": "sg-01M1NDA9JDMJ7ZMQ9260S600NX",
  "name": "Lead with the outcome the reader gets workflow",
  "nodeCount": 5, "evidenceCount": 5,
  "note": "Draft only. Request approval with request_checkpoint_approval; a human must decide." }
```

The same input previously produced `{"name":"Review the lesson material workflow","nodeCount":1,"evidenceCount":1}`.

### 4. The approval request, and the screen it opened

The planning aperture registered twelve tools: seven always-on plus
`define_skillgraph`, `propose_memory`, `request_skill_approval`,
`get_approval_status`, `revise_checkpoint`.

`request_skill_approval { skillGraphId, reason }`

```json
{ "approvalId": "ap-01M1NDB8FXZRSWCCFFEB9ASY9Z", "revision": 2,
  "contentHash": "0c1d9913e4beeb0b", "status": "pending",
  "approvalUrl": "http://127.0.0.1:4173/studio/skills/sg-01M1NDA9JDMJ7ZMQ9260S600NX?approval=ap-01M1NDB8FXZRSWCCFFEB9ASY9Z",
  "nextAction": "get_approval_status — poll, or pass waitSeconds to wait for the decision",
  "note": "Cherry has opened this decision on screen. Only a person may decide it: this tool cannot approve, and no argument to any tool can." }
```

`location.pathname` immediately after the call was
`/studio/skills/sg-01M1NDA9JDMJ7ZMQ9260S600NX`: the agent had put the decision
on screen. The studio header read **Awaiting your approval**, and the approval
bar read:

> Waiting on you — Five principles derived from the landing-page lesson. Ready
> for your decision. · version 2 · requested by agent · Decide below

### 5. The decision, made by a person

A real pointer click on **Approve this version**, the same control any user
clicks. Immediately afterwards, with no further agent action:

```json
{ "missionState": "EXECUTING", "productState": "execution",
  "activeTools": ["read_cherry_context","list_cherry_capabilities","get_cherry_status",
                  "introduce_agent","list_skills","recommend_skills","get_skill",
                  "write_artifact_file","record_task_result","run_verification"] }
```

The planning tools were retired and the execution tools registered. The skill
page showed `approved · r2` and unlocked the file exports.

### 6. Execution

Two real files written through `write_artifact_file`:
`index.html` (183 bytes, sha `777afdf7307e2c5d`) and `notes.md` (58 bytes, sha
`df031814afb12534`). One run recorded, which said of itself: *"Recorded.
Deterministic verification is a separate step."*

### 7. Verification failed, for a real reason

`run_verification` → `{"status":"failed","blockingFailures":1,"totalAssertions":3}`

`read_failed_assertions` returned the evidence, not a label:

```json
{ "name": "No unresolved placeholder markers", "type": "policy",
  "evidence": ["index.html contains \"TODO\""], "expected": 0, "actual": 1 }
```

### 8. Repair, and a re-run that had to pass

The placeholder paragraph was replaced with a real line, then
`apply_verified_repair`:

```json
{ "verificationId": "vr-01M1NDH1WYK2ERR63JTXW4R0QX", "status": "passed",
  "blockingFailures": 0, "note": "Repair verified by re-run." }
```

The mission completed on that pass, and the export aperture registered
`compile_skill_bundle`, `export_proof_receipt`, `export_workspace`,
`prepare_runner_job`.

### 9. Exports, and a hash recomputed from what was actually served

```json
{ "bundle": { "fileName": "lead-with-the-outcome-the-reader-gets-workflow-v0.1.0.zip",
              "files": 23, "sizeBytes": 20915,
              "sha256": "50a389fbe7f0db360111bf999da846464997ab55e8d4b3dd8bc5e7b8cea52154" },
  "receipt": { "receiptId": "rc-01M1NDHBGGEB6YWBG1FKBGQG17", "status": "verified", "events": 29,
               "receiptHash": "6c757be89975d19e2f1434aa37d28bd28f988e03f064aa732d1ed785fd458f73" },
  "archive": { "schemaVersion": "1.2.0", "missions": 1, "events": 33,
               "payloadSha256": "b538cf3e4ca37454c45fc196871fbcd73302a08f5e31d2e7a839866c10fe7704" } }
```

`get_skill` served SKILL.md in **3 parts**. Joining them and hashing the result
in the page with `crypto.subtle.digest('SHA-256', ...)`:

```
advertised  4ce074bacfbc987355986116fabb3a3d52b5241374cf23b1467a27b86ee9a9f4
recomputed  4ce074bacfbc987355986116fabb3a3d52b5241374cf23b1467a27b86ee9a9f4
match       true
```

## Reproducing it

The same journey runs unattended as
`e2e/cherry/webmcp-full-journey.spec.ts` (`npx playwright test
e2e/cherry/webmcp-full-journey.spec.ts`), which makes the approval by following
the deep link the tool returned and clicking Cherry's own approve control.
There is no test-only approval path, because shipping one would be shipping the
bypass.

## One defect this capture found

Navigating to the approval screen rendered a blank page, because a rebuild had
replaced the hashed route chunk under an already-open tab. Fixed in `3fc22ee`:
a failed chunk import now reloads once, and once only.
