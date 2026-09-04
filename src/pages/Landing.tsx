import { Link } from 'react-router-dom';
import { CherryHomeLink } from '../components/CherryHomeLink.tsx';
import {
  BranchEvidence,
  GlasshouseEvidence,
  HarvestEvidence,
  HumanSealEvidence,
  LandingFinalAction,
  RecordedRunSummary,
  RecordedMissionHero,
  SeedBankEvidence,
  SeedEvidence,
  StoryChapter,
  useRecordedMission,
  VerifiedDemoCabinet,
} from '../components/marketing/ChronicleLanding.tsx';

export function Landing() {
  const replay = useRecordedMission();

  return (
    <div className="chronicle-landing">
      <a className="landing-skip-link" href="#landing-story">Skip to main content</a>
      <header className="landing-header">
        <nav className="landing-nav" aria-label="Main navigation">
          <div className="landing-nav__brand">
            <CherryHomeLink />
            <span className="landing-nav__wordmark" aria-hidden="true">Cherry</span>
          </div>
          <div className="landing-nav__navigation">
            <div className="landing-nav__links">
              <a href="#seed">How it works</a>
              <Link to="/connect">Connect an agent</Link>
              <Link to="/showcase#recorded-mission">Recorded run</Link>
              <Link to="/compatibility">Compatibility</Link>
            </div>
            <details
              className="landing-nav__menu"
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.currentTarget.removeAttribute('open');
                event.currentTarget.querySelector<HTMLElement>('summary')?.focus();
              }}
            >
              <summary>Explore</summary>
              <div>
                <a href="#seed" onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}>How it works</a>
                <Link to="/showcase#recorded-mission" onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}>Recorded run</Link>
                <Link to="/compatibility" onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}>Compatibility</Link>
              </div>
            </details>
          </div>
          <Link className="landing-nav__studio" to="/studio/control">Plan a project</Link>
        </nav>
      </header>

      <main id="landing-story" tabIndex={-1}>
        <section className="landing-hero" aria-labelledby="landing-hero-heading">
          <div className="landing-hero__copy">
            <p className="landing-eyebrow">Supervised work on your computer</p>
            <h1 id="landing-hero-heading">One task. An entire AI team.</h1>
            <p className="landing-hero__summary">
              Give Cherry a goal. It creates a reviewable plan, runs independent tasks on your paired computer,
              checks the result, and returns to you when a decision needs your approval.
            </p>
            <div className="landing-hero__actions" data-testid="hero-actions">
              <Link className="landing-primary-action" to="/studio/control">Plan a project</Link>
              <Link className="landing-secondary-action" to="/showcase#recorded-mission">See the recorded run</Link>
            </div>
            <RecordedRunSummary replay={replay} />
          </div>
          <RecordedMissionHero replay={replay} />
        </section>

        <div className="landing-story">
          <StoryChapter
            id="seed"
            marker="01 / PLAN"
            heading="Describe the goal. Review the plan."
            body="Tell Cherry what you want done, what must stay off-limits, and how success will be checked. Cherry creates a reviewable plan before anything runs."
            composition="split"
          >
            <SeedEvidence replay={replay} />
          </StoryChapter>

          <StoryChapter
            id="branch"
            marker="02 / PARALLEL WORK"
            heading="Independent tasks can run at the same time."
            body="Cherry runs tasks together when they do not depend on each other. When one task needs another result, it waits and carries that result forward."
            composition="panorama"
          >
            <BranchEvidence replay={replay} />
          </StoryChapter>

          <StoryChapter
            id="glasshouse"
            marker="03 / SEPARATE WORK AREAS"
            heading="Each task gets its own work area."
            body="On your paired computer, each task runs in a separate folder or Git worktree. Cherry records where it ran and which saved revision it started from."
            composition="split"
          >
            <GlasshouseEvidence replay={replay} />
          </StoryChapter>

          <VerifiedDemoCabinet replay={replay} />

          <StoryChapter
            id="harvest"
            marker="04 / CHECKS"
            heading="Work is complete only when its checks pass."
            body="Each task must pass its required checks. A failed result stays failed until it is repaired and checked again."
            composition="panorama"
          >
            <HarvestEvidence replay={replay} />
          </StoryChapter>

          <StoryChapter
            id="human-seal"
            marker="05 / YOUR APPROVAL"
            heading="Cherry pauses when your approval is required."
            body="Workers can prepare files and run checks. Only you can approve a skill, publish work, or promote saved guidance."
            composition="seal"
          >
            <HumanSealEvidence />
          </StoryChapter>

          <StoryChapter
            id="seed-bank"
            marker="06 / REUSE"
            heading="Save approved methods as reusable skills."
            body="An agent that opens this page in a WebMCP browser can call list_skills, recommend_skills and get_skill, and leave with the exact revision you approved and a SHA-256 it can check itself. Most agent-ready sites let an agent work the page. This one sends the agent away more capable, and no tool it can reach grants an approval."
            composition="archive"
          >
            <SeedBankEvidence />
          </StoryChapter>

          <LandingFinalAction />
        </div>
      </main>

      <footer className="landing-footer">
        <span>Cherry · work stays local by default</span>
        <Link className="landing-footer__demo" to="/studio?demo=1">Try the guided example</Link>
        <span>MIT licensed · pair a computer for live work</span>
      </footer>
    </div>
  );
}
