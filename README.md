<p align="center">
  <img src="docs/media/cherry-landing.png" alt="Cherry landing page with the recorded real Codex run" width="820">
</p>

# Cherry 🍒

**One task. An entire AI team. Human authority intact.**

Cherry turns an outcome into a bounded plan with dependencies, definitions of done, real checks, and explicit human decisions before consequential work. Codex workers can execute tasks in separate worktrees on a paired computer; Cherry records the evidence, refuses unsafe shortcuts, and counts work as complete only when checks pass or a person decides.

Cherry makes no model API calls in the browser and the guest product asks for no API key. Reasoning comes from the agent host the user already chose. Transcription, when requested, runs on the user's device. Cherry contributes the plan, state machine, isolation, approvals, verification, memory, and proof.

Give Cherry a source you are allowed to learn from and it drafts a method from timestamped evidence, waits for approval on an exact revision, verifies a real output, preserves honest failures, seals the result with a recomputable receipt, and serves the finished skill back to compatible agents.

- **Live:** https://cherry-wine.vercel.app
- **Judge route:** https://cherry-wine.vercel.app/showcase
- **What is proven:** https://cherry-wine.vercel.app/compatibility
- **Hourly maintenance:** [docs/CODEX_AUTOMATION.md](docs/CODEX_AUTOMATION.md)

Built for the **OpenAI WebMCP Challenge 2026**. MIT licensed. No paid tier, no required account, and no telemetry.

## The inversion

Most agent-ready sites let an agent operate them. **Cherry's site upgrades the agent.**

Seven tools are registered on every compatible WebMCP page. Three serve the user's approved library to a visiting agent:

| Tool | What it does |
| --- | --- |
| `list_skills` | Lists taught skills with status, revision, and approval hash |
| `recommend_skills` | Ranks approved skills for a task and explains each match |
| `get_skill` | Streams install-ready portable files in bounded parts with a full-file SHA-256 |

Only human-approved exact revisions are installable. An agent may request approval; it cannot grant it. Contextual mutation tools are registered and retired as product state changes, with no more than five exposed for the active surface.

## How it works

1. **Add a permitted source.** Use an official YouTube embed plus user-supplied text or on-device transcription, an article, plain text, a file, the user's own watch-history export, or the Save to Cherry bookmarklet.
2. **Approve one exact method.** Cherry compiles evidence into a readable, versioned skill. Any relevant edit makes the approval stale.
3. **Run and check it.** Codex executes bounded work in isolated worktrees. Cherry keeps the failure, repair, verification result, and event chain.
4. **Carry it forward.** Export a portable skill bundle or let a visiting WebMCP/MCP agent retrieve the approved revision and verify its hash.

## Quickstart

```bash
npm ci
npm run dev        # http://127.0.0.1:5273
```

Everything works as a guest with zero configuration. Optional sign-in activates only when `VITE_PRIVY_APP_ID` is present at build time; guest mode does not load the auth integration.

## Verification

```bash
npm run gates              # typecheck + lint + unit + runner/MCP tests
npm run test:e2e:critical  # judge route + complete registered-closure journey
npm run verify:all         # complete repository verification
npm run health:hourly      # read-only public-route check + JSON evidence
```

The source of truth is the GitHub Actions result on the exact commit, not a hand-written test count. The committed Playwright report is also audited: zero executed tests, unexpected failures, or an invalid skip ratio fail the submission audit.

Proof receipts use SHA-256 over RFC 8785 canonical JSON. Compiled bundles include a standalone verifier so a reviewer can recompute file hashes without trusting Cherry.

## Hourly Codex maintenance

`.github/workflows/hourly-maintenance.yml` runs every hour. It checks the lockfile install, deterministic gates, production build, bundle and service-worker integrity, submission evidence, the two critical WebMCP journeys, and the live public routes.

A failure opens or updates one incident issue. When an `OPENAI_API_KEY` repository secret is configured, the workflow may ask Codex for a bounded repair, rerun verification, and open a new pull request. It never auto-merges and never deploys. Set `CODEX_HOURLY_REPAIR=disabled` as a repository variable to keep monitoring active while disabling repair.

## Deliberate boundaries

- Cherry does not claim frame-level video understanding. It works from text the user provides or transcription the user starts.
- Cherry does not scrape LinkedIn, download YouTube media, or automate hosted agent accounts.
- Nothing fetches invisibly. Every fetch is user-triggered or explicitly scheduled to the user's paired runner and fails closed.
- Approvals, trust promotion, and memory activation are human-only code paths.
- Automated maintenance can prepare a pull request; a person still merges and deploys.
- Historical Git metadata and the append-only activity ledger remain intact. Current policy names the current Codex workflow without manufacturing past authorship.

## Contributing

Read [AGENTS.md](AGENTS.md), [docs/HARNESS.md](docs/HARNESS.md), and [CONTRIBUTING.md](CONTRIBUTING.md). Repository paths and architecture live in [docs/CHERRY_REPO_MAP.md](docs/CHERRY_REPO_MAP.md); scoped starting points live in [docs/GOOD_FIRST_ISSUES.md](docs/GOOD_FIRST_ISSUES.md).

## License

MIT. See [LICENSE](LICENSE).
