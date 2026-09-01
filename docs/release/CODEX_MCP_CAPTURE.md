# Native Codex MCP validation capture

Validated on **1 September 2026 at 14:26 BST (13:26 UTC)** with a fresh,
ephemeral Codex CLI host authenticated through ChatGPT.

This capture validates Cherry's **native Codex MCP/STDIO path**. It does not
validate a browser WebMCP host. The workspace is the shipped labelled example:
its approval is synthetic reference state, not evidence of a live human
approval.

## Host and artifacts

```text
> codex --version
codex-cli 0.151.0-alpha.7.2

> codex login status
Logged in using ChatGPT
```

| Artifact | Exact value |
| --- | --- |
| Workspace export | `public/examples/example-workspace.json` |
| Workspace integrity | `9b3a8e1102fdf4b6fff5f0779b9ba9a8a831a2706796de18ef3d32a9cff019b6` |
| Workspace receipt | `rc-01M1779YFWYGBACKVW020XXT3R` |
| Receipt integrity | `8574bc7d97bb66a7c0de07947c6fdfd487c140373093f5ba071786b3bcf7ba58` |
| Compiler output | `docs/release/sample-bundle.zip` |
| Bundle ZIP SHA-256 | `37401d8c94c7d8a365bd60ce98c8a9b16a8adb8fa35e3bf73ba4c5169ad3aacb` |
| Extracted bundle | `semantic-hero-section-with-a-real-h1-heading-workflow` |

OpenAI's MCP documentation confirms that Codex supports local STDIO servers,
stores their configuration in `config.toml`, and supports registration through
`codex mcp add`: [official OpenAI documentation](https://developers.openai.com/codex/mcp).

## Reproduce the registration

Run from the repository root in PowerShell:

```powershell
$repoRoot = 'D:\project\cherry'
$bundlesRoot = "$repoRoot\work\codex-mcp-capture\bundles"

New-Item -ItemType Directory -Force -Path $bundlesRoot | Out-Null
Expand-Archive `
  -LiteralPath "$repoRoot\docs\release\sample-bundle.zip" `
  -DestinationPath $bundlesRoot `
  -Force

Get-FileHash `
  -LiteralPath "$repoRoot\docs\release\sample-bundle.zip" `
  -Algorithm SHA256

node "$bundlesRoot\semantic-hero-section-with-a-real-h1-heading-workflow\scripts\verify.mjs"

codex mcp add cherry -- node "$repoRoot\runner\mcp\server.mjs" `
  --workspace "$repoRoot\public\examples\example-workspace.json" `
  --bundles $bundlesRoot

codex mcp get cherry --json
```

Registration result, trimmed only to the Cherry entry:

```json
{
  "name": "cherry",
  "enabled": true,
  "disabled_reason": null,
  "transport": {
    "type": "stdio",
    "command": "node",
    "args": [
      "D:\\project\\cherry\\runner\\mcp\\server.mjs",
      "--workspace",
      "D:\\project\\cherry\\public\\examples\\example-workspace.json",
      "--bundles",
      "D:\\project\\cherry\\work\\codex-mcp-capture\\bundles"
    ],
    "env": null,
    "env_vars": [],
    "cwd": null
  },
  "enabled_tools": null,
  "disabled_tools": null,
  "startup_timeout_sec": null,
  "tool_timeout_sec": null
}
```

## Live Codex host session

The bridge's five tools do not currently declare MCP read-only annotations.
With `default_tools_approval_mode="auto"`, an initial non-interactive run
therefore failed closed with `MCP tool call requires approval, but approval
policy is never`. The evidence run used the documented explicit `approve` mode
for this temporary, read-only server. The Codex sandbox itself remained
`read-only`.

Exact command:

```powershell
codex exec `
  --ephemeral `
  --json `
  --color never `
  --sandbox read-only `
  --cd D:\project\cherry `
  -c 'mcp_servers.cherry.required=true' `
  -c 'mcp_servers.cherry.default_tools_approval_mode="approve"' `
  -c 'mcp_servers.cua_repl.enabled=false' `
  -c 'mcp_servers.kodro.enabled=false' `
  -c 'mcp_servers.node_repl.enabled=false' `
  'Use the configured Cherry MCP server. In order call read_workspace_summary, list_skills, list_skill_bundles, verify_workspace_integrity, and verify_receipt with receiptId rc-01M1779YFWYGBACKVW020XXT3R. Then use the read-only shell exactly once to run node D:\project\cherry\work\codex-mcp-capture\bundles\semantic-hero-section-with-a-real-h1-heading-workflow\scripts\verify.mjs. Report exact returned values. Distinguish workspace integrity, receipt integrity, and bundle file hashes. Do not edit files or use another MCP server.'
```

The ephemeral host thread was
`01a05d26-5780-7813-9fdc-70e62581843d`. Its trimmed JSON event stream showed
five successful calls, in order:

```json
{"type":"item.completed","item":{"type":"mcp_tool_call","server":"cherry","tool":"read_workspace_summary","arguments":{},"error":null,"status":"completed"}}
{"type":"item.completed","item":{"type":"mcp_tool_call","server":"cherry","tool":"list_skills","arguments":{},"error":null,"status":"completed"}}
{"type":"item.completed","item":{"type":"mcp_tool_call","server":"cherry","tool":"list_skill_bundles","arguments":{},"error":null,"status":"completed"}}
{"type":"item.completed","item":{"type":"mcp_tool_call","server":"cherry","tool":"verify_workspace_integrity","arguments":{},"error":null,"status":"completed"}}
{"type":"item.completed","item":{"type":"mcp_tool_call","server":"cherry","tool":"verify_receipt","arguments":{"receiptId":"rc-01M1779YFWYGBACKVW020XXT3R"},"error":null,"status":"completed"}}
```

Exact decoded tool values:

```json
{
  "workspace": {
    "id": "ws-01M1779YEMQY3RZNEAHE2H82WN",
    "name": "EXAMPLE — Learn a landing page workflow",
    "revision": 1,
    "createdAt": "2026-08-29T16:58:04.116Z",
    "updatedAt": "2026-08-29T16:58:04.116Z",
    "description": "Shipped labelled example workspace. Safe to delete. Its approval is synthetic reference state, not proof of a live human decision."
  },
  "missionCount": 1,
  "missions": [
    {
      "id": "ms-01M1779YEZGAP8MGB047ZY0A8H",
      "title": "Build a landing snippet the lesson way",
      "state": "COMPLETE"
    }
  ],
  "skillCount": 1,
  "approvedMemories": 1,
  "receiptCount": 1,
  "exportedAt": "2026-08-29T16:58:04.159Z"
}
```

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

```json
{
  "bundles": [
    "semantic-hero-section-with-a-real-h1-heading-workflow"
  ]
}
```

Workspace integrity and receipt integrity are separate checks. Both matched:

```json
{
  "stored": "9b3a8e1102fdf4b6fff5f0779b9ba9a8a831a2706796de18ef3d32a9cff019b6",
  "recomputed": "9b3a8e1102fdf4b6fff5f0779b9ba9a8a831a2706796de18ef3d32a9cff019b6",
  "matches": true
}
```

```json
{
  "receiptId": "rc-01M1779YFWYGBACKVW020XXT3R",
  "stored": "8574bc7d97bb66a7c0de07947c6fdfd487c140373093f5ba071786b3bcf7ba58",
  "recomputed": "8574bc7d97bb66a7c0de07947c6fdfd487c140373093f5ba071786b3bcf7ba58",
  "matches": true
}
```

The one shell invocation exited `0`. The shipped verifier checked the 22 file
hashes declared by `MANIFEST.json`, then the embedded receipt hash. The bundle
contains 23 files in total when `MANIFEST.json` itself is included:

```text
ok SKILL.md
ok agents/openai.yaml
ok cherry.json
ok evals/acceptance-tests.json
ok evals/routing-cases.json
ok mission.json
ok policies/approvals.md
ok policies/originality.md
ok policies/safety.md
ok receipt.json
ok references/evidence.md
ok references/memory-policy.md
ok references/observations.json
ok references/principles.md
ok scripts/verify.mjs
ok skillgraph.json
ok targets/claude-code/CLAUDE.md
ok targets/claude-code/agents/cherry-skill-agent.md
ok targets/claude-code/hooks.example.json
ok targets/claude-code/install.md
ok targets/codex/AGENTS.md
ok targets/codex/install.md
ok receipt.json hash (tamper-evident, not a signature)
Bundle verification passed
```

The MCP bridge lists the compiled bundle directory; the bundle's shipped local
`scripts/verify.mjs` performs file-hash verification. The enclosing ZIP hash was
computed independently with `Get-FileHash`. Cherry does not claim that
`list_skill_bundles` itself verifies bundle contents.

## Direct JSON-RPC protocol replay

This is a separate protocol replay against the same registered server command,
not the live-host proof above. Exact PowerShell invocation:

```powershell
$messages = @(
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"codex-live-capture","version":"0.151.0-alpha.7.2"}}}'
  '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}'
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"read_workspace_summary","arguments":{}}}'
  '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_skills","arguments":{}}}'
  '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"list_skill_bundles","arguments":{}}}'
  '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"verify_workspace_integrity","arguments":{}}}'
  '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"verify_receipt","arguments":{"receiptId":"rc-01M1779YFWYGBACKVW020XXT3R"}}}'
)

$messages | node runner\mcp\server.mjs `
  --workspace public\examples\example-workspace.json `
  --bundles work\codex-mcp-capture\bundles
```

The transcript below is decoded and normalized for review. The `tools/list`
response's full tool objects are reduced to their ordered names, and each
`tools/call` response's `result.content[0].text` JSON string is decoded and
promoted under `result`. IDs, methods, arguments, and decoded values are
unchanged.

```jsonl
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"codex-live-capture","version":"0.151.0-alpha.7.2"}}}
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{}},"serverInfo":{"name":"cherry-bridge","version":"1.0.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
{"jsonrpc":"2.0","id":2,"result":{"tools":["read_workspace_summary","list_skills","verify_workspace_integrity","verify_receipt","list_skill_bundles"]}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"read_workspace_summary","arguments":{}}}
{"jsonrpc":"2.0","id":3,"result":{"workspace":{"id":"ws-01M1779YEMQY3RZNEAHE2H82WN","name":"EXAMPLE — Learn a landing page workflow","revision":1,"createdAt":"2026-08-29T16:58:04.116Z","updatedAt":"2026-08-29T16:58:04.116Z","description":"Shipped labelled example workspace. Safe to delete. Its approval is synthetic reference state, not proof of a live human decision."},"missionCount":1,"missions":[{"id":"ms-01M1779YEZGAP8MGB047ZY0A8H","title":"Build a landing snippet the lesson way","state":"COMPLETE"}],"skillCount":1,"approvedMemories":1,"receiptCount":1,"exportedAt":"2026-08-29T16:58:04.159Z"}}
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_skills","arguments":{}}}
{"jsonrpc":"2.0","id":4,"result":{"skills":[{"id":"sg-01M1779YFDFTENKXQ4MGSHTHX1","name":"Accessible landing snippet","status":"approved","version":"0.1.0","revision":1,"approvedRevision":1}]}}
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"list_skill_bundles","arguments":{}}}
{"jsonrpc":"2.0","id":5,"result":{"bundles":["semantic-hero-section-with-a-real-h1-heading-workflow"]}}
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"verify_workspace_integrity","arguments":{}}}
{"jsonrpc":"2.0","id":6,"result":{"stored":"9b3a8e1102fdf4b6fff5f0779b9ba9a8a831a2706796de18ef3d32a9cff019b6","recomputed":"9b3a8e1102fdf4b6fff5f0779b9ba9a8a831a2706796de18ef3d32a9cff019b6","matches":true}}
{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"verify_receipt","arguments":{"receiptId":"rc-01M1779YFWYGBACKVW020XXT3R"}}}
{"jsonrpc":"2.0","id":7,"result":{"receiptId":"rc-01M1779YFWYGBACKVW020XXT3R","stored":"8574bc7d97bb66a7c0de07947c6fdfd487c140373093f5ba071786b3bcf7ba58","recomputed":"8574bc7d97bb66a7c0de07947c6fdfd487c140373093f5ba071786b3bcf7ba58","matches":true}}
```

## Cleanup proof

The temporary global registration was removed immediately after capture:

```text
> codex mcp remove cherry
Removed global MCP server 'cherry'.

> codex mcp get cherry --json
Error: No MCP server named 'cherry' found.
```

## Claim supported by this capture

**Validated — native Codex MCP session, 1 September 2026.** A
ChatGPT-authenticated Codex CLI host initialized Cherry's shipped STDIO bridge,
read its labelled example workspace and approved sample skill, discovered the
compiled bundle, recomputed matching workspace and receipt hashes, and ran the
bundle's standalone verifier in a read-only sandbox. This does not establish a
live browser WebMCP session or a live human approval.
