# Copy guide — how Cherry talks

Voice: a calm expert who respects your time. Short sentences. Concrete nouns. No hype, no
exclamation marks, no "seamlessly/effortlessly/supercharge", no emoji. Say what happens, who
does it, and what the user gets. When something is limited or off, say so plainly — honesty is
the brand.

## The dictionary (UI labels only; never rename code, tool names, or docs of record)

| Never show a first-time user | Show instead |
| --- | --- |
| SkillGraph | skill |
| revision binding / approvedRevision | "approved exactly as you read it" / "v1 · r3" chips stay |
| aperture | "tools the agent can use right now" |
| provenance | "where this came from" |
| artifact set | "what it produced" |
| evidence record | "what the source said" (timestamped) |
| actor: human/agent | "you" / "your agent" |
| mission (in flows) | "project" in labels; flows should mostly not need the word |
| workspace (in flows) | invisible during T1/T2/T3; "your space" if unavoidable |
| trust promotion | "mark as reviewed" |
| proof receipt | "proof" (detail views may say "tamper-evident receipt") |
| deterministic verification | "real checks that can fail" |
| WebMCP host attached | "an agent is connected" |
| ingest | "save" / "add" |

Precise terms remain correct in: `/compatibility`, docs, commit messages, tests, and anywhere a
judge is the audience. The library card chips (v/r, hash prefix) stay — they're the proof
language, and they're short.

## Patterns

- Buttons: verb first, ≤ 3 words. "Save source", "Approve this version", "Teach another".
- Empty states: one sentence of why + one action. "Nothing saved yet. Paste a link to start."
- Errors: what failed + the one next step. "The fetch failed and nothing was saved. Pair your
  runner and try again."
- Honesty lines (keep these; they win points): "Nothing uploads anywhere.", "Outside content
  stays untrusted until you review it.", "This needs your approval — agents can ask, not act."
- Numbers beat adjectives: "42 checks passed" not "thoroughly tested".

## Banned in UI

Jargon table's left column; "simply/just/easily"; "AI-powered"; "revolutionary"; scare quotes;
ALL-CAPS emphasis; ellipses of suspense; any claim not backed by a shipped, tested behavior.
