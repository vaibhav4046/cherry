import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CherryHomeLink } from '../components/CherryHomeLink.tsx';
import { MissionCaptureStage, MissionFilm, useReducedMotion } from '../components/showcase/MissionFilm.tsx';
import { RecordedMissionPlayer } from '../components/showcase/RecordedMissionPlayer.tsx';
import { verifyRecordedMissionFixture } from '../components/showcase/recorded-mission.mjs';
import type { RecordedMissionFixture } from '../components/showcase/recorded-mission.mjs';
import { ShowcaseLearn } from './ShowcaseLearn.tsx';

interface ChroniclePictureProps {
  artifact: string;
  alt: string;
}

function ChroniclePicture({ artifact, alt }: ChroniclePictureProps) {
  const root = '/media/cherry-chronicle/artifacts';
  return (
    <picture className="showcase-proof-chapter__art">
      <source media="(max-width: 767px)" srcSet={`${root}/${artifact}-mobile.svg`} />
      <img src={`${root}/${artifact}-desktop.svg`} alt={alt} loading="lazy" />
    </picture>
  );
}

function useRecordedMission() {
  const [fixture, setFixture] = useState<RecordedMissionFixture | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/media/cherry-demo/recorded-mission.json', { signal: controller.signal });
        if (!response.ok) throw new Error(`Replay returned HTTP ${response.status}.`);
        const replay: unknown = await response.json();
        if (!(await verifyRecordedMissionFixture(replay))) throw new Error('Replay integrity verification failed.');
        setFixture(replay as RecordedMissionFixture);
      } catch (reason) {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Replay could not be loaded.');
        }
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  return { fixture, error };
}

function MissionStory() {
  const { fixture, error } = useRecordedMission();
  if (error) return <p className="showcase-replay-error" role="alert">Recorded evidence unavailable: {error}</p>;
  if (!fixture) return <p className="showcase-replay-loading" role="status">Verifying the recorded mission…</p>;

  const checks = fixture.workers.flatMap((worker) => worker.checks);
  return (
    <>
      <div className="showcase-proof-chapters" aria-label="Mission evidence chapters">
        <article className="showcase-proof-chapter" data-showcase-chapter>
          <div className="showcase-proof-chapter__copy">
            <p className="showcase-chapter-number">01 / Outcome</p>
            <h2>Start with the result, then bound the work.</h2>
            <p>{fixture.mission.outcome}</p>
            <dl className="showcase-proof-facts">
              <div><dt>Mission</dt><dd>{fixture.mission.status}</dd></div>
              <div><dt>Capture</dt><dd><code>{fixture.source.captureCommit.slice(0, 9)}</code></dd></div>
            </dl>
          </div>
          <ChroniclePicture
            artifact="seed-outcome"
            alt="A historic cherry study overlaid with a seed opening into a two-branch mission graph."
          />
        </article>

        <article className="showcase-proof-chapter showcase-proof-chapter--reverse" data-showcase-chapter>
          <div className="showcase-proof-chapter__copy">
            <p className="showcase-chapter-number">02 / Parallel work</p>
            <h2>Two agents worked at the same time, in separate boundaries.</h2>
            <p>
              {fixture.overlap.workerIds.join(' and ')} overlapped for{' '}
              <strong>{fixture.overlap.durationMs.toLocaleString('en-US')} ms</strong>. Each ran in its own worktree-process boundary.
            </p>
            <div className="showcase-worker-pair">
              {fixture.workers.map((worker) => (
                <div key={worker.id}>
                  <span>{worker.workspaceLabel}</span>
                  <strong>{worker.label}</strong>
                  <small>{worker.hostVersion}</small>
                </div>
              ))}
            </div>
          </div>
          <ChroniclePicture
            artifact="branches-workforce"
            alt="A cherry branch aligned with a parallel task graph ending in independently checked fruit-like nodes."
          />
        </article>

        <article className="showcase-proof-chapter" data-showcase-chapter>
          <div className="showcase-proof-chapter__copy">
            <p className="showcase-chapter-number">03 / Verification</p>
            <h2>Completion was checked, not inferred.</h2>
            <p>The host reports completion. Cherry separately records whether each required check passed.</p>
            <div className="showcase-checks">
              {checks.map((check) => (
                <p key={check.id}><span aria-hidden="true">✓</span><strong>{check.name}</strong><small>{check.detail}</small></p>
              ))}
            </div>
          </div>
          <ChroniclePicture
            artifact="harvest-proof"
            alt="A public-domain cherry watercolor beside an independent inspection mark and a separate correction route."
          />
        </article>

        <article className="showcase-proof-chapter showcase-proof-chapter--reverse" data-showcase-chapter>
          <div className="showcase-proof-chapter__copy">
            <p className="showcase-chapter-number">04 / Human authority</p>
            <h2>The agents could finish the work. They could not release it.</h2>
            <p>
              This capture contains no public action. Approval and publication remain separate human decisions, bound to the evidence a person reviews.
            </p>
            <p className="showcase-authority-note"><span aria-hidden="true">◇</span> Human gate · no delegated approval</p>
          </div>
          <ChroniclePicture
            artifact="glasshouse-sandboxes"
            alt="A botanical cherry specimen contained within visibly isolated glasshouse workspaces."
          />
        </article>
      </div>

      <div id="recorded-mission" className="winner-showcase__replay-anchor">
        <RecordedMissionPlayer fixture={fixture} />
      </div>
    </>
  );
}

export function Showcase() {
  const reducedMotion = useReducedMotion();
  const captureMode = new URLSearchParams(window.location.search).get('capture') === 'hero';
  if (captureMode) return <MissionCaptureStage />;

  return (
    <main className="winner-showcase">
      <nav className="winner-showcase__nav" aria-label="Showcase navigation">
        <CherryHomeLink />
        <div>
          <Link to="/studio">Open Studio</Link>
          <Link to="/compatibility">Evidence boundaries</Link>
        </div>
      </nav>

      <header className="winner-showcase__hero">
        <div className="winner-showcase__hero-copy">
          <p className="showcase-kicker">Cherry · Mission Chronicle No. 01</p>
          <h1>One outcome. Two agents. Human authority intact.</h1>
          <p className="winner-showcase__lede">
            Judging Cherry? See the entire mission in 90 seconds.
          </p>
          <p>
            This is a replay of a committed real Codex run: concurrent work, isolated boundaries,
            independent checks, and an honest stop before public action.
          </p>
          <a className="winner-showcase__jump" href="#recorded-mission">Inspect the sealed replay ↓</a>
        </div>
        <div className="winner-showcase__film">
          <MissionFilm reducedMotion={reducedMotion} />
          <p>Silent browser-session recording · visual summary · 27 seconds</p>
        </div>
      </header>

      <section className="winner-showcase__story" aria-labelledby="mission-story-heading">
        <div className="winner-showcase__story-intro">
          <p className="showcase-kicker">The recorded mission</p>
          <h2 id="mission-story-heading">Evidence, in the order a judge needs it.</h2>
          <p>Every number below comes from the public projection of the committed host capture.</p>
        </div>
        <MissionStory />
      </section>

      <ShowcaseLearn />
    </main>
  );
}
