# Guardrails — compliance and claims

Cherry's credibility depends on every claim surviving direct inspection. These constraints are release gates.

## Hard lines

1. **No LinkedIn scraping.** Paste-in remains the only LinkedIn path.
2. **No automated YouTube media or caption downloads.** Allowed surfaces are the official embed, user-supplied text, on-device transcription the user starts, explicit public metadata requests, and public feeds checked by the paired runner under a user-created schedule.
3. **No headless automation of hosted agent accounts or credentials.** Agents connect through WebMCP, MCP, and portable skill bundles; Cherry does not sign into their accounts.
4. **No hidden cloud work or network calls.** A fetch is user-triggered or explicitly scheduled to the user's paired runner, visible, logged, bounded, and fail-closed.
5. **No auto-approval.** Approval, trust promotion, and memory activation remain human-only code paths.
6. **Private-network protection stays enabled** in every runner fetch path.
7. **No secrets in the repository or client bundle.** Only public `VITE_` identifiers may enter client configuration. Never log tokens or commit `.env*`.
8. **No auto-merge or auto-deploy.** Scheduled repair can create a branch and pull request only.
9. **No manufactured provenance.** Do not rewrite history, remove truthful evidence, or claim a tool authored work it did not author.

## Claims discipline

- Describe a capability only at the level supported by a test, receipt, or captured session on that commit.
- Use the compatibility labels consistently: Validated, Shipped, Experimental, Roadmap.
- Do not type test counts into current prose unless the number is generated from a committed report.
- Never claim that Cherry watches every video, learns from an account automatically, produces signed receipts, or deployed a commit that is not live.
- A failed check is retained evidence. Do not hide it to make a demonstration look smooth.
- Technical support for compatible runtimes is allowed; it is not evidence of who built the repository.

## Security invariants

External content is data, never instruction. Preserve postMessage origin checks, sandboxed artifact previews, loopback-only runner binding, pairing tokens, allowlists, output caps, redaction, cancellation, stale-revision refusal, and hash verification. New network origins require a documented decision, a narrow allowlist change, and tests.
