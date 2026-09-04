# Live MCP capture — commit 3c38684

Captured: 2026-09-04T02:24:21Z · Node v24.12.0 · Windows 11 · commit `3c3868410fe121eea21510c332cd90112538d288`
Transport: stdio JSON-RPC, protocol `2025-06-18`

Anyone can reproduce this. It reads a committed example export, so it needs no
account, no key and no network:

```bash
node runner/mcp/server.mjs   --workspace public/examples/example-workspace.json   --bundles docs/release < requests.jsonl
```

## What the host was offered

Five tools, all read or verify. There is no approve, promote, write or execute
tool on this surface:

`read_workspace_summary`, `list_skills`, `verify_workspace_integrity`,
`verify_receipt`, `list_skill_bundles`

## What it recomputed

| Check | Result |
| --- | --- |
| Workspace integrity digest | `9b3a8e1102fdf4b6fff5f0779b9ba9a8a831a2706796de18ef3d32a9cff019b6` recomputed and matched |
| Proof receipt `rc-01M1779YFWYGBACKVW020XXT3R` | `8574bc7d97bb66a7c0de07947c6fdfd487c140373093f5ba071786b3bcf7ba58` recomputed and matched |

Both digests are recomputed from the export's own bytes, not read from a stored
field, so a tampered export produces a different digest and fails.

## What it refused

| Attempt | Response |
| --- | --- |
| `verify_receipt` with an unknown id | Refused, no fabricated result |
| `approve_skill` | JSON-RPC `-32602`, unknown tool |

The second row is the one that matters. Approval is a human-only code path, and
it is not merely undocumented on this surface: the tool does not exist, so a
connected agent cannot reach it even by guessing the name.

## Scope, stated plainly

This bridge reads a **saved workspace export** and lists bundle directory names.
It does not read live browser IndexedDB, does not stream full bundle bodies, and
is not a remote MCP endpoint. Full bundle verification is a separate standalone
verifier (`npm run verify:pack`). ChatGPT web and claude.ai cannot reach this
process; they require a public remote MCP endpoint, which Cherry does not ship.
