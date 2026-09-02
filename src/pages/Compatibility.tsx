import { Link } from 'react-router-dom';
import { CherryHomeLink } from '../components/CherryHomeLink.tsx';

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
    surface: 'Workforce: inbox, crew, routines (local)',
    status: 'validated',
    evidence: 'Work items run a strict state machine (no shortcut to success), the five-agent starter crew is editable, and routine schedules are DST-aware with exact-revision approval. Covered by the workforce and routine unit suites and a Playwright journey.',
  },
  {
    surface: 'Manual golden journey (no AI provider)',
    status: 'validated',
    evidence: 'Playwright e2e walks workspace → lesson → transcript → evidence → SkillGraph → exact-revision approval → artifact → honest fail → repair → pass → receipt → hash recompute → export → import → reload, in the e2e suite of this repository.',
  },
  {
    surface: 'Tools the agent can use right now (registered and retired by state)',
    status: 'validated',
    evidence: 'Mock-host tests exercise the document.modelContext contract with up to 5 state-specific tools plus 7 always-on tools: AbortController lifecycle (old registrations verifiably aborted), runtime argument re-validation, cancellation, and a full journey through the same persisted state as the UI.',
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
    surface: 'Skill Library + global library tools (list / recommend / get)',
    status: 'validated',
    evidence: 'Cross-workspace library with install-ready gating, unit-tested aggregation/ranking/exports, and a host-path e2e where the visiting agent asks recommend_skills mid-task, streams the install file in bounded parts, and recomputes the full-file sha256. State-specific tools stay bounded to 5; 7 always-on tools remain available.',
  },
  {
    surface: 'Creators watch engine (follow a creator, proposed skills)',
    status: 'validated',
    evidence: 'A human follows a channel; the paired runner checks its public feed daily; every new upload arrives as a source with a deterministic skill proposal (title, one-sentence "teaches", candidate steps once a transcript exists) that only a person can dismiss, and that follows the exact-revision approval of the draft it becomes. Unit-tested proposal lifecycle, migration, and archive round-trip; Playwright drives empty state, the labelled sample creator, transcript-changes-readiness, set-aside persistence, mobile overflow, axe, and reset. Cherry never downloads a video or captions and never calls a model; a live real-channel feed check was not captured in this repository, so the daily check itself stays proven only by runner tests.',
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
    status: 'validated',
    evidence: "Validated in a live Codex CLI host on 2026-09-01 (codex-cli 0.151.0-alpha.7.2, signed in through ChatGPT): the stdio bridge was registered with codex mcp add, the host listed Cherry's tools, read the workspace export, and verified the compiled bundle's SHA-256. Full transcript with exact hashes and reproduction steps: docs/release/CODEX_MCP_CAPTURE.md. The workspace used is the labelled example, so its approval is reference state, not a live human approval.",
  },
  {
    surface: 'Native MCP bridge (stdio, read/verify)',
    status: 'validated',
    evidence: '6 stdio JSON-RPC integration tests, PLUS a live registration in a real Claude Code host on 2026-08-29: claude mcp add cherry-wine … → claude mcp list reported Connected against a real workspace export.',
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
    surface: 'Accounts (Privy, opt-in)',
    status: 'shipped',
    evidence: 'Guest-first stays the default: every feature works with zero configuration and judges never hit a login wall. Privy sign-in activates only when VITE_PRIVY_APP_ID is present at build time (the SDK lives in a lazy chunk that guest mode never downloads). D-008 originally declined auth for v1; it returned strictly opt-in.',
  },
];

export function Compatibility() {
  return (
    <div>
      <header>
        <nav className="top-nav" aria-label="Main navigation">
          <CherryHomeLink />
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
          <p className="row" aria-label="Status legend" style={{ margin: 0 }}>
            {(Object.keys(STATUS_STYLE) as Status[]).map((status) => (
              <span key={status} className={STATUS_STYLE[status].className}>{STATUS_STYLE[status].label}</span>
            ))}
          </p>
          <ul className="stack" data-testid="compat-rows" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {ROWS.map((row) => (
              <li key={row.surface} className="card row" style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--sp-4)' }}>
                <div className="stack" style={{ gap: 'var(--sp-1)', flex: 1, minWidth: 240 }}>
                  <strong>{row.surface}</strong>
                  <span style={{ fontSize: 14 }}>{row.evidence}</span>
                </div>
                <span className={STATUS_STYLE[row.status].className}>{STATUS_STYLE[row.status].label}</span>
              </li>
            ))}
          </ul>
          <p className="label">
            Full evidence with commands and outputs: docs/release/ in the repository.
          </p>
        </div>
      </main>
    </div>
  );
}
