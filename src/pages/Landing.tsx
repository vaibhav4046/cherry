import { Link } from 'react-router-dom';
import { Ribbon } from '../components/Ribbon.tsx';
import { CherryBurst } from '../components/CherryBurst.tsx';
import { CherryMascot } from '../components/CherryMascot.tsx';
import { useReveal } from '../components/useReveal.ts';
import { CarryFlow, ConnectArch, ProofFlow, RaysBurst, TeachFlow } from '../components/Diagrams.tsx';

const MARQUEE_TEXT =
  'CHERRY WINE · TEACH ONCE · PROVE IT · KEEP IT · LOCAL-FIRST · NO API KEY REQUIRED · ';

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
        {/* ---- Hero: the tagline, the cherry, nothing else ---- */}
        <section className="band band-maroon ribbon-wrap hero-cinema" aria-labelledby="hero-heading">
          <div className="os-watermark" aria-hidden="true">CHERRY WINE</div>
          <div className="band-inner ribbon-fg hero-grid">
            <div className="stack" style={{ gap: 'var(--sp-5)' }}>
              <p className="script-mark">Cherry</p>
              <p className="kicker">open source · local-first · no API key</p>
              <h1 id="hero-heading" className="type-3d">
                <span className="rise-line">Teach once.</span>{' '}
                <span className="rise-line">Prove it.</span>{' '}
                <span className="rise-line">Keep it.</span>
              </h1>
              <p className="subhead" style={{ maxWidth: 520, margin: 0, color: 'var(--color-cream)' }}>
                Turn any video into a skill your agent can run — inspected, approved by you, sealed
                with recomputable proof.
              </p>
              <div className="row" data-testid="hero-ctas" style={{ marginTop: 'var(--sp-2)' }}>
                <Link to="/studio?demo=1" className="btn btn-primary">Try the guided example</Link>
                <Link to="/studio/quick" className="btn">Teach Cherry from a video</Link>
                <Link to="/studio" className="link-quiet">Open MCP Studio</Link>
              </div>
            </div>
            <div className="rays-wrap reveal">
              <RaysBurst />
              <CherryBurst />
            </div>
          </div>
        </section>

        {/* ---- 01 · TEACH ---- */}
        <section id="how" className="band band-cream" aria-labelledby="teach-heading">
          <div className="band-inner">
            <div className="chapter-head">
              <span className="chapter-num" aria-hidden="true">01</span>
              <div className="stack" style={{ gap: 'var(--sp-3)', flex: 1, minWidth: 260 }}>
                <p className="kicker">Teach</p>
                <h2 id="teach-heading" className="display-sm">From video to skill, in front of you</h2>
                <p className="subhead" style={{ maxWidth: 620 }}>
                  Point Cherry at a lesson. It drafts the steps with timestamped evidence — and nothing
                  becomes a skill until you approve the exact revision you read.
                </p>
              </div>
              <div className="reveal">
                <CherryMascot pose="point" size={120} line="Every step keeps its receipt." />
              </div>
            </div>
            <div className="reveal diagram" style={{ marginTop: 'var(--sp-8)' }}>
              <div className="diagram-scroll" tabIndex={0} role="region" aria-label="Teach flow diagram (scrollable)"><TeachFlow /></div>
            </div>
          </div>
        </section>

        {/* ---- 02 · PROVE ---- */}
        <section className="band band-blush" aria-labelledby="prove-heading">
          <div className="band-inner">
            <div className="chapter-head">
              <span className="chapter-num" aria-hidden="true">02</span>
              <div className="stack" style={{ gap: 'var(--sp-3)', flex: 1, minWidth: 260 }}>
                <p className="kicker">Prove</p>
                <h2 id="prove-heading" className="display-sm">Receipts, not promises</h2>
                <p className="subhead" style={{ maxWidth: 620 }}>
                  Every action is hashed into a receipt anyone can recompute. Tamper-evident by
                  construction — and honestly labelled: it's a hash chain, not a signature.
                </p>
              </div>
            </div>
            <div className="reveal diagram" style={{ marginTop: 'var(--sp-8)' }}>
              <div className="diagram-scroll" tabIndex={0} role="region" aria-label="Proof pipeline diagram (scrollable)"><ProofFlow /></div>
            </div>
          </div>
        </section>

        {/* ---- 03 · CONNECT ---- */}
        <section id="agents" className="band band-cream" aria-labelledby="connect-heading">
          <div className="band-inner">
            <div className="chapter-head">
              <span className="chapter-num" aria-hidden="true">03</span>
              <div className="stack" style={{ gap: 'var(--sp-3)', flex: 1, minWidth: 260 }}>
                <p className="kicker">Connect</p>
                <h2 id="connect-heading" className="display-sm">Your agent drives. You hold the keys.</h2>
                <p className="subhead" style={{ maxWidth: 640 }}>
                  Attach the Claude or ChatGPT you already pay for over WebMCP. It sees five tools at a
                  time, watches the lesson with you — and no tool can approve, trust, or remember on
                  your behalf.
                </p>
              </div>
              <div className="reveal">
                <CherryMascot pose="wave" size={120} flip line="I hand your agent five tools at a time." />
              </div>
            </div>
            <div className="reveal diagram" style={{ marginTop: 'var(--sp-8)' }}>
              <div className="diagram-scroll" tabIndex={0} role="region" aria-label="WebMCP architecture diagram (scrollable)"><ConnectArch /></div>
            </div>
          </div>
        </section>

        {/* ---- 04 · CARRY ---- */}
        <section className="band band-lavender" aria-labelledby="carry-heading">
          <div className="band-inner">
            <div className="chapter-head">
              <span className="chapter-num" aria-hidden="true">04</span>
              <div className="stack" style={{ gap: 'var(--sp-3)', flex: 1, minWidth: 260 }}>
                <p className="kicker">Carry</p>
                <h2 id="carry-heading" className="display-sm">Skills that travel</h2>
                <p className="subhead" style={{ maxWidth: 620 }}>
                  One bundle installs into Claude Code and Codex, with a standalone verifier anyone can
                  run — no Cherry required.
                </p>
              </div>
            </div>
            <div className="reveal diagram" style={{ marginTop: 'var(--sp-8)' }}>
              <div className="diagram-scroll" tabIndex={0} role="region" aria-label="Skill portability diagram (scrollable)"><CarryFlow /></div>
            </div>
          </div>
        </section>

        {/* ---- Guarantees ---- */}
        <section id="security" className="band band-gray" aria-labelledby="security-heading">
          <div className="band-inner">
            <h2 id="security-heading" className="display-sm">Trust is a feature</h2>
            <div className="guarantee-row reveal reveal-stagger" style={{ marginTop: 'var(--sp-8)' }}>
              <div className="stack" style={{ gap: 'var(--sp-2)' }}>
                <span className="sticker sticker-fail">Untrusted by default</span>
                <p style={{ margin: 0 }}>Everything a source says stays data until you promote it.</p>
              </div>
              <div className="stack" style={{ gap: 'var(--sp-2)' }}>
                <span className="sticker sticker-wait">Exact-revision approvals</span>
                <p style={{ margin: 0 }}>Edit anything after approving and the approval goes stale.</p>
              </div>
              <div className="stack" style={{ gap: 'var(--sp-2)' }}>
                <span className="sticker sticker-pass">Recomputable proof</span>
                <p style={{ margin: 0 }}>SHA-256 over canonical JSON — check it without trusting us.</p>
              </div>
              <div className="stack" style={{ gap: 'var(--sp-2)' }}>
                <span className="sticker">Sandboxed previews</span>
                <p style={{ margin: 0 }}>Artifacts render network-blocked, storage-blocked, isolated.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ---- Closing ---- */}
        <section id="open" className="band band-maroon ribbon-wrap" aria-labelledby="open-heading">
          <div className="os-watermark" aria-hidden="true">CHERRY WINE</div>
          <Ribbon color="var(--color-cherry-pop)" />
          <div className="band-inner ribbon-fg" style={{ textAlign: 'center' }}>
            <div className="reveal">
              <CherryMascot pose="stamp" size={160} line="Approved by you. Verified by checks. Sealed by hashes." />
            </div>
            <h2 id="open-heading" className="display-sm" style={{ marginTop: 'var(--sp-4)' }}>Open source, no meter running</h2>
            <p className="subhead" style={{ maxWidth: 620, margin: 'var(--sp-4) auto' }}>
              No AI API key, no cloud database, no paid backend. Connecting an agent accelerates the
              same product — it never unlocks a different one.
            </p>
            <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--sp-6)' }}>
              <Link to="/studio?demo=1" className="btn">Try the guided example</Link>
              <Link to="/compatibility" className="btn">See what's proven</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="band band-cream">
        <div className="band-inner row" style={{ justifyContent: 'space-between' }}>
          <span className="label">Cherry Wine · the apprenticeship layer for AI agents</span>
          <span className="label">MIT licensed · local-first · WebMCP Challenge 2026</span>
        </div>
      </footer>
    </div>
  );
}
