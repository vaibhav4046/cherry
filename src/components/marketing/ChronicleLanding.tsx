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
      <p className="landing-recording-label">Recording · committed evidence · not live</p>
      {replay.status === 'loading' ? (
        <div className="landing-replay-status" role="status">
          <strong>Opening the committed mission record</strong>
          <span>The player appears after its independent digest pin is verified.</span>
        </div>
      ) : null}
      {replay.status === 'error' ? (
        <div className="landing-replay-status" role="alert">
          <strong>The recorded mission could not be verified.</strong>
          <span>Open the showcase to inspect the evidence source directly.</span>
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

function ReplayEvidenceStatus({ replay, className }: { replay: ReplayState; className: string }) {
  if (replay.status === 'ready') return null;
  const loading = replay.status === 'loading';
  return (
    <div className={`${className} landing-evidence-status`}>
      <strong>{loading ? 'Recorded evidence loading' : 'Recorded evidence unavailable'}</strong>
      <p>
        {loading
          ? 'Mission details remain withheld while integrity checks run.'
          : 'Mission details remain withheld because the committed evidence could not be validated.'}
      </p>
    </div>
  );
}

export function StoryChapter({ id, marker, heading, body, composition, children }: StoryChapterProps) {
  const headingId = `landing-${id}-heading`;
  return (
    <section
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
        alt="A historic cherry study overlaid with a seed opening into a two-branch mission graph."
      />
      {replay.status === 'ready' ? (
        <div className="landing-live-note">
          <span className="landing-note-label">Recorded outcome</span>
          <p>{replay.fixture.mission.outcome}</p>
          <dl>
            <div><dt>Plan</dt><dd>{replay.fixture.workers.length} bounded work items</dd></div>
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
        alt="A cherry branch aligned with a parallel task graph ending in independently checked fruit-like nodes."
      />
      {replay.status === 'ready' ? (
        <div className="landing-overlap" data-testid="recorded-overlap">
          <span>Measured overlap</span>
          <strong>{replay.fixture.overlap.durationMs.toLocaleString('en-US')} ms</strong>
          <p>{replay.fixture.overlap.maxConcurrentNodes} workers ran at once. The timeline comes from the committed run.</p>
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
        alt="A botanical cherry specimen contained within three visibly isolated glasshouse workspaces."
      />
      {replay.status === 'ready' ? (
        <div className="landing-workspaces" aria-label="Recorded worker boundaries">
          {replay.fixture.workers.map((worker) => (
            <article key={worker.id}>
              <span>{worker.workspaceLabel}</span>
              <strong>{worker.label}</strong>
              <dl>
                <div><dt>Host</dt><dd>{worker.hostVersion}</dd></div>
                <div><dt>Boundary</dt><dd>{worker.boundary}</dd></div>
              </dl>
            </article>
          ))}
          <p className="landing-commit">
            Base <code>{replay.fixture.workers[0]?.baseCommit}</code>
          </p>
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
        alt="A public-domain cherry watercolor beside an independent inspection mark and a separate correction route."
      />
      {replay.status === 'ready' ? (
        <div className="landing-checks" aria-label="Checks from the recorded mission">
          {checks.map((check) => (
            <div key={check.id}>
              <span aria-hidden="true">✓</span>
              <p><strong>{check.name}</strong><small>{check.detail}</small></p>
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
        <p className="landing-note-label">Release boundary</p>
        <h3>Human authority is not delegated.</h3>
        <p>The recorded mission made no public release action; an agent cannot approve or publish on a human’s behalf.</p>
        <p>Cherry runs while your paired computer is online. Consequential actions return with context for a human decision.</p>
      </div>
    </div>
  );
}

const VERIFIED_DEMOS = [
  {
    href: '/showcase#recorded-mission',
    title: 'Real Codex team run',
    description: 'Replay two Codex tasks overlapping in separate worktrees, then inspect the source evidence.',
    labels: ['RECORDED', 'VERIFIED'],
  },
  {
    href: '/lab/cherry-3d/',
    title: 'Interactive Three.js lab',
    description: 'Explore three procedural brand scenes and export OBJ/MTL.',
    labels: ['RUNNABLE PROTOTYPE'],
  },
  {
    href: '/showcase#real-run',
    title: 'Uncut skill workflow',
    description: 'Watch an automated browser test create, verify, repair, approve, export and reload a reusable skill.',
    note: 'No AI provider or model was involved in this recorded browser workflow.',
    labels: ['RECORDED'],
  },
  {
    href: '/compatibility',
    title: 'Codex + Cherry MCP proof',
    description: 'Inspect the capture where a ChatGPT-authenticated Codex CLI used Cherry’s local STDIO MCP bridge to read and verify a shipped workspace and skill bundle.',
    labels: ['CAPTURED'],
  },
] as const;

export function VerifiedDemoCabinet() {
  return (
    <section className="landing-proof-cabinet" data-testid="proof-cabinet" aria-labelledby="proof-cabinet-heading">
      <header className="landing-proof-cabinet__heading">
        <p className="landing-note-label">OPEN EVIDENCE CABINET</p>
        <h2 id="proof-cabinet-heading">Four artifacts. Four bounded claims.</h2>
        <p>Every card names only what its artifact proves.</p>
      </header>
      <div className="landing-proof-cabinet__grid">
        {VERIFIED_DEMOS.map((demo, index) => (
          <a key={demo.href} href={demo.href} data-verified-demo>
            <span className="landing-proof-cabinet__index" aria-hidden="true">0{index + 1}</span>
            <span className="landing-proof-cabinet__labels">
              {demo.labels.map((label) => <span key={label}>{label}</span>)}
            </span>
            <h3>{demo.title}</h3>
            <p>{demo.description}</p>
            {'note' in demo ? <small>{demo.note}</small> : null}
            <strong>Open evidence</strong>
          </a>
        ))}
      </div>
    </section>
  );
}

export function SeedBankEvidence() {
  return (
    <div className="landing-seed-bank">
      <ChronicleArt
        id="seed-bank-memory"
        alt="Seven botanical archive cards preserve cherry seeds and connect into a visible version-history line."
      />
      <div className="landing-archive-note">
        <p className="landing-note-label">Reusable learning</p>
        <h3>Approval binds the lesson to a revision.</h3>
        <p>An exact-revision approved skill can be installed by future teammates without turning outside content into instructions.</p>
        <ol aria-label="Skill promotion path">
          <li>Mission succeeds</li>
          <li>Human reviews</li>
          <li>Revision is approved</li>
          <li>Future missions reuse it</li>
        </ol>
      </div>
    </div>
  );
}

export function LandingFinalAction() {
  return (
    <section className="landing-final" data-testid="final-action" aria-labelledby="landing-final-heading">
      <p className="landing-chapter__marker">THE NEXT OUTCOME</p>
      <h2 id="landing-final-heading">Start with the result you want returned.</h2>
      <p>Mission Control forms the plan, shows the boundaries, and keeps live execution gated until your runner is paired.</p>
      <Link className="landing-primary-action" to="/studio/control">Open Mission Control</Link>
    </section>
  );
}
