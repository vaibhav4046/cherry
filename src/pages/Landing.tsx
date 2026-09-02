import { Link } from 'react-router-dom';
import { CherryHomeLink } from '../components/CherryHomeLink.tsx';
import { ApprovalDemo } from '../components/marketing/ApprovalDemo.tsx';
import { AutomationDemo } from '../components/marketing/AutomationDemo.tsx';
import { CapabilityFabricDemo } from '../components/marketing/CapabilityFabricDemo.tsx';
import { CherryMissionDemo } from '../components/marketing/CherryMissionDemo.tsx';
import { ComputerBoundaryDemo } from '../components/marketing/ComputerBoundaryDemo.tsx';
import { EditorialPlate, LandingSection } from '../components/marketing/LandingSection.tsx';
import { ModelRouterDemo } from '../components/marketing/ModelRouterDemo.tsx';
import { ParallelWorkDemo } from '../components/marketing/ParallelWorkDemo.tsx';
import { TeammateRail } from '../components/marketing/TeammateRail.tsx';
import { HERO, LANDING_SECTIONS, USE_CASES } from '../components/marketing/landing-content.ts';

function sectionCopy(id: string) {
  const copy = LANDING_SECTIONS.find((section) => section.id === id);
  if (!copy) throw new Error(`Unknown landing section ${id}`);
  return copy;
}

/**
 * Cherry's landing: the autonomous runtime for an AI team. Twelve chapters in
 * the directive's order, one primary action per viewport, labelled examples,
 * Cherry-origin plates only, and public statuses that match /compatibility.
 */
export function Landing() {
  return (
    <div>
      <header>
        <nav className="top-nav" aria-label="Main navigation">
          <CherryHomeLink />
          <div className="row nav-links">
            <a href="#how" className="nav-pill">How it works</a>
            <Link to="/showcase" className="nav-pill">Showcase</Link>
            <Link to="/connect" className="nav-pill">Connect</Link>
            <Link to="/compatibility" className="nav-pill">What's proven</Link>
          </div>
          {/* Quiet here: the hero owns the single primary action on this screen. */}
          <Link to="/studio" className="btn">Open Studio</Link>
        </nav>
      </header>

      <main>
        <section className="home-hero page-enter" aria-labelledby="hero-heading">
          <div className="stack" style={{ gap: 'var(--sp-4)' }}>
            <p className="home-eyebrow" style={{ margin: 0 }}>{HERO.eyebrow}</p>
            <h1 id="hero-heading" className="home-headline">{HERO.headline}</h1>
            <p className="subhead" style={{ margin: 0, maxWidth: 520 }}>{HERO.subhead}</p>
            <div className="row" data-testid="hero-ctas" style={{ marginTop: 'var(--sp-2)' }}>
              <Link to={HERO.primaryCta.to} className="btn btn-primary">{HERO.primaryCta.label}</Link>
              <a href={HERO.secondaryCta.to} className="link-quiet">{HERO.secondaryCta.label}</a>
            </div>
            <p className="trust-line" style={{ margin: 0 }}>{HERO.trustLine}</p>
          </div>
          <TeammateRail />
        </section>

        <LandingSection copy={sectionCopy('how')}>
          <CherryMissionDemo />
        </LandingSection>

        <LandingSection copy={sectionCopy('team')} flip>
          <ParallelWorkDemo />
        </LandingSection>

        <LandingSection copy={sectionCopy('connect')}>
          <CapabilityFabricDemo />
          <EditorialPlate plate="connect" />
        </LandingSection>

        <LandingSection copy={sectionCopy('computers')} flip>
          <ComputerBoundaryDemo />
        </LandingSection>

        <LandingSection copy={sectionCopy('learn')}>
          <div className="card gm-figure" data-testid="learn-demo">
            <div className="row gm-figure-head">
              <span className="label">Ways to teach Cherry</span>
              <span className="sticker sticker-cherry">Shipped</span>
            </div>
            <ul className="gm-bullets">
              <li>Follow a creator&apos;s public feed and add the transcript yourself. Cherry never downloads the video.</li>
              <li>Add articles, docs and files. Outside content stays untrusted until you review it.</li>
              <li>Approve a successful mission as a skill. The exact revision you read is what every agent installs.</li>
            </ul>
            <div className="row">
              <Link to="/studio?demo=1" className="btn btn-sm" data-testid="guided-example-link">Try the guided example</Link>
              <Link to="/studio/skills" className="link-quiet">Browse the skill library</Link>
            </div>
          </div>
          <EditorialPlate plate="teach" />
        </LandingSection>

        <LandingSection copy={sectionCopy('models')} flip>
          <ModelRouterDemo />
          <EditorialPlate plate="carry" />
        </LandingSection>

        <LandingSection copy={sectionCopy('automations')}>
          <AutomationDemo />
        </LandingSection>

        <LandingSection copy={sectionCopy('approvals')} flip>
          <ApprovalDemo />
        </LandingSection>

        <LandingSection copy={sectionCopy('use-cases')} wide>
          <div className="gm-use-cases" data-testid="use-cases">
            {USE_CASES.map((useCase) => (
              <Link key={useCase.title} to={`/studio/control?outcome=${encodeURIComponent(useCase.outcome)}`} className="card gm-use-case">
                <span className="label">{useCase.title}</span>
                <p>{useCase.outcome}</p>
              </Link>
            ))}
          </div>
        </LandingSection>

        <LandingSection copy={sectionCopy('security')}>
          <div className="card gm-figure" data-testid="security-demo">
            <div className="row gm-figure-head">
              <span className="label">What is enforced</span>
            </div>
            <ul className="gm-bullets">
              <li>Every state change writes a proof event in the same transaction. Receipts are SHA-256 over canonical JSON and recompute anywhere.</li>
              <li>Approvals bind an exact revision and content hash. An agent can request one and never grant one.</li>
              <li>Transcripts, pages, tool output and files are data, never instructions.</li>
              <li>The runner binds to loopback with a pairing token, an executable allowlist, a minimal environment and redacted output.</li>
            </ul>
            <div className="row">
              <Link to="/compatibility" className="btn btn-sm">See what is proven</Link>
              <Link to="/studio/proof" className="link-quiet">Recompute a receipt</Link>
            </div>
          </div>
          <EditorialPlate plate="proof" />
        </LandingSection>

        <LandingSection copy={sectionCopy('start')} wide>
          <div className="row gm-final-ctas" data-testid="final-ctas" style={{ justifyContent: 'center' }}>
            <Link to="/studio/control" className="btn btn-primary">Open Cherry</Link>
            <Link to="/showcase#real-run" className="link-quiet">Watch the verified run</Link>
          </div>
        </LandingSection>
      </main>

      <footer className="band band-cream">
        <div className="band-inner row" style={{ justifyContent: 'space-between' }}>
          <span className="label">Cherry, the autonomous runtime for your AI team</span>
          <span className="label">
            MIT licensed · local-first · WebMCP Challenge 2026 ·{' '}
            <a href="/lab/cherry-3d/" className="link-quiet">Brand lab (3D)</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
