import { Link } from 'react-router-dom';

type Status = 'validated' | 'shipped' | 'experimental' | 'roadmap';

const STATUS_STYLE: Record<Status, { className: string; label: string }> = {
  validated: { className: 'sticker sticker-pass', label: 'Validated' },
  shipped: { className: 'sticker sticker-blue', label: 'Shipped' },
  experimental: { className: 'sticker sticker-wait', label: 'Experimental' },
  roadmap: { className: 'sticker', label: 'Roadmap' },
};

interface Row {
  surface: string;
  status: Status;
  evidence: string;
}

/**
 * Every row states what was ACTUALLY tested, with the test that proves it.
 * "Validated" = automated tests ran against it in this repository.
 * "Shipped" = implemented and unit-covered, but not exercised against the
 * external system end-to-end. "Experimental" = works against the documented
 * contract; the live external host was not available to test.
 */
const ROWS: Row[] = [
  {
    surface: 'Manual golden journey (no AI provider)',
    status: 'validated',
    evidence: 'Playwright e2e walks workspace → lesson → transcript → evidence → SkillGraph → exact-revision approval → artifact → honest fail → repair → pass → receipt → hash recompute → export → import → reload. 19 e2e tests total.',
  },
  {
    surface: 'WebMCP tool aperture (register/unregister by state)',
    status: 'validated',
    evidence: '8 unit tests against the document.modelContext contract with a mock host: aperture ≤ 5+2, AbortController lifecycle (old registrations verifiably aborted), runtime argument re-validation, cancellation, full journey through the tool layer against the same persisted state as the UI.',
  },
  {
    surface: 'ChatGPT / Codex in-app browser (live WebMCP host)',
    status: 'experimental',
    evidence: 'Implemented against the current registerTool API and feature-detected. NOT yet exercised inside a live proprietary client from this environment — the Agent View and Connections diagnostics show live registration state the moment one attaches. We say this plainly instead of claiming it.',
  },
  {
    surface: 'Chrome with the WebMCP flag',
    status: 'experimental',
    evidence: 'Same code path as above; feature detection means Cherry lights up wherever document.modelContext exists. Not tested against a flagged Chrome build in this release.',
  },
  {
    surface: 'Agent Skills bundle export (SKILL.md + targets)',
    status: 'validated',
    evidence: 'Unit tests: frontmatter name matches directory, < 500 lines, full required tree, every MANIFEST hash recomputes, embedded receipt hash recomputable, unapproved graphs refuse to compile, traversal archives rejected.',
  },
  {
    surface: 'Bundle verification script (scripts/verify.mjs)',
    status: 'validated',
    evidence: 'Runner integration test executes the real script inside a real bundle: passes clean, exits non-zero after a one-byte tamper.',
  },
  {
    surface: 'Claude Code skill install (live host)',
    status: 'validated',
    evidence: "A Cherry-compiled bundle was unzipped into a real Claude Code host's ~/.claude/skills/ on 2026-08-29; the host discovered it and listed it as an available skill in a live session. The bundle's standalone verify.mjs passed all 22 file hashes first.",
  },
  {
    surface: 'Codex install target',
    status: 'shipped',
    evidence: 'Generated AGENTS.md + install.md per bundle; structure test-validated. A live Codex host was not available on this machine.',
  },
  {
    surface: 'Native MCP bridge (stdio, read/verify)',
    status: 'validated',
    evidence: '6 stdio JSON-RPC integration tests, PLUS a live registration in a real Claude Code host on 2026-08-29: claude mcp add cherry-wine … → claude mcp list reported ✔ Connected against a real workspace export.',
  },
  {
    surface: 'Local runner (pairing, allowlists, deterministic jobs)',
    status: 'validated',
    evidence: '9 integration tests: loopback-only, pairing token required, origin allowlist, root/executable allowlists, no shell strings, output caps + secret redaction, crash recovery, real bundle verify incl. tamper detection.',
  },
  {
    surface: 'Artifact preview isolation',
    status: 'validated',
    evidence: 'E2E hostile artifact attempts storage access, external fetch, and parent navigation from inside the preview: all blocked, errors surfaced to the visible console and the proof ledger.',
  },
  {
    surface: 'Proof receipts (RFC 8785 + SHA-256)',
    status: 'validated',
    evidence: 'Unit + e2e: recomputation matches; one-byte tamper flips the verdict; real receipts validate against the canonical JSON Schema. Labelled tamper-evident, never "signed".',
  },
  {
    surface: 'Workspace export/import round trip',
    status: 'validated',
    evidence: 'Unit + e2e: id-remapped import, internal references preserved, integrity hash verified, corrupted files rejected with zero writes.',
  },
  {
    surface: 'PWA install + offline shell',
    status: 'shipped',
    evidence: 'Manifest + service worker (static shell only; never caches workspace data). Valid on the live HTTPS deployment; install prompt behaviour is browser-controlled.',
  },
  {
    surface: 'Codex CLI / Claude CLI runner adapters',
    status: 'shipped',
    evidence: 'Adapters run only when the CLI exists on PATH; exit codes are recorded with verifiedSeparately=true and never count as verification. Not exercised here — this machine intentionally holds no provider credentials.',
  },
  {
    surface: 'Encrypted cross-device sync',
    status: 'roadmap',
    evidence: 'Deliberately outside golden v1. No UI pretends it exists.',
  },
  {
    surface: 'Accounts / auth',
    status: 'roadmap',
    evidence: 'Cherry is guest-first by design: zero-dollar core, no server, nothing to log into. Third-party auth (e.g. Privy) was assessed and declined for v1 — it adds an external dependency and demo friction without unlocking any current capability (decision D-008).',
  },
];

export function Compatibility() {
  return (
    <div>
      <header>
        <nav className="top-nav" aria-label="Main navigation">
          <Link to="/" className="logo-mark" aria-label="Cherry home">C</Link>
          <span className="label" style={{ marginRight: 'auto' }}>What's proven</span>
          <Link to="/studio" className="btn btn-primary">Open Studio</Link>
        </nav>
      </header>
      <main className="band band-cream" style={{ minHeight: '100vh' }}>
        <div className="band-inner stack" style={{ gap: 'var(--sp-6)' }}>
          <h1 className="display-sm">Compatibility & proof</h1>
          <p className="subhead" style={{ maxWidth: 760 }}>
            Every claim below is labelled by what actually happened. <strong>Validated</strong> means
            automated tests in this repository exercised it. <strong>Shipped</strong> means implemented
            and covered, but the external end of the wire was not automated. <strong>Experimental</strong>{' '}
            means built to the documented contract, awaiting a live host. <strong>Roadmap</strong> means
            it does not exist yet — and no screen pretends it does.
          </p>
          <div className="row">
            {(Object.keys(STATUS_STYLE) as Status[]).map((status) => (
              <span key={status} className={STATUS_STYLE[status].className}>{STATUS_STYLE[status].label}</span>
            ))}
          </div>
          <div className="stack" data-testid="compat-rows">
            {ROWS.map((row) => (
              <div key={row.surface} className="card row" style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--sp-4)' }}>
                <div className="stack" style={{ gap: 'var(--sp-1)', flex: 1, minWidth: 240 }}>
                  <strong>{row.surface}</strong>
                  <span style={{ fontSize: 13 }}>{row.evidence}</span>
                </div>
                <span className={STATUS_STYLE[row.status].className}>{STATUS_STYLE[row.status].label}</span>
              </div>
            ))}
          </div>
          <p className="label">
            Full evidence with commands and outputs: docs/release/ in the repository.
          </p>
        </div>
      </main>
    </div>
  );
}
