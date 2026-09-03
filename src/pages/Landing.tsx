import { Link } from 'react-router-dom';
import { CherryHomeLink } from '../components/CherryHomeLink.tsx';
import {
  BranchEvidence,
  GlasshouseEvidence,
  HarvestEvidence,
  HumanSealEvidence,
  LandingFinalAction,
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
      <a className="landing-skip-link" href="#landing-story">Skip to the Cherry story</a>
      <header className="landing-header">
        <nav className="landing-nav" aria-label="Main navigation">
          <CherryHomeLink />
          <div className="landing-nav__links">
            <a href="#seed">How it works</a>
            <Link to="/showcase#recorded-mission">Recorded run</Link>
            <Link to="/compatibility">Evidence</Link>
          </div>
          <Link className="landing-nav__studio" to="/studio/control">Mission Control</Link>
        </nav>
      </header>

      <main id="landing-story" tabIndex={-1}>
        <section className="landing-hero" aria-labelledby="landing-hero-heading">
          <div className="landing-hero__copy">
            <p className="landing-eyebrow">Cherry / Open AI workforce</p>
            <h1 id="landing-hero-heading">One task. An entire AI team.</h1>
            <p className="landing-hero__summary">
              Give Cherry an outcome. On a paired computer, Cherry creates the mission, sends Codex workers into
              separate workspaces, checks the result, and returns when your authority is needed.
            </p>
            <div className="landing-hero__actions" data-testid="hero-actions">
              <Link className="landing-primary-action" to="/studio/control">Open Mission Control</Link>
              <Link className="landing-secondary-action" to="/showcase#recorded-mission">Watch 90 seconds</Link>
            </div>
            <p className="landing-trust-line">Real Codex run · separate worktrees · independent checks</p>
          </div>
          <RecordedMissionHero replay={replay} />
        </section>

        <div className="landing-story">
          <div id="seed" />
          <StoryChapter
            id="seed"
            marker="01 / SEED"
            heading="Describe the result. Cherry forms the team."
            body="Start with an outcome, not a prompt sequence. Cherry turns that result into a bounded mission with work items and explicit checks."
            composition="split"
          >
            <SeedEvidence replay={replay} />
          </StoryChapter>

          <StoryChapter
            id="branch"
            marker="02 / BRANCH"
            heading="Work in parallel without becoming the project manager."
            body="Independent work can overlap when its dependencies allow. Cherry keeps the plan and the evidence connected while workers stay focused."
            composition="panorama"
          >
            <BranchEvidence replay={replay} />
          </StoryChapter>

          <StoryChapter
            id="glasshouse"
            marker="03 / GLASSHOUSE"
            heading="Every worker gets a boundary."
            body="Each worker receives its own workspace, host identity, execution boundary, and base revision. Separation is part of the record."
            composition="split"
          >
            <GlasshouseEvidence replay={replay} />
          </StoryChapter>

          <VerifiedDemoCabinet replay={replay} />

          <StoryChapter
            id="harvest"
            marker="04 / HARVEST"
            heading="“Done” is not a result."
            body="The mission closes only after its named checks run at the worker boundary. Failures return to correction instead of becoming polished claims."
            composition="panorama"
          >
            <HarvestEvidence replay={replay} />
          </StoryChapter>

          <StoryChapter
            id="human-seal"
            marker="05 / HUMAN SEAL"
            heading="Routine work continues. Consequential work comes back to you."
            body="Agents can prepare and verify work. Authority-changing actions stay visible, explicit, and human."
            composition="seal"
          >
            <HumanSealEvidence />
          </StoryChapter>

          <StoryChapter
            id="seed-bank"
            marker="06 / SEED BANK"
            heading="Successful work improves the next mission."
            body="A reviewed procedure can become a reusable skill. Its approved revision travels with the workflow, while the original evidence stays inspectable."
            composition="archive"
          >
            <SeedBankEvidence />
          </StoryChapter>

          <LandingFinalAction />
        </div>
      </main>

      <footer className="landing-footer">
        <span>Cherry · local-first mission orchestration</span>
        <Link className="landing-footer__demo" to="/studio?demo=1">Try the guided example</Link>
        <span>MIT licensed · evidence before claims</span>
      </footer>
    </div>
  );
}
