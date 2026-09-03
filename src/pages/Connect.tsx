import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CherryHomeLink } from '../components/CherryHomeLink.tsx';

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

function CopyBlock({ label, name, text, testId }: { label: string; name: string; text: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack" style={{ gap: 'var(--sp-2)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="label">{label}</span>
        {/* Two Copy buttons share this page; the name tells them apart for screen readers. */}
        <button
          type="button"
          className="btn"
          data-testid={testId}
          aria-label={`${copied ? 'Copied' : 'Copy'} ${name}`}
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
      <span className="sr-only" role="status">{copied ? `${name} copied to the clipboard` : ''}</span>
      {/* Wrapped, not scrolled: every character stays visible on a phone and no
          keyboard-unreachable scroll region is created. Copy sends the exact text. */}
      <pre className="mono" style={{ margin: 0, padding: 'var(--sp-3)', fontSize: 13, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
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
  block?: { label: string; name: string; text: string };
}

const HOSTS: HostCard[] = [
  {
    id: 'chatgpt',
    title: 'ChatGPT in-app browser (WebMCP)',
    status: 'experimental',
    statusNote: 'Built to the documented registerTool contract and feature-detected; awaiting a captured live-host session.',
    steps: [
      'Open this site in the built-in browser of the ChatGPT desktop app, ChatGPT Work or Codex (the challenge resources, as of 2 September, name GPT-5.6 Sol or Terra for site tools), then choose Site tools in the address bar to see what Cherry provides.',
      'Cherry’s tools appear automatically, no setup. Ask for a status check: the agent calls get_cherry_status.',
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
      'No WebMCP? The complete product works manually. The agent path and the human path are the same product.',
    ],
  },
  {
    id: 'codex',
    title: 'Codex CLI (MCP bridge)',
    status: 'validated',
    statusNote:
      'Validated in a live Codex CLI host on 2026-09-01: the stdio bridge was registered with codex mcp add, the host listed Cherry’s tools, read the workspace export, and verified the compiled bundle’s SHA-256 (transcript: docs/release/CODEX_MCP_CAPTURE.md).',
    steps: [
      'In the Studio, export your workspace (Settings → Connections → Export) and compile skill bundles from the Skill Library.',
      'Add the bridge to Codex with the config below. Your Codex subscription is the reasoning engine; Cherry is the memory it reads.',
      'Codex can then list your skills, read exact approved revisions, and verify bundle hashes locally.',
    ],
    block: { label: 'config.toml (or use the one-liner)', name: 'Codex configuration', text: `${CODEX_TOML}\n\n# one-liner alternative\n${CODEX_CLI}` },
  },
  {
    id: 'claude',
    title: 'Claude Code (skills + MCP)',
    status: 'validated',
    statusNote: 'A Cherry-compiled bundle was installed into a real Claude Code host (2026-08-29): discovered and listed as an available skill; the MCP bridge registered and reported Connected in the same host. Recorded in the decision log (docs/CHERRY_DECISIONS.md, D-012); no transcript file was captured. Mission execution on Claude Code is not captured and stays Experimental.',
    steps: [
      'Download SKILL.md or the full bundle from any approved skill in the Skill Library.',
      'Drop the bundle folder into .claude/skills/ (project) or ~/.claude/skills/ (global).',
      'Optionally register the MCP bridge so Claude can read the whole library.',
    ],
    block: { label: 'MCP registration', name: 'Claude Code MCP registration', text: CLAUDE_MCP },
  },
  {
    id: 'hermes',
    title: 'Hermes-class open-source agents',
    status: 'shipped',
    statusNote: 'Cherry exports the Agent Skills SKILL.md convention these agents read; structure is test-validated.',
    steps: [
      'Export SKILL.md from an approved skill.',
      'Place it in the agent’s skills directory (one folder per skill).',
      'The skill carries where it came from: sources, guardrails, verification steps, and the approval it was pinned at.',
    ],
  },
];

export function Connect() {
  return (
    <div>
      <header>
        <nav className="top-nav" aria-label="Main navigation">
          <CherryHomeLink />
          <span className="label" style={{ marginRight: 'auto' }}>Connect your agent</span>
          <Link to="/compatibility" className="btn">What&rsquo;s proven</Link>
          <Link to="/studio" className="btn btn-primary">Open Studio</Link>
        </nav>
      </header>
      <main className="band band-cream" style={{ minHeight: '100vh' }}>
        <div className="band-inner stack" style={{ gap: 'var(--sp-8)' }}>
          <div className="stack" style={{ gap: 'var(--sp-3)' }}>
            <h1 className="display-sm">Bring the agent you already pay for</h1>
            <p className="subhead" style={{ maxWidth: 760 }}>
              Cherry makes no model API calls of its own and never asks for an API key. Reasoning
              comes from the agent hosts you already pay for; transcription, when you choose it, runs
              on your device. Your agents connect to Cherry over open standards (WebMCP in the browser,
              MCP on your machine, Agent Skills bundles everywhere) and leave with the skills you approved. Teach once.
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
              the agent. Seven tools are available on every page, and three of them hand your approved
              skills to whoever visits. Everything that changes anything is limited to five tools per
              page, and the decisions that matter can only be granted by you.
            </p>
            <ul className="contract-list" style={{ listStyle: 'none', paddingLeft: 0, margin: 0 }}>
              <li><span className="mono">list_skills</span> <span className="quiet">: the whole library with status, revisions, and approval hashes</span></li>
              <li><span className="mono">recommend_skills</span> <span className="quiet">: &ldquo;here is my task&rdquo; returns ranked approved skills with explainable matches</span></li>
              <li><span className="mono">get_skill</span> <span className="quiet">: install-ready SKILL.md / AGENTS.md / CLAUDE.md, only for human-approved exact revisions</span></li>
            </ul>
          </section>

          <div className="grid-cards host-grid" data-testid="connect-hosts">
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
                {host.block ? <CopyBlock label={host.block.label} name={host.block.name} text={host.block.text} testId={`copy-${host.id}`} /> : null}
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
