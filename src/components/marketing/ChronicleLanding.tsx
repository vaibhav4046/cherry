import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { RecordedMissionPlayer } from '../showcase/RecordedMissionPlayer.tsx';
import {
  verifyRecordedMissionFixture,
  type RecordedMissionFixture,
} from '../showcase/recorded-mission.mjs';

const REPLAY_URL = '/media/cherry-demo/recorded-mission.json';
const CHRONICLE_ROOT = '/media/cherry-chronicle/artifacts';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export type ReplayState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; fixture: RecordedMissionFixture };

interface ChronicleArtProps {
  id: 'seed-outcome' | 'branches-workforce' | 'glasshouse-sandboxes' | 'harvest-proof' | 'seed-bank-memory';
  alt: string;
}

interface StoryChapterProps {
  id: string;
  marker: string;
  heading: string;
  body: string;
  composition: 'split' | 'panorama' | 'seal' | 'archive';
  children: ReactNode;
}

export function useRecordedMission(): ReplayState {
  const [state, setState] = useState<ReplayState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    async function loadReplay() {
      try {
        const response = await fetch(REPLAY_URL, { signal: controller.signal });
        if (!response.ok) throw new Error(`Recorded mission request failed (${response.status})`);
        const candidate: unknown = await response.json();
        const verified = await verifyRecordedMissionFixture(candidate);
        if (controller.signal.aborted) return;
        if (!verified) throw new Error('Recorded mission integrity check failed');
        setState({ status: 'ready', fixture: candidate as RecordedMissionFixture });
      } catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
        setState({ status: 'error' });
      }
    }

    void loadReplay();
    return () => controller.abort();
  }, []);

  return state;
}

export function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined' && Boolean(window.matchMedia?.(REDUCED_MOTION_QUERY).matches)
  ));

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    setReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return reducedMotion;
}

export function ChronicleArt({ id, alt }: ChronicleArtProps) {
  return (
    <picture className="landing-chronicle-art" data-chronicle-art>
      <source
        media="(max-width: 767px)"
        srcSet={`${CHRONICLE_ROOT}/${id}-mobile.svg`}
        width="780"
        height="1040"
      />
      <img
        src={`${CHRONICLE_ROOT}/${id}-desktop.svg`}
        width="1600"
        height="1000"
        loading="lazy"
        decoding="async"
        alt={alt}
      />
    </picture>
  );
}

export function RecordedMissionHero({ replay }: { replay: ReplayState }) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div
      className="landing-replay"
      aria-busy={replay.status === 'loading'}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
    >
      <p className="landing-recording-label">Recorded run · verified before display · not live</p>
      {replay.status === 'loading' ? (
        <div className="landing-replay-status" role="status">
          <strong>Checking the recorded run</strong>
          <span>It appears after Cherry verifies that the saved recording has not changed.</span>
        </div>
      ) : null}
      {replay.status === 'error' ? (
        <div className="landing-replay-status" role="alert">
          <strong>The recorded run could not be verified.</strong>
          <span>Use the Recorded run link to inspect its source details.</span>
        </div>
      ) : null}
      {replay.status === 'ready' ? (
        <RecordedMissionPlayer
          fixture={replay.fixture}
          autoplay={false}
          reducedMotion={reducedMotion}
        />
      ) : null}
    </div>
  );
}

export function RecordedRunSummary({ replay }: { replay: ReplayState }) {
  if (replay.status !== 'ready') {
    return (
      <p className="landing-trust-line" data-replay-state={replay.status}>
        {replay.status === 'loading' ? 'Checking recorded run' : 'Recorded run proof unavailable'}
      </p>
    );
  }

  const workAreaCount = replay.fixture.workers.filter((worker) => worker.boundary === 'worktree-process').length;
  const passedCheckCount = replay.fixture.workers
    .flatMap((worker) => worker.checks)
    .filter((check) => check.status === 'passed').length;
  const overlapSeconds = (replay.fixture.overlap.durationMs / 1000).toFixed(1);

  return (
    <dl className="landing-proof-rail" aria-label="Recorded run summary">
      <div>
        <dt>Tasks</dt>
        <dd><a href="#seed"><strong>{replay.fixture.workers.length}</strong> tasks</a></dd>
      </div>
      <div>
        <dt>Work areas</dt>
        <dd><a href="#glasshouse"><strong>{workAreaCount}</strong> separate work areas</a></dd>
      </div>
      <div>
        <dt>Parallel time</dt>
        <dd><a href="#branch"><strong>{overlapSeconds}</strong> seconds together</a></dd>
      </div>
      <div>
        <dt>Checks</dt>
        <dd><a href="#harvest"><strong>{passedCheckCount}</strong> checks passed</a></dd>
      </div>
    </dl>
  );
}

function ReplayEvidenceStatus({ replay, className }: { replay: ReplayState; className: string }) {
  if (replay.status === 'ready') return null;
  const loading = replay.status === 'loading';
  return (
    <div className={`${className} landing-evidence-status`}>
      <strong>{loading ? 'Checking recorded run' : 'Recorded run unavailable'}</strong>
      <p>
        {loading
          ? 'Details appear after Cherry verifies that the saved recording has not changed.'
          : 'Details are hidden because the recording did not pass verification.'}
      </p>
    </div>
  );
}

export function StoryChapter({ id, marker, heading, body, composition, children }: StoryChapterProps) {
  const headingId = `landing-${id}-heading`;
  return (
    <section
      id={id}
      className={`landing-chapter landing-chapter--${composition}`}
      data-landing-chapter={id}
      aria-labelledby={headingId}
    >
      <div className="landing-chapter__copy">
        <p className="landing-chapter__marker">{marker}</p>
        <h2 id={headingId}>{heading}</h2>
        <p>{body}</p>
      </div>
      <div className="landing-chapter__evidence">{children}</div>
    </section>
  );
}

export function SeedEvidence({ replay }: { replay: ReplayState }) {
  return (
    <div className="landing-evidence-pair">
      <ChronicleArt
        id="seed-outcome"
        alt="A botanical cherry illustration beside a plan split into two tasks."
      />
      {replay.status === 'ready' ? (
        <div className="landing-live-note">
          <span className="landing-note-label">Recorded result</span>
          <p>{replay.fixture.mission.outcome}</p>
          <dl>
            <div><dt>Plan</dt><dd>{replay.fixture.workers.length} tasks</dd></div>
            <div><dt>Result</dt><dd>{replay.fixture.mission.status}</dd></div>
          </dl>
        </div>
      ) : <ReplayEvidenceStatus replay={replay} className="landing-live-note" />}
    </div>
  );
}

export function BranchEvidence({ replay }: { replay: ReplayState }) {
  return (
    <div className="landing-panorama">
      <ChronicleArt
        id="branches-workforce"
        alt="A cherry branch beside two tasks running at the same time, each ending with a check."
      />
      {replay.status === 'ready' ? (
        <div className="landing-overlap" data-testid="recorded-overlap">
          <span>Time both tasks ran</span>
          <strong>{(replay.fixture.overlap.durationMs / 1000).toFixed(1)} seconds</strong>
          <p>{replay.fixture.overlap.maxConcurrentNodes} tasks ran at the same time. Timing comes from this recorded run.</p>
        </div>
      ) : (
        <ReplayEvidenceStatus replay={replay} className="landing-overlap" />
      )}
    </div>
  );
}

export function GlasshouseEvidence({ replay }: { replay: ReplayState }) {
  return (
    <div className="landing-evidence-pair landing-evidence-pair--reverse">
      <ChronicleArt
        id="glasshouse-sandboxes"
        alt="A botanical cherry illustration divided into three separate work areas."
      />
      {replay.status === 'ready' ? (
        <div className="landing-workspaces" aria-label="Recorded task work areas">
          {replay.fixture.workers.map((worker, index) => (
            <article key={worker.id}>
              <span>Separate work area {index + 1}</span>
              <strong>{worker.id === 'developer-fix' ? 'Fix the defect' : worker.id === 'review-notes' ? 'Review the change' : worker.label.replaceAll('-', ' ')}</strong>
              <dl>
                <div><dt>Runner</dt><dd>{worker.hostVersion.startsWith('codex-cli') ? 'Codex CLI' : 'Recorded runner'}</dd></div>
                <div><dt>Work area</dt><dd>{worker.boundary === 'worktree-process' ? 'Separate Git worktree' : 'Separate process'}</dd></div>
              </dl>
            </article>
          ))}
          <p className="landing-commit">Both tasks started from the same saved revision.</p>
        </div>
      ) : (
        <ReplayEvidenceStatus replay={replay} className="landing-workspaces" />
      )}
    </div>
  );
}

export function HarvestEvidence({ replay }: { replay: ReplayState }) {
  const checks = replay.status === 'ready' ? replay.fixture.workers.flatMap((worker) => worker.checks) : [];
  return (
    <div className="landing-panorama landing-panorama--proof">
      <ChronicleArt
        id="harvest-proof"
        alt="A cherry watercolor beside a completed check and a separate repair path."
      />
      {replay.status === 'ready' ? (
        <div className="landing-checks" aria-label="Checks from the recorded run">
          {checks.map((check) => (
            <div key={check.id}>
              <span aria-hidden="true">✓</span>
              <p>
                <strong>{check.id === 'tests' ? 'Test suite' : check.id === 'review-exists' ? 'Review notes' : check.name}</strong>
                <small>{check.id === 'tests' ? 'Completed successfully' : check.id === 'review-exists' ? 'Verdict found' : check.detail}</small>
              </p>
              <span>{check.status}</span>
            </div>
          ))}
        </div>
      ) : (
        <ReplayEvidenceStatus replay={replay} className="landing-checks" />
      )}
    </div>
  );
}

export function HumanSealEvidence() {
  return (
    <div className="landing-human-seal">
      <span className="landing-seal-mark" aria-hidden="true">05</span>
      <div>
        <p className="landing-note-label">Your approval</p>
        <h3>Cherry does not publish without you.</h3>
        <p>In this recorded run, Cherry published nothing. Only you can approve or publish work.</p>
        <p>Live work runs only while your paired computer is online. Cherry brings approval and publishing decisions back to you.</p>
      </div>
    </div>
  );
}

const VERIFIED_DEMOS = [
  {
    href: '/showcase#recorded-mission',
    title: 'Recorded parallel run',
    description: 'See two tasks run at the same time in separate work areas, then inspect the saved run details.',
    labels: ['RECORDED', 'VERIFIED'],
    action: 'Watch recording',
  },
  {
    href: '/lab/cherry-3d/',
    title: 'Interactive 3D lab',
    description: 'Move through three procedural scenes and export their geometry.',
    labels: ['RUNNABLE DEMO'],
    action: 'Open 3D lab',
  },
  {
    href: '/showcase#real-run',
    title: 'Recorded skill workflow',
    description: 'Watch Cherry create, check, repair, and export a reusable skill, pausing for a person to approve it.',
    note: 'No AI provider or model was involved in this recorded browser workflow.',
    labels: ['RECORDED'],
    action: 'Watch workflow',
  },
  {
    href: '/compatibility',
    title: 'Codex and Cherry connection',
    description: 'See a captured Codex CLI session read and verify a Cherry workspace and skill bundle through the local MCP connection.',
    labels: ['CAPTURED'],
    action: 'See compatibility',
  },
] as const;

export function VerifiedDemoCabinet({ replay }: { replay: ReplayState }) {
  return (
    <section className="landing-proof-cabinet" data-testid="proof-cabinet" aria-labelledby="proof-cabinet-heading">
      <header className="landing-proof-cabinet__heading">
        <p className="landing-note-label">EXPLORE THE PRODUCT</p>
        <h2 id="proof-cabinet-heading">Four demos. Each shows what Cherry actually did.</h2>
        <p>Each demo links to the details behind it.</p>
      </header>
      <div className="landing-proof-cabinet__grid">
        {VERIFIED_DEMOS.map((demo, index) => {
          const replayPending = index === 0 && replay.status !== 'ready';
          const presentedDemo = replayPending
            ? {
                ...demo,
                title: 'Recorded run',
                description: replay.status === 'loading'
                  ? 'Checking the saved recording before showing its details.'
                  : 'Recording details are hidden because verification failed.',
                labels: [replay.status === 'loading' ? 'CHECKING' : 'UNAVAILABLE'],
              }
            : demo;
          return (
            <a key={presentedDemo.href} href={presentedDemo.href} data-verified-demo>
              <span className="landing-proof-cabinet__index" aria-hidden="true">0{index + 1}</span>
              <span className="landing-proof-cabinet__labels">
                {presentedDemo.labels.map((label) => <span key={label}>{label}</span>)}
              </span>
              <h3>{presentedDemo.title}</h3>
              <p>{presentedDemo.description}</p>
              {'note' in presentedDemo ? <small>{presentedDemo.note}</small> : null}
              <strong>{presentedDemo.action}</strong>
            </a>
          );
        })}
      </div>
    </section>
  );
}

export function SeedBankEvidence() {
  return (
    <div className="landing-seed-bank">
      <ChronicleArt
        id="seed-bank-memory"
        alt="Seven botanical archive cards connected by a version history."
      />
      <div className="landing-archive-note">
        <p className="landing-note-label">Reusable skill</p>
        <h3>Approve the exact version you reviewed.</h3>
        <p>Once you approve a version, your workers can install that skill later. Source material stays reference data, not instructions.</p>
        <ol aria-label="Skill promotion path">
          <li>Checks pass</li>
          <li>You review it</li>
          <li>You approve that version</li>
          <li>Your workers reuse the skill</li>
        </ol>
      </div>
    </div>
  );
}

export function LandingFinalAction() {
  return (
    <section className="landing-final" data-testid="final-action" aria-labelledby="landing-final-heading">
      <p className="landing-chapter__marker">START A PROJECT</p>
      <h2 id="landing-final-heading">What should Cherry take care of?</h2>
      <p>Cherry turns your goal into a reviewable plan before anything runs. Pair your computer when you are ready to start live work.</p>
      <Link className="landing-primary-action" to="/studio/control">Plan a project</Link>
    </section>
  );
}
