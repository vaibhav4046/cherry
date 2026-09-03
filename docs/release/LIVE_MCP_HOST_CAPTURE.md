# Live MCP host capture — Cherry served to a real agent host

**Captured:** 2026-09-03, during the pre-submission verification pass.
**Host:** an MCP-capable agent host running on the owner's machine, with Cherry's stdio
MCP bridge (`runner/mcp/server.mjs`) registered as the server `cherry-wine`.
**Transport:** stdio MCP. **Mode:** read and verify only — the bridge exposes no mutation tool.

## What this capture is, and what it is not

This is a real host, discovering Cherry's MCP server and executing its tools against the
shipped workspace export. Every hash below was recomputed by the tool at call time and
compared against the value stored in the export.

This is **not** a capture of a proprietary in-browser WebMCP host. Cherry's browser-side
WebMCP surface registers through `document.modelContext.registerTool` and is covered by
unit tests and a Playwright journey against a mock model context, but no session inside a
proprietary WebMCP browser client has been recorded. `/compatibility` holds that row at
**Experimental** for exactly that reason, and this document does not upgrade it.

## The calls, in order

### 1. `read_workspace_summary`

```json
{
  "workspace": {
    "id": "ws-01M1779YEMQY3RZNEAHE2H82WN",
    "name": "EXAMPLE — Learn a landing page workflow",
    "revision": 1,
    "description": "Shipped labelled example workspace. Safe to delete. Its approval is synthetic reference state, not proof of a live human decision."
  },
  "missionCount": 1,
  "missions": [
    { "id": "ms-01M1779YEZGAP8MGB047ZY0A8H", "title": "Build a landing snippet the lesson way", "state": "COMPLETE" }
  ],
  "skillCount": 1,
  "approvedMemories": 1,
  "receiptCount": 1,
  "exportedAt": "2026-08-29T16:58:04.159Z"
}
```

Note that the host is told, by the data itself, that the example approval is synthetic.
The label travels with the record instead of living only in the UI.

### 2. `verify_workspace_integrity`

SHA-256 over RFC 8785 canonical JSON, recomputed by the tool and compared to the stored value:

```json
{
  "stored":     "9b3a8e1102fdf4b6fff5f0779b9ba9a8a831a2706796de18ef3d32a9cff019b6",
  "recomputed": "9b3a8e1102fdf4b6fff5f0779b9ba9a8a831a2706796de18ef3d32a9cff019b6",
  "matches": true
}
```

### 3. `list_skills`

```json
{
  "skills": [
    {
      "id": "sg-01M1779YFDFTENKXQ4MGSHTHX1",
      "name": "Accessible landing snippet",
      "status": "approved",
      "version": "0.1.0",
      "revision": 1,
      "approvedRevision": 1
    }
  ]
}
```

`revision` and `approvedRevision` are both 1: the host is seeing the exact revision a human
approved, not merely the latest one.

### 4. `verify_receipt` — negative case first

Called with a receipt id that does not exist, the bridge refuses rather than inventing a result:

```json
{ "error": "receipt auto not found" }
```

### 5. `verify_receipt` — real receipt

```json
{
  "receiptId":  "rc-01M1779YFWYGBACKVW020XXT3R",
  "stored":     "8574bc7d97bb66a7c0de07947c6fdfd487c140373093f5ba071786b3bcf7ba58",
  "recomputed": "8574bc7d97bb66a7c0de07947c6fdfd487c140373093f5ba071786b3bcf7ba58",
  "matches": true
}
```

## Why this matters for the submission

An agent host asked Cherry to prove its own state and Cherry proved it — by recomputation,
in front of the host, including a clean refusal on a bad id. The agent could read the
approved revision and verify the receipts; it could not approve anything, promote trust, or
mutate the workspace, because the bridge exposes no tool that can. That is the boundary the
product claims, exercised rather than asserted.

Reproduce it by registering `runner/mcp/server.mjs` as an MCP server in any MCP-capable host
and pointing it at a Cherry workspace export.
