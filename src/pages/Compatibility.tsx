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
    surface: 'Your work inbox, your crew and your routines',
    status: 'validated',
    evidence: 'Work items run a strict state machine (no shortcut to success), the five-agent starter crew is editable, and routine schedules are DST-aware with exact-revision approval. Covered by the workforce and routine unit suites and a Playwright journey.',
  },
  {
    surface: 'One outcome becomes a plan, agents work it in parallel, and checks decide whether it is done',
    status: 'validated',
    evidence: 'A plan is validated (acyclic, bounded, every task with a definition of done and a real check) and hashed; the paired runner leases one sandbox per task (directory or git worktree, boundary stated as process or worktree-process, never a VM), runs up to three tasks at once, hands finished artifacts to dependants, and only its own checks or a person move a task to succeeded. Covered by the mission plan, orchestrator and evaluation unit suites, the runner executor suite, a browser-to-real-runner integration test and the Mission Control Playwright journey. Real Codex CLI execution captured in docs/release/GOD_MODE_REAL_HOST_CAPTURE.md (two worktrees, measured overlap); Claude Code execution not captured on this machine (sign-in required).',
  },
  {
    surface: 'The whole journey by hand, with no AI provider involved',
    status: 'validated',
    evidence: 'Playwright e2e walks workspace → lesson → transcript → evidence → SkillGraph → exact-revision approval → artifact → honest fail → repair → pass → receipt → hash recompute → export → import → reload, in the e2e suite of this repository.',
  },
  {
    surface: 'The tools a visiting agent can use right now',
    status: 'validated',
    evidence: 'Mock-host tests exercise the document.modelContext contract with up to 5 state-specific tools plus 7 always-on tools: AbortController lifecycle (old registrations verifiably aborted), runtime argument re-validation, cancellation, and a full journey through the same persisted state as the UI.',
  },
  {
    surface: 'ChatGPT and Codex built-in browsers (a live WebMCP host)',
    status: 'validated',
    evidence: 'Captured on 2026-09-04 in the ChatGPT desktop app, Work mode, model 5.6 Sol, against the deployed site. The host registered 10 site tools and called introduce_agent, read_cherry_context and list_cherry_capabilities through document.modelContext; Agent View changed from "Site tools registered, no agent call yet" to "Attached: ChatGPT Work - live capture". The returned tool list was exactly the documented aperture, 7 always-on plus 3 for the empty state. Asked directly, the host confirmed it used the registered tools and that no page control was clicked and no text typed. Full transcript: docs/release/WEBMCP_LIVE_HOST_CAPTURE.md. The complete learn to approve to retrieve journey was not exercised in that session, so the approval rows below stand on their own evidence.',
  },
  {
    surface: 'Chrome with the WebMCP flag',
    status: 'experimental',
    evidence: 'Same code path as above; feature detection means Cherry lights up wherever document.modelContext exists. Not tested against a flagged Chrome build in this release.',
  },
  {
    surface: 'Your skill library, and the tools that hand it to an agent',
    status: 'validated',
    evidence: 'Cross-workspace library with install-ready gating, unit-tested aggregation/ranking/exports, and a host-path e2e where the visiting agent asks recommend_skills mid-task, streams the install file in bounded parts, and recomputes the full-file sha256. State-specific tools stay bounded to 5; 7 always-on tools remain available.',
  },
  {
    surface: 'Following a creator, and the skills that come back proposed',
    status: 'validated',
    evidence: 'A human follows a channel; the paired runner checks its public feed daily; every new upload arrives as a source with a deterministic skill proposal (title, one-sentence "teaches", candidate steps once a transcript exists) that only a person can dismiss, and that follows the exact-revision approval of the draft it becomes. Unit-tested proposal lifecycle, migration, and archive round-trip; Playwright drives empty state, the labelled sample creator, transcript-changes-readiness, set-aside persistence, mobile overflow, axe, and reset. Cherry never downloads a video or captions and never calls a model; a live real-channel feed check was not captured in this repository, so the daily check itself stays proven only by runner tests.',
  },
  {
    surface: 'Exporting a skill as a bundle other agents can install',
    status: 'validated',
    evidence: 'Unit tests: frontmatter name matches directory, < 500 lines, full required tree, every MANIFEST hash recomputes, embedded receipt hash recomputable, unapproved graphs refuse to compile, traversal archives rejected.',
  },
  {
    surface: 'The check that proves a downloaded bundle was not tampered with',
    status: 'validated',
    evidence: 'Runner integration test executes the real script inside a real bundle: passes clean, exits non-zero after a one-byte tamper.',
  },
  {
    surface: 'Installing a Cherry skill into an Agent Skills host',
    status: 'shipped',
    evidence: "The compiler writes a standard Agent Skills bundle and its standalone verify.mjs passes all 22 file hashes under test. A bundle was unzipped into a real host's skills directory on 2026-08-29 and discovered there, but no transcript of that session was captured, so this row stays Shipped rather than Validated: the install path is implemented and hash-verified, and the live discovery is self-reported. Bundle compilation and verification are covered by automated tests.",
  },
  {
    surface: 'Installing a Cherry skill into Codex',
    status: 'validated',
    evidence: "Validated in a live Codex CLI host on 2026-09-01 (codex-cli 0.151.0-alpha.7.2, signed in through ChatGPT): the stdio bridge was registered with codex mcp add, the host listed Cherry's tools, read the workspace export, and verified the compiled bundle's SHA-256. Full transcript with exact hashes and reproduction steps: docs/release/CODEX_MCP_CAPTURE.md. The workspace used is the labelled example, so its approval is reference state, not a live human approval.",
  },
  {
    surface: 'The bridge that lets a local agent read and verify your work',
    status: 'validated',
    evidence: '6 stdio JSON-RPC integration tests, plus two captured live host sessions. The Codex CLI registration of 2026-09-01 is captured in full in docs/release/CODEX_MCP_CAPTURE.md. On 2026-09-03 a second MCP host executed the bridge tools against the shipped workspace export and the recomputed hashes matched on both the workspace integrity digest and a proof receipt, with a clean refusal on an unknown receipt id: docs/release/LIVE_MCP_HOST_CAPTURE.md.',
  },
  {
    surface: 'The runner on your own computer',
    status: 'validated',
    evidence: '11 runner integration tests (135 across the runner, sandbox, host, executor and bridge suites): loopback-only, pairing token required, origin allowlist, root/executable allowlists, no shell strings, output caps + secret redaction, crash recovery, real bundle verify incl. tamper detection.',
  },
  {
    surface: 'Previewing a file an agent produced, safely',
    status: 'validated',
    evidence: 'E2E: a hostile artifact with scripts, handlers, forms and remote resources renders as inert static content: empty sandbox, CSP script-src and connect-src none, remote references stripped, zero outbound requests, Cherry\'s own origin untouched.',
  },
  {
    surface: 'Receipts anyone can recompute',
    status: 'validated',
    evidence: 'Unit + e2e: recomputation matches; one-byte tamper flips the verdict; real receipts validate against the canonical JSON Schema. Labelled tamper-evident, never "signed".',
  },
  {
    surface: 'Taking your space out of Cherry and putting it back',
    status: 'validated',
    evidence: 'Unit + e2e: id-remapped import, internal references preserved, integrity hash verified, corrupted files rejected with zero writes.',
  },
  {
    surface: 'Installing Cherry as an app, and working offline',
    status: 'shipped',
    evidence: 'Manifest + service worker (static shell only; never caches workspace data). Valid on the live HTTPS deployment; install prompt behaviour is browser-controlled.',
  },
  {
    surface: 'The simpler routine adapters for Codex CLI and Claude CLI',
    status: 'shipped',
    evidence: 'These routine adapters run only when the CLI is on PATH; exit codes are recorded with verifiedSeparately=true and never count as verification. They were not exercised against a live host. Mission Control uses the separate agent-host path, whose real Codex run is captured in docs/release/GOD_MODE_REAL_HOST_CAPTURE.md; Claude Code mission execution is not captured.',
  },
  {
    surface: 'Syncing between your devices',
    status: 'roadmap',
    evidence: 'Out of scope for v1. No screen pretends it exists.',
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
          <h1 className="display-sm">What is proven, and what is not</h1>
          <p className="subhead" style={{ maxWidth: 760 }}>
            Each row says what was actually run. <strong>Validated</strong> means
            automated tests in this repository, or a captured live session recorded here, exercised it.{' '}
            <strong>Shipped</strong> means implemented and covered, but the external end of the wire was not
            automated. <strong>Experimental</strong> means built to the documented contract, awaiting a live
            host. <strong>Roadmap</strong> means it does not exist yet, and no screen pretends it does.
          </p>
          <div className="card stack" style={{ maxWidth: 760 }}>
            <h2 className="subhead" style={{ margin: 0 }}>Who this is for</h2>
            <p style={{ margin: 0 }}>
              The first user is a solo builder who already pays for Codex or ChatGPT and learns from other
              builders on YouTube and in long posts. They watch forty minutes to get a six-step process,
              apply it by hand, then explain it again from scratch to every agent, in every tool, every
              time. Nothing they teach an agent is versioned, portable, or checkable, so they cannot leave
              it running unattended either.
            </p>
            <p style={{ margin: 0 }}>
              Cherry stores the method as a versioned skill with its evidence. You approve one exact
              revision, and any agent that speaks WebMCP, MCP, or the Agent Skills format can use that
              revision and check its hash. We have not run a formal user study, and this page does not
              claim one.
            </p>
          </div>
          <p className="row" aria-label="Status legend" style={{ margin: 0 }}>
            {(Object.keys(STATUS_STYLE) as Status[]).map((status) => (
              <span key={status} className={STATUS_STYLE[status].className}>{STATUS_STYLE[status].label}</span>
            ))}
          </p>
          <ul className="stack" data-testid="compat-rows" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {ROWS.map((row) => (
              <li key={row.surface} className="card row" style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--sp-4)' }}>
                <div className="stack" style={{ gap: 'var(--sp-1)', flex: 1, minWidth: 240 }}>
                  <strong style={{ overflowWrap: 'anywhere' }}>{row.surface}</strong>
                  {/* Evidence cites file paths; let them break so a narrow column never scrolls sideways. */}
                  <span style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{row.evidence}</span>
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
