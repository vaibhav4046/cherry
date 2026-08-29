import { Link } from 'react-router-dom';
import { Ribbon, StickerCluster } from '../components/Ribbon.tsx';

const MARQUEE_TEXT =
  'TEACH ONCE · CHERRY REMEMBERS · EVERY AGENT GETS BETTER · LOCAL-FIRST · NO API KEY REQUIRED · ';

export function Landing() {
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
            <a href="#architecture" className="nav-pill">Architecture</a>
            <a href="#security" className="nav-pill">Security</a>
            <a href="#open" className="nav-pill">Open source</a>
          </div>
          <Link to="/studio" className="btn btn-primary">Open Studio</Link>
        </nav>
      </header>

      <main>
        <section className="band band-cherry ribbon-wrap" aria-labelledby="hero-heading">
          <Ribbon />
          <div className="band-inner ribbon-fg" style={{ textAlign: 'center', paddingTop: 'var(--sp-20)', paddingBottom: 'var(--sp-20)' }}>
            <div className="row" style={{ justifyContent: 'center', marginBottom: 'var(--sp-4)' }}>
              <span className="sticker sticker-sunburst">WebMCP native</span>
              <span className="sticker sticker-mint">Local-first</span>
              <span className="sticker sticker-violet">Zero API keys</span>
            </div>
            <h1 id="hero-heading" className="display">Cherry</h1>
            <p className="subhead" style={{ maxWidth: 720, margin: 'var(--sp-6) auto' }}>
              Your agents should not start from zero. Cherry watches how useful work gets done, turns the
              process into trusted memory and portable skills, then gives the agents you already use a
              mission they can execute and prove.
            </p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <Link to="/studio" className="btn btn-primary">Teach Cherry something</Link>
              <a href="#how" className="btn">See the loop</a>
            </div>
          </div>
        </section>

        <section id="how" className="band" aria-labelledby="how-heading">
          <div className="band-inner">
            <h2 id="how-heading" className="display-sm">Watch → SkillGraph → Run → Proof</h2>
            <p className="subhead" style={{ maxWidth: 700, marginTop: 'var(--sp-4)' }}>
              One persistent journey, real state at every step. No staged demos, no fake activity.
            </p>
            <div className="grid-cards" style={{ marginTop: 'var(--sp-8)' }}>
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

        <section id="architecture" className="band band-gray" aria-labelledby="arch-heading">
          <div className="band-inner">
            <h2 id="arch-heading" className="display-sm">Built like a product, priced like a protocol</h2>
            <div className="grid-cards" style={{ marginTop: 'var(--sp-8)' }}>
              <div className="card stack">
                <span className="sticker">Attached WebMCP</span>
                <p>
                  A compatible ChatGPT/Codex client works with Cherry's live page through dynamically
                  registered site tools. Works only while the page is open in a compatible client — Cherry
                  says so instead of pretending otherwise.
                </p>
              </div>
              <div className="card stack">
                <span className="sticker">Portable skills</span>
                <p>
                  Export standards-aligned Agent Skills with Codex and Claude Code install targets, evidence
                  references, policies, evals, and a verification script.
                </p>
              </div>
              <div className="card stack">
                <span className="sticker">Local runner</span>
                <p>
                  An optional localhost Node runner queues deterministic jobs with pairing, allowlists, and
                  timeouts. Runs only while your machine is on — it is not a cloud.
                </p>
              </div>
              <div className="card stack">
                <span className="sticker">Your data, your browser</span>
                <p>
                  Everything persists in IndexedDB in your browser. Export and import complete workspaces as
                  hash-verified JSON. No hosted database, no account, no tracking.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="security" className="band" aria-labelledby="security-heading">
          <div className="band-inner">
            <h2 id="security-heading" className="display-sm">Trust is a feature</h2>
            <div className="grid-cards" style={{ marginTop: 'var(--sp-8)' }}>
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

        <section id="open" className="band band-sky ribbon-wrap" aria-labelledby="open-heading">
          <Ribbon color="var(--color-electric-blue)" />
          <div className="band-inner ribbon-fg" style={{ textAlign: 'center' }}>
            <StickerCluster />
            <h2 id="open-heading" className="display-sm">Open source, no meter running</h2>
            <p className="subhead" style={{ maxWidth: 640, margin: 'var(--sp-4) auto' }}>
              Cherry's core needs no AI API key, no cloud database, and no paid backend. Connecting an agent
              accelerates the same product — it never unlocks a different one.
            </p>
            <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--sp-6)' }}>
              <Link to="/studio" className="btn btn-primary">Open Cherry Studio</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="band">
        <div className="band-inner row" style={{ justifyContent: 'space-between' }}>
          <span className="label">Cherry · the apprenticeship layer for AI agents</span>
          <span className="label">MIT licensed · local-first · WebMCP Challenge 2026</span>
        </div>
      </footer>
    </div>
  );
}
