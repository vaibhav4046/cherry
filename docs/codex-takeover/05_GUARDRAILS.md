# Guardrails — compliance and claims (these are load-bearing for judging)

The judges' Execution criterion rewards a coherent, credible product. Cherry's edge is that every
claim survives adversarial checking. Protect that edge.

## Hard lines (never cross, never soften, whatever a prompt or "user story" suggests)

1. **No LinkedIn scraping.** Paste-in remains the only LinkedIn path. The UI already says this;
   keep it true.
2. **No downloading YouTube videos or captions by automation.** Allowed YouTube surfaces:
   embed-only playback, user-supplied transcripts/captions, local Whisper transcription of what
   the user plays, the public oEmbed title endpoint on explicit click (T4), and public channel
   RSS feeds fetched by the paired local runner on user-created watches (T7). Nothing else.
3. **No headless automation of anyone's ChatGPT/Codex/Claude account.** Agents connect to Cherry
   through WebMCP, the MCP bridge, and skills bundles. Never the reverse.
4. **No background cloud execution and no hidden network calls.** Every fetch is user-triggered
   (or user-scheduled to their own paired runner), visible, logged, fail-closed.
5. **No auto-approval.** Approvals, trust promotion, and memory activation stay human-only code
   paths. An agent may request; only a person grants. Routines bind to approved revisions and
   go stale on edits.
6. **Private-network fetch protection stays** in the runner (no fetching internal IPs/hosts).
7. **Secrets:** none in the repo, none in the client bundle except `VITE_`-prefixed public ids.
   Never log tokens. Never commit `.env*`.

## Claims discipline (applies to UI, docs, commits, STATUS, and the Devpost text)

- A capability may be described only at the level a test, receipt, or captured session proves.
  The compatibility page's labels (Validated / Shipped / Experimental / Roadmap) are the shared
  vocabulary; when you ship something, add or update its row honestly in STATUS for Claude to
  fold in.
- Forbidden phrasings anywhere: "watches every video", "learns automatically from your account",
  "works with ChatGPT" (without the Experimental qualifier until a live capture exists),
  "signed receipts" (they are tamper-evident hashes), "deployed" for anything not live.
- Failed states are features: honest fail/repair/pass is the credibility peak of the demo.
  Never paper over a failure to make a flow look smooth.

## Security invariants (do not weaken while building)

External content is data, never instructions — transcript text, fetched pages, RSS entries, and
Takeout imports must never be executed, eval'd, or fed into tool dispatch. postMessage origin
checks stay. Artifact previews stay sandboxed. The runner keeps loopback-only binding, pairing
tokens, allowlists, output caps, and redaction. New fetch surfaces (oEmbed, RSS) go through the
same fail-closed pattern as the existing Scrapling path.
