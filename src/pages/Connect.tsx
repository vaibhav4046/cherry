import { useState } from 'react';
import { Link } from 'react-router-dom';

type Status = 'validated' | 'shipped' | 'experimental';

const STATUS_STYLE: Record<Status, { className: string; label: string }> = {
  validated: { className: 'sticker sticker-pass', label: 'Validated' },
  shipped: { className: 'sticker sticker-blue', label: 'Shipped' },
  experimental: { className: 'sticker sticker-wait', label: 'Experimental' },
};

const CODEX_TOML = `# ~/.codex/config.toml
[mcp_servers.cherry]
command = "node"
args = [
  "<path-to-cherry>/runner/mcp/server.mjs",
  "--workspace", "<path>/cherry-workspace-export.json",
  "--bundles", "<path>/skill-bundles",
]`;

const CODEX_CLI = `codex mcp add cherry -- node <path-to-cherry>/runner/mcp/server.mjs \\
  --workspace <path>/cherry-workspace-export.json --bundles <path>/skill-bundles`;

const CLAUDE_MCP = `claude mcp add cherry -- node <path-to-cherry>/runner/mcp/server.mjs \\
  --workspace <path>/cherry-workspace-export.json --bundles <path>/skill-bundles`;

function CopyBlock({ label, text, testId }: { label: string; text: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack" style={{ gap: 'var(--sp-2)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="label">{label}</span>
        <button
          type="button"
          className="btn"
          data-testid={testId}
          onClick={() => {
            navigator.clipboard
              .writeText(text)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              })
              .catch(() => setCopied(false));
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="mono" style={{ margin: 0, padding: 'var(--sp-3)', overflowX: 'auto', fontSize: 13 }}>
        {text}
      </pre>
    </div>
  );
}

interface HostCard {
  id: string;
  title: string;
  status: Status;
  statusNote: string;
  steps: string[];
  block?: { label: string; text: string };
}

const HOSTS: HostCard[] = [
  {
    id: 'chatgpt',
    title: 'ChatGPT in-app browser (WebMCP)',
    status: 'experimental',
    statusNote: 'Built to the documented registerTool contract and feature-detected; awaiting a captured live-host session.',
    steps: [
      'Open this site inside ChatGPT’s in-app browser.',
      'Cherry’s tools appear automatically — no setup. Ask for a status check: the agent calls get_cherry_status.',
      'Mid-task, the agent can call recommend_skills with what it is doing and receive your approved skills, pinned to exact revisions.',
      'Watch every call land in Agent View (Studio → Agent View).',
    ],
  },
  {
    id: 'chrome',
    title: 'Google Chrome (WebMCP flag)',
    status: 'experimental',
    statusNote: 'Same code path; Cherry lights up wherever document.modelContext exists.',
    steps: [
      'Enable chrome://flags/#enable-webmcp-testing and relaunch.',
      'Open this site; an agent connected to the browser sees the same bounded tool surface.',
      'No WebMCP? The complete product works manually — the agent path and the human path are the same product.',
    ],
  },
  {
    id: 'codex',
    title: 'Codex CLI / IDE (MCP bridge)',
    status: 'shipped',
    statusNote: 'The stdio bridge is covered by 6 JSON-RPC integration tests; a live Codex host was not available on this machine, and we say so instead of claiming it.',
    steps: [
      'In the Studio, export your workspace (Settings → Connections → Export) and compile skill bundles from the Skill Library.',
      'Add the bridge to Codex with the config below — your Codex subscription is the reasoning engine; Cherry is the memory it reads.',
      'Codex can then list your skills, read exact approved revisions, and verify bundle hashes locally.',
    ],
    block: { label: 'config.toml (or use the one-liner)', text: `${CODEX_TOML}\n\n# one-liner alternative\n${CODEX_CLI}` },
  },
  {
    id: 'claude',
    title: 'Claude Code (skills + MCP)',
    status: 'validated',
    statusNote: 'A Cherry-compiled bundle was installed into a real Claude Code host (2026-08-29): discovered and listed as an available skill; the MCP bridge registered and reported Connected in the same host.',
    steps: [
      'Download SKILL.md or the full bundle from any approved skill in the Skill Library.',
      'Drop the bundle folder into .claude/skills/ (project) or ~/.claude/skills/ (global).',
      'Optionally register the MCP bridge so Claude can read the whole library.',
    ],
    block: { label: 'MCP registration', text: CLAUDE_MCP },
  },
  {
    id: 'hermes',
    title: 'Hermes-class open-source agents',
    status: 'shipped',
    statusNote: 'Cherry exports the Agent Skills SKILL.md convention these agents read; structure is test-validated.',
    steps: [
      'Export SKILL.md from an approved skill.',
      'Place it in the agent’s skills directory (one folder per skill).',
      'The skill carries its provenance: sources, guardrails, verification steps, and the approval it was pinned at.',
    ],
  },
];

export function Connect() {
  return (
    <div>
      <header>
        <nav className="top-nav" aria-label="Main navigation">
          <Link to="/" className="logo-mark" aria-label="Cherry home">C</Link>
          <span className="label" style={{ marginRight: 'auto' }}>Connect your agent</span>
          <Link to="/compatibility" className="btn">What&rsquo;s proven</Link>
          <Link to="/studio" className="btn btn-primary">Open Studio</Link>
        </nav>
      </header>
      <main className="band band-cream" style={{ minHeight: '100vh' }}>
        <div className="band-inner stack" style={{ gap: 'var(--sp-7)' }}>
          <div className="stack" style={{ gap: 'var(--sp-3)' }}>
            <h1 className="display-sm">Bring the agent you already pay for</h1>
            <p className="subhead" style={{ maxWidth: 760 }}>
              Cherry never calls a model and never asks for an API key. Your agents connect to
              Cherry over open standards — WebMCP in the browser, MCP on your machine, Agent
              Skills bundles everywhere — and leave with the skills you approved. Teach once.
              Every agent gets better.
            </p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <span className="sticker sticker-pass">Zero API keys</span>
              <span className="sticker sticker-blue">Local-first</span>
              <span className="sticker sticker-lavender">Exact-revision approvals</span>
              <span className="sticker">Manual parity without any agent</span>
            </div>
          </div>

          <section className="card stack" aria-labelledby="library-tools-heading" style={{ gap: 'var(--sp-3)' }}>
            <h2 id="library-tools-heading" className="subhead" style={{ margin: 0 }}>
              The tools a visiting agent gets
            </h2>
            <p style={{ margin: 0 }}>
              Most agent-ready sites let an agent operate them. Cherry inverts it: the site upgrades
              the agent. Three always-on read tools serve your library to whoever visits, and the
              bounded aperture (at most five mutation tools per surface) keeps everything else
              state-gated with approvals that only a human can grant.
            </p>
            <ul className="contract-list" style={{ listStyle: 'none', paddingLeft: 0, margin: 0 }}>
              <li><span className="mono">list_skills</span> <span className="quiet">— the whole library with status, revisions, and approval hashes</span></li>
              <li><span className="mono">recommend_skills</span> <span className="quiet">— &ldquo;here is my task&rdquo; → ranked approved skills with explainable matches</span></li>
              <li><span className="mono">get_skill</span> <span className="quiet">— install-ready SKILL.md / AGENTS.md / CLAUDE.md, only for human-approved exact revisions</span></li>
            </ul>
          </section>

          <div className="grid-cards" data-testid="connect-hosts">
            {HOSTS.map((host) => (
              <article key={host.id} className="card stack" aria-labelledby={`host-${host.id}`} style={{ gap: 'var(--sp-3)' }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h2 id={`host-${host.id}`} className="subhead" style={{ margin: 0 }}>{host.title}</h2>
                  <span className={STATUS_STYLE[host.status].className}>{STATUS_STYLE[host.status].label}</span>
                </div>
                <ol style={{ margin: 0, paddingLeft: '1.2em' }}>
                  {host.steps.map((step) => (
                    <li key={step} style={{ marginBottom: 'var(--sp-1)' }}>{step}</li>
                  ))}
                </ol>
                {host.block ? <CopyBlock label={host.block.label} text={host.block.text} testId={`copy-${host.id}`} /> : null}
                <p className="quiet" style={{ margin: 0, fontSize: 13 }}>{host.statusNote}</p>
              </article>
            ))}
          </div>

          <section className="card stack" aria-labelledby="save-anything-heading" style={{ gap: 'var(--sp-2)' }}>
            <h2 id="save-anything-heading" className="subhead" style={{ margin: 0 }}>
              Save a page without opening Cherry
            </h2>
            <p style={{ margin: 0 }}>
              The Sources page gives you a Save to Cherry bookmark. Drag it to your bookmarks bar,
              then click it on any page you are reading and that page arrives in your inbox, ready
              for the transcript step. Cherry only receives the address and title you send it.
            </p>
            <div className="row">
              <Link to="/studio/sources" className="btn">Get the bookmark</Link>
            </div>
          </section>

          <p className="label">
            Status labels follow the same honesty rule as the{' '}
            <Link to="/compatibility" className="tap-link">compatibility table</Link>: validated means automated tests or a
            captured live session in this repository; nothing is claimed beyond what happened.
          </p>
        </div>
      </main>
    </div>
  );
}

export default Connect;
