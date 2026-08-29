import { Link } from 'react-router-dom';
import { Ribbon } from '../components/Ribbon.tsx';
import { CherryBurst } from '../components/CherryBurst.tsx';
import { CherryMascot } from '../components/CherryMascot.tsx';
import { useReveal } from '../components/useReveal.ts';

const MARQUEE_TEXT =
  'CHERRY WINE · TEACH ONCE · YOUR AGENT DOES THE REST · LOCAL-FIRST · NO API KEY REQUIRED · ';

export function Landing() {
  useReveal();
  return (
    <div>
      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">{MARQUEE_TEXT.repeat(4)}</div>
      </div>

      <header>
        <nav className="top-nav" aria-label="Main navigation">
          <Link to="/" className="logo-mark" aria-label="Cherry home">C</Link>
          <div className="row nav-links" style={{ flex: 1, justifyContent: 'center' }}>
            <a href="#how" className="nav-pill">How it works</a>
            <a href="#agents" className="nav-pill">For agents</a>
            <a href="#security" className="nav-pill">Security</a>
            <Link to="/compatibility" className="nav-pill">What's proven</Link>
          </div>
          <Link to="/studio" className="btn btn-primary">Open Studio</Link>
        </nav>
      </header>

      <main>
        <section className="band band-blush ribbon-wrap" aria-labelledby="hero-heading">
          <Ribbon />
          <div className="band-inner ribbon-fg" style={{ textAlign: 'center', paddingTop: 'var(--sp-15)', paddingBottom: 'var(--sp-15)' }}>
            <CherryBurst />
            <h1 id="hero-heading" className="display">Cherry</h1>
            <p className="label" style={{ marginTop: 'var(--sp-2)' }}>CHERRY WINE · THE APPRENTICESHIP LAYER FOR AI AGENTS</p>
            <p className="subhead" style={{ maxWidth: 680, margin: 'var(--sp-5) auto', fontWeight: 700 }}>
              Teach an AI agent a workflow once — from a video, a doc, or your own corrections — and get
              back a skill you can inspect, approve, verify, and take to any agent you use.
            </p>
            <p style={{ maxWidth: 560, margin: '0 auto var(--sp-6)' }}>
              Cherry is the workbench where you and your agent do it together: it learns in front of you,
              stops for your approval, proves its work with recomputable receipts — and it runs entirely in
              your browser. No API key. No account. No cloud.
            </p>
            <div className="row" style={{ justifyContent: 'center' }} data-testid="hero-ctas">
              <Link to="/studio?demo=1" className="btn btn-primary">Try the guided example</Link>
              <Link to="/studio/quick" className="btn">Teach Cherry from a video</Link>
              <Link to="/studio" className="btn">Open MCP Studio</Link>
            </div>
          </div>
        </section>

        <section id="how" className="band band-cream" aria-labelledby="how-heading">
          <div className="band-inner">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <h2 id="how-heading" className="display-sm">Watch → SkillGraph → Run → Proof</h2>
                <p className="subhead" style={{ maxWidth: 700, marginTop: 'var(--sp-4)' }}>
                  One persistent journey, real state at every step. No staged demos, no fake activity.
                </p>
              </div>
              <div className="reveal">
                <CherryMascot pose="point" size={150} line="Four beats. One loop. I keep the receipts." />
              </div>
            </div>
            <div className="grid-cards reveal reveal-stagger" style={{ marginTop: 'var(--sp-8)' }}>
              <div className="card card-wash-sky stack">
                <span className="sticker sticker-blue">1 · Watch</span>
                <h3>Learn from permitted sources</h3>
                <p>
                  Load a permitted YouTube lesson through the official player, import your transcript, and
                  record timestamped observations. Spoken knowledge and visual observation stay distinct,
                  and coverage is computed — never invented.
                </p>
              </div>
              <div className="card card-wash-lavender stack">
                <span className="sticker sticker-violet">2 · SkillGraph</span>
                <h3>Structure with evidence</h3>
                <p>
                  Observations become an editable, versioned SkillGraph. Every node links to its evidence,
                  every revision is tracked, and approval binds to the exact revision you reviewed.
                </p>
              </div>
              <div className="card card-wash-mint stack">
                <span className="sticker sticker-mint">3 · Run</span>
                <h3>Execute with guardrails</h3>
                <p>
                  A connected ChatGPT/Codex host sees only the tools valid for the current state — five at a
                  time, no overload. Consequential steps stop for your approval. Manual mode always works.
                </p>
              </div>
              <div className="card card-wash-cherry stack">
                <span className="sticker sticker-cherry">4 · Proof</span>
                <h3>Verify and export</h3>
                <p>
                  Deterministic checks test actual files and state. Failures link to evidence, repairs
                  re-verify, and the proof receipt recomputes from hashes anyone can check.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="agents" className="band" aria-labelledby="agents-heading">
          <div className="band-inner">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <h2 id="agents-heading" className="display-sm">Humans and agents, same workbench</h2>
                <p className="subhead" style={{ maxWidth: 720, marginTop: 'var(--sp-4)' }}>
                  In a WebMCP-compatible client, your agent operates this exact page through state-aware site
                  tools. You watch every move in the Agent View — and everything it can do, you can do by hand.
                </p>
              </div>
              <div className="reveal">
                <CherryMascot pose="wave" size={150} flip line="Attach your agent over WebMCP — I hand it five tools at a time." />
              </div>
            </div>
            <div className="grid-cards reveal reveal-stagger" style={{ marginTop: 'var(--sp-8)' }}>
              <div className="card stack">
                <span className="sticker">State-aware tool aperture</span>
                <p>
                  At most five tools are exposed at a time, chosen by what the mission actually permits
                  right now. Tools appear when a phase begins and disappear when it ends — no tool soup,
                  no stale capabilities.
                </p>
              </div>
              <div className="card stack">
                <span className="sticker">Approval boundaries</span>
                <p>
                  The agent can request a checkpoint; only you can approve it, and only at the exact
                  revision you reviewed. There is no tool that approves, raises trust, or activates memory.
                </p>
              </div>
              <div className="card stack">
                <span className="sticker">Live Agent View</span>
                <p>
                  An inspector shows the current phase, exposed tools, recently retired tools, and every
                  recent tool call — the same truth in front of you and the agent.
                </p>
              </div>
              <div className="card stack">
                <span className="sticker">Portable skills</span>
                <p>
                  Export standards-aligned Agent Skills bundles with Codex and Claude Code install targets,
                  evidence references, policies, evals, and a standalone verification script.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="security" className="band band-gray" aria-labelledby="security-heading">
          <div className="band-inner">
            <h2 id="security-heading" className="display-sm">Trust is a feature</h2>
            <div className="grid-cards reveal reveal-stagger" style={{ marginTop: 'var(--sp-8)' }}>
              <div className="card stack">
                <span className="sticker sticker-fail">Untrusted by default</span>
                <p>
                  Every transcript, webpage, and tool output enters the Evidence Ledger as untrusted data.
                  Nothing from a source can become an instruction or a memory without your explicit approval.
                </p>
              </div>
              <div className="card stack">
                <span className="sticker sticker-wait">Exact-revision approvals</span>
                <p>
                  Approvals bind to the precise revision you reviewed. If the graph changes afterwards, the
                  approval is stale and Cherry demands a new one.
                </p>
              </div>
              <div className="card stack">
                <span className="sticker sticker-pass">Recomputable proof</span>
                <p>
                  Receipts hash the event ledger, artifacts, and assertions with SHA-256 over canonical JSON.
                  Tamper-evident and independently checkable — and honestly labelled: not a signature.
                </p>
              </div>
              <div className="card stack">
                <span className="sticker">Isolated previews</span>
                <p>
                  Generated artifacts render in a sandboxed, network-blocked preview that cannot touch your
                  Cherry data, storage, or the outside world.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="open" className="band band-maroon ribbon-wrap" aria-labelledby="open-heading">
          <div className="os-watermark" aria-hidden="true">CHERRY WINE</div>
          <Ribbon color="var(--color-cherry-pop)" />
          <div className="band-inner ribbon-fg" style={{ textAlign: 'center' }}>
            <div className="reveal">
              <CherryMascot pose="stamp" size={170} line="Approved by you. Verified by checks. Sealed by hashes." />
            </div>
            <h2 id="open-heading" className="display-sm">Open source, no meter running</h2>
            <p className="subhead" style={{ maxWidth: 640, margin: 'var(--sp-4) auto' }}>
              Cherry's core needs no AI API key, no cloud database, and no paid backend. Connecting an agent
              accelerates the same product — it never unlocks a different one.
            </p>
            <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--sp-6)' }}>
              <Link to="/studio?demo=1" className="btn" style={{ background: 'var(--color-cream)' }}>Try the guided example</Link>
              <Link to="/compatibility" className="btn" style={{ background: 'var(--color-cream)' }}>See what's proven</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="band band-cream">
        <div className="band-inner row" style={{ justifyContent: 'space-between' }}>
          <span className="label">Cherry · the apprenticeship layer for AI agents</span>
          <span className="label">MIT licensed · local-first · WebMCP Challenge 2026</span>
        </div>
      </footer>
    </div>
  );
}
