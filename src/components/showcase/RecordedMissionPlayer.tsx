import { useEffect, useMemo, useState } from 'react';
import type { RecordedMissionFixture } from './recorded-mission.mjs';

interface RecordedMissionPlayerProps {
  fixture: RecordedMissionFixture;
  autoplay?: boolean;
  reducedMotion?: boolean;
  stepDurationMs?: number;
}

const STATE_LABELS: Record<RecordedMissionFixture['states'][number]['state'], string> = {
  idle: 'Idle',
  planning: 'Planning',
  parallel: 'Parallel work',
  verifying: 'Verifying',
  needs_human: 'Needs human',
  complete: 'Complete',
};

export function RecordedMissionPlayer({
  fixture,
  autoplay = false,
  reducedMotion = false,
  stepDurationMs = 2_800,
}: RecordedMissionPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(autoplay && !reducedMotion);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const lastIndex = fixture.states.length - 1;
  const current = fixture.states[currentIndex]!;

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      setCurrentIndex((index) => {
        if (index >= lastIndex) {
          setPlaying(false);
          return index;
        }
        const next = index + 1;
        if (next === lastIndex) setPlaying(false);
        return next;
      });
    }, stepDurationMs);
    return () => window.clearInterval(timer);
  }, [lastIndex, playing, stepDurationMs]);

  const elapsedSeconds = useMemo(() => {
    const start = Date.parse(fixture.mission.startedAt);
    return Math.max(0, Math.round((Date.parse(current.at) - start) / 100) / 10);
  }, [current.at, fixture.mission.startedAt]);

  function play() {
    if (currentIndex === lastIndex) setCurrentIndex(0);
    setPlaying(true);
  }

  function pause() {
    setPlaying(false);
  }

  function restart() {
    setPlaying(false);
    setCurrentIndex(0);
  }

  function moveTo(index: number) {
    setPlaying(false);
    setCurrentIndex(Math.min(lastIndex, Math.max(0, index)));
  }

  return (
    <section
      className="recorded-mission"
      aria-label={fixture.label}
      data-playing={playing ? 'true' : 'false'}
    >
      <div className="recorded-mission__heading">
        <div>
          <p className="showcase-kicker">Recorded mission · sealed replay</p>
          <h2>{fixture.label}</h2>
        </div>
        <span className="recorded-mission__seal">SHA-256 verified</span>
      </div>

      <div className="recorded-mission__stage">
        <div className="recorded-mission__counter">Step {currentIndex + 1} of {fixture.states.length}</div>
        <p className="recorded-mission__time">T+{elapsedSeconds.toFixed(1)}s</p>
        <h3>{current.title}</h3>
        <p>{current.summary}</p>
        <div className="recorded-mission__state-word" aria-hidden="true">
          {STATE_LABELS[current.state]}
        </div>
      </div>

      <ol className="recorded-mission__progress" aria-label="Mission progress">
        {fixture.states.map((step, index) => {
          const relationship = index === currentIndex ? 'current step' : index < currentIndex ? 'complete' : 'upcoming';
          return (
            <li
              key={step.state}
              aria-label={`${index + 1}. ${STATE_LABELS[step.state]}, ${relationship}`}
              aria-current={index === currentIndex ? 'step' : undefined}
              data-progress={relationship}
            >
              <span aria-hidden="true">{index + 1}</span>
              <span aria-hidden="true">{STATE_LABELS[step.state]}</span>
            </li>
          );
        })}
      </ol>

      <div className="recorded-mission__controls" aria-label="Replay controls">
        <button type="button" onClick={play} disabled={playing}>Play</button>
        <button type="button" onClick={pause} disabled={!playing}>Pause</button>
        <button type="button" onClick={restart}>Restart</button>
        <button type="button" onClick={() => moveTo(currentIndex - 1)} disabled={currentIndex === 0}>Previous step</button>
        <button type="button" onClick={() => moveTo(currentIndex + 1)} disabled={currentIndex === lastIndex}>Next step</button>
        <button
          type="button"
          aria-expanded={evidenceOpen}
          aria-controls="recorded-run-evidence"
          onClick={() => setEvidenceOpen((open) => !open)}
        >
          Open evidence
        </button>
      </div>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        Step {currentIndex + 1} of {fixture.states.length}: {current.title}
      </div>

      {evidenceOpen ? (
        <section id="recorded-run-evidence" className="recorded-mission__evidence" aria-label="Run evidence">
          <h3>Evidence index</h3>
          <div className="recorded-mission__evidence-summary">
            <div><strong>{fixture.overlap.durationMs.toLocaleString('en-US')} ms</strong><span> measured overlap</span></div>
            <div><strong>{fixture.overlap.maxConcurrentNodes}</strong><span> concurrent workers</span></div>
            <div><strong>{fixture.events.length}</strong><span> chained events</span></div>
          </div>
          <div className="recorded-mission__approval">
            <h4>Approval status</h4>
            <p>Not exercised in this recorded mission · human approval remains required for release.</p>
          </div>
          <p className="recorded-mission__hash">
            <span>{fixture.integrity.algorithm}</span>
            <code>{fixture.integrity.replaySha256}</code>
          </p>
          <h3>Workspace roots</h3>
          <div className="recorded-mission__workers">
            {fixture.workers.map((worker) => (
              <article key={worker.id}>
                <p className="showcase-kicker">{worker.workspaceLabel}</p>
                <h4>{worker.label}</h4>
                <dl>
                  <div><dt>Codex version</dt><dd>{worker.hostVersion}</dd></div>
                  <div><dt>Boundary</dt><dd>{worker.boundary}</dd></div>
                  <div><dt>Base commit</dt><dd><code>{worker.baseCommit}</code></dd></div>
                  <div><dt>Status</dt><dd>{worker.status}</dd></div>
                </dl>
                {worker.checks.map((check) => (
                  <p className="recorded-mission__check" key={check.id}>
                    <span aria-hidden="true">✓</span> {check.name}: {check.detail}
                  </p>
                ))}
              </article>
            ))}
          </div>
          <h3>Event log</h3>
          <div className="recorded-mission__events" role="region" aria-label="Recorded event log" tabIndex={0}>
            {fixture.events.map((event) => (
              <div key={event.sequence}>
                <code>#{event.sequence}</code>{' '}
                <strong>{event.type}</strong>
                <time dateTime={event.at}>{new Date(event.at).toLocaleTimeString()}</time>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
