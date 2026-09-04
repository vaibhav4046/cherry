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
        if (controller.signal.aborted) return;
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
            <h2>The result the run was given.</h2>
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
            <h2>Two agents worked at the same time, in separate worktrees.</h2>
            <p>
              {fixture.overlap.workerIds.join(' and ')} overlapped for{' '}
              <strong>{fixture.overlap.durationMs.toLocaleString('en-US')} ms</strong>. Each ran in its own git worktree and its own process.
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
            <h2>Every check was run and recorded separately.</h2>
            <p>The host reports that it finished. Cherry records separately whether each required check passed.</p>
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
            <p className="showcase-chapter-number">04 / Approval</p>
            <h2>Neither agent could publish anything.</h2>
            <p>
              Nothing in this capture left the machine. Approving and publishing are still yours to do,
              against the evidence on this page.
            </p>
            <p className="showcase-authority-note"><span aria-hidden="true">◇</span> Approval is not delegated</p>
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
          <Link to="/compatibility">What's proven</Link>
        </div>
      </nav>

      <header className="winner-showcase__hero">
        <div className="winner-showcase__hero-copy">
          <p className="showcase-kicker">Cherry · recorded run</p>
          <h1>Two agents ran one job. Neither could publish.</h1>
          <p className="winner-showcase__lede">
            Judging this? The whole run is below, and takes about 90 seconds to read.
          </p>
          <p>
            A replay of a real Codex run recorded into this repository. Two tasks overlapped in
            separate worktrees, both checks passed, and nothing was published.
          </p>
          <a className="winner-showcase__jump" href="#recorded-mission">Inspect the recorded run ↓</a>
        </div>
        <div className="winner-showcase__film">
          <MissionFilm reducedMotion={reducedMotion} />
          <p>Silent animated summary, recorded in a browser · 27 seconds</p>
        </div>
      </header>

      <section className="winner-showcase__host" aria-labelledby="live-host-heading">
        <p className="showcase-kicker">Captured 4 September 2026 · ChatGPT desktop, Work mode, 5.6 Sol</p>
        <h2 id="live-host-heading">A real ChatGPT agent used this page, then refused to approve its own work.</h2>
        <p>
          It opened this site in the ChatGPT desktop app&rsquo;s built-in browser and called Cherry&rsquo;s
          registered tools through <code className="mono">document.modelContext</code>. Asked afterwards
          whether it had used the tools or simply clicked the page, it answered: no page controls were
          clicked, and no text was typed into the UI.
        </p>
        <ol className="winner-showcase__host-steps">
          <li>
            <strong>10 &rarr; 11 &rarr; 12 tools.</strong> The aperture grew as the state advanced. Seven
            always-on, plus at most five for the surface it was on.
          </li>
          <li>
            <strong>It left with a method it did not have.</strong> An install-ready SKILL.md, a full-file
            SHA-256, and a citation back to the video the method was learned from.
          </li>
          <li>
            <strong>It found two bugs before we did.</strong> Our own recommendation tool returned nothing,
            twice, for two different reasons. Both are fixed, and both are written up as defects rather
            than quietly removed.
          </li>
          <li>
            <strong>Then it tried to approve.</strong> Told to use any registered tool it could find, it
            enumerated all twelve and reported that none grants approval. The boundary holds because the
            tool does not exist, not because a check said no.
          </li>
        </ol>
        <p className="winner-showcase__host-note">
          Full transcript, including the two failures:{' '}
          <a href="https://github.com/vaibhav4046/cherry/blob/main/docs/release/WEBMCP_LIVE_HOST_CAPTURE.md" target="_blank" rel="noreferrer">
            WEBMCP_LIVE_HOST_CAPTURE.md
          </a>
          . The complete teach-then-approve journey was not exercised in that session, and{' '}
          <Link to="/compatibility">what is proven</Link> says so.
        </p>
      </section>

      <section className="winner-showcase__story" aria-labelledby="mission-story-heading">
        <div className="winner-showcase__story-intro">
          <p className="showcase-kicker">The recorded mission</p>
          <h2 id="mission-story-heading">What the run produced, in order.</h2>
          <p>Every number below is read out of the committed capture file, not typed in by hand.</p>
        </div>
        <MissionStory />
      </section>

      <ShowcaseLearn />
    </main>
  );
}
