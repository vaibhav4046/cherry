# Cherry God Mode design (spec pointer)

The design of record for this branch lives in `docs/god-mode/`:

- `NORTHSTAR.md`: product decision, IA, policy profile, scope governor.
- `ARCHITECTURE.md`: three planes, exact TypeScript and runner contracts, HTTP routes, lane
  ownership, fixture contract.
- `CAPABILITY_AUDIT.md`: what exists, what is a gap, host inventory.
- `SECURITY_AND_POLICY.md`: threat model and default policy.
- `CLAIMS_MATRIX.md`: every claim with status and evidence.
- `RESEARCH.md`, `GROK_PARITY_MATRIX.md`, `OPENAI_INTEGRATION.md`: official-source findings.
- `SCALE_DESIGN.md`, `ROADMAP.md`: post-hackathon architecture.

Decisions taken during design: extend `src/cherry/workforce/` rather than creating
`src/cherry/orchestration/`; the runner owns DAG progression so a closed page stops nothing the
runner already leased; envelopes are hashed in the browser and materialised per attempt on the
runner with both hashes recorded; the mock host is test-only behind an explicit runner flag.
