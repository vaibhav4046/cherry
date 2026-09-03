# God Mode real-host capture

Started 2026-09-02T13:39:14.557Z on commit be0e713156b2 (win32 10.0.26200, Node v24.12.0).
That commit lives on the pre-rebase God Mode lane and is not reachable from main; the capture
content is pinned by the SHA-256 of docs/release/benchmarks/god-mode-hosts.json
(baed40e34ce702642040e4198c821c0b35a0e7509fe661b0c0a7e486db71b9e5).
Switches: CHERRY_REAL_CODEX=1, CHERRY_REAL_CLAUDE=0. Fixture repository at a temporary path, base commit 18774c71f7a0.

## Hosts as the runner probed them

| Host | Available | Version | Boundary | Status | Details |
|---|---|---|---|---|---|
| codex | true | codex-cli 0.152.1 | process | shipped_tested | helpProbe=exec --help; flags=[object Object] |
| claude | false | unknown | process | unavailable | reason=claude not found on PATH or not executable (spawn claude ENOENT) |
| kilo | false | unknown | process | unavailable | reason=kilo not found on PATH or not executable (spawn kilo ENOENT) |
| kimi | false | unknown | process | unavailable | reason=kimi not found on PATH or not executable (spawn kimi ENOENT) |
| ollama | true | unknown | unknown | experimental | endpoint=http://127.0.0.1:11434 |
| omniroute | true | unknown | unknown | experimental | endpoint=http://127.0.0.1:20128 |
| openai-compatible | false | unknown | unknown | unavailable | reason=no endpoint configured for openai-compatible (use --host-command openai-compatible=<url>) |
| mock | true | unknown | process | shipped_tested | note=scripted host for tests |
| manual | true | unknown | unknown | shipped_tested | note=a person does the work; the runner records the handoff |

## Mission

Status: **succeeded**. Parallel overlap proven from the event log: **yes** (at most 2 distinct nodes were running at the same instant).

| Node | Host | Boundary | Sandbox | Attempts | Evaluation | Last error |
|---|---|---|---|---|---|---|
| developer-fix | codex codex-cli 0.152.1 | worktree-process | cherry/mission/mr-1601fffe40d1019f/wk-developer-fix from 18774c71f7 | 1 | passed: node --test exits 0 in the worker worktree passed |  |
| review-notes | codex codex-cli 0.152.1 | worktree-process | cherry/mission/mr-1601fffe40d1019f/wk-review-notes from 18774c71f7 | 1 | passed: artifacts/review.md contains a Verdict heading passed |  |

## Event log excerpt

```text
2026-09-02T13:39:15.994Z mr-1601fffe40d1019f mission_started
2026-09-02T13:39:16.898Z mr-1601fffe40d1019f:developer-fix sandbox_leased
2026-09-02T13:39:16.902Z mr-1601fffe40d1019f:developer-fix node_ready
2026-09-02T13:39:17.488Z mr-1601fffe40d1019f:review-notes sandbox_leased
2026-09-02T13:39:17.491Z mr-1601fffe40d1019f:review-notes node_ready
2026-09-02T13:39:17.501Z mr-1601fffe40d1019f:developer-fix node_started
2026-09-02T13:39:17.508Z mr-1601fffe40d1019f:review-notes node_started
2026-09-02T13:39:51.938Z mr-1601fffe40d1019f:review-notes node_completed
2026-09-02T13:39:52.019Z mr-1601fffe40d1019f:review-notes node_verifying
2026-09-02T13:39:52.021Z mr-1601fffe40d1019f:review-notes node_succeeded
2026-09-02T13:39:52.022Z mr-1601fffe40d1019f:review-notes sandbox_released
2026-09-02T13:39:53.630Z mr-1601fffe40d1019f:developer-fix node_completed
2026-09-02T13:39:54.038Z mr-1601fffe40d1019f:developer-fix node_verifying
2026-09-02T13:39:54.186Z mr-1601fffe40d1019f:developer-fix node_succeeded
2026-09-02T13:39:54.187Z mr-1601fffe40d1019f:developer-fix sandbox_released
2026-09-02T13:39:54.193Z mr-1601fffe40d1019f mission_status
```

## Limitations

- None recorded by the script. Provider completion was never treated as success; the runner ran node --test itself.

Raw record: docs/release/benchmarks/god-mode-hosts.json. File sha256:
baed40e34ce702642040e4198c821c0b35a0e7509fe661b0c0a7e486db71b9e5. Compact-JSON content sha256
(the value scripts/god-mode/run-real-host-smoke.mjs prints, computed over the compact JSON re-serialisation of the record):
20fc34e9d11225f1adaf0481a1f0fb08e83f9ea687923d0c3973fb76bf1b6dc2.

## Redaction

On 2026-09-03 the release authority replaced the capture machine's Windows account name and the
per-run temporary directory name with the placeholders `<user>` and `<run>`, on the red team's
finding that a public artifact should not carry local identity. Nothing else changed: every host
version, sandbox branch, exit code, timestamp, evaluation result and base commit in this record is
exactly what the run produced. The hashes above and the showcase replay pin
(`src/components/showcase/recorded-mission-trust.mjs`) were regenerated from the redacted file with
`scripts/capture-winner-demo.mjs`, so anyone can recompute them from what the repository ships. The
pre-redaction file hashed to c93e03d22f71f8ca9dca7e43b3f1396d3a713337f426614fd39cb3b72772a8b3.

## Claude Code (not captured)

The automated PATH probe above marked Claude unavailable because `claude` was absent from PATH. A
direct binary was found at `bin/claude.exe` (Claude Code 2.1.224), but a non-interactive run returned
`Failed to authenticate. API Error: 401 OAuth access token has been revoked.`
A sign-in is a human-only credential step, so no Claude execution was captured and the Claude Code
row stays EXPERIMENTAL. After `claude login`, the same command with `CHERRY_REAL_CLAUDE=1` and
`--claude-command "<path to claude.exe>"` records it in this file. The runner never stores or
prints credentials; only the probe result and the redacted, hashed excerpts appear here.
