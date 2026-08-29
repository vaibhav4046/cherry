import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getLesson,
  importTranscript,
  deleteTranscript,
  lessonCoverage,
  listObservations,
  listTranscript,
  recordObservation,
  deleteObservation,
  addCoverageCriterion,
  updateLesson,
} from '../../cherry/watch/lesson-service.ts';
import { embedUrl } from '../../cherry/watch/youtube-url.ts';
import type { CoverageReport, Lesson, Observation, TranscriptSegment } from '../../cherry/watch/watch-model.ts';

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export default function Watch() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [positionSeconds, setPositionSeconds] = useState(0);
  const playerRef = useRef<HTMLIFrameElement | null>(null);

  const load = useCallback(async () => {
    if (!lessonId) return;
    const loaded = await getLesson(lessonId);
    setLesson(loaded ?? null);
    if (loaded) {
      setSegments(await listTranscript(loaded.id));
      setObservations(await listObservations(loaded.id));
      const report = await lessonCoverage(loaded.id);
      if (report.ok) setCoverage(report.value);
      setPositionSeconds(loaded.lastPositionSeconds);
    }
  }, [lessonId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Track playback position through the official IFrame API postMessages.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== 'https://www.youtube-nocookie.com' && event.origin !== 'https://www.youtube.com') return;
      if (typeof event.data !== 'string') return;
      try {
        const data = JSON.parse(event.data) as { event?: string; info?: { currentTime?: number; duration?: number } };
        if (data.info?.currentTime !== undefined) {
          setPositionSeconds(Math.floor(data.info.currentTime));
        }
        if (data.info?.duration && lesson && !lesson.durationSeconds) {
          void updateLesson(lesson.id, { durationSeconds: Math.round(data.info.duration) });
        }
      } catch {
        // Non-JSON player messages are ignored.
      }
    }
    window.addEventListener('message', onMessage);
    const interval = window.setInterval(() => {
      playerRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'cherry' }), '*');
    }, 2000);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(interval);
    };
  }, [lesson]);

  // Persist last position when leaving.
  useEffect(() => {
    return () => {
      if (lesson && positionSeconds > 0) void updateLesson(lesson.id, { lastPositionSeconds: positionSeconds });
    };
  }, [lesson, positionSeconds]);

  if (!lesson) {
    return (
      <div className="empty-state">
        <p className="subhead">Lesson not found.</p>
        <Link to="/studio" className="btn">Back to Command Center</Link>
      </div>
    );
  }

  async function handleTranscriptPaste(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const text = String(form.get('transcript') ?? '');
    const result = await importTranscript(lesson!.id, text, 'user_text');
    if (!result.ok) setError(result.error.message);
    await load();
  }

  async function handleTranscriptFile(file: File) {
    setError(null);
    const text = await file.text();
    const result = await importTranscript(lesson!.id, text, 'user_upload', file.name);
    if (!result.ok) setError(result.error.message);
    await load();
  }

  async function handleObservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const result = await recordObservation({
      lessonId: lesson!.id,
      timestampSeconds: positionSeconds,
      kind: (data.get('kind') as 'spoken' | 'visual' | 'inferred') ?? 'spoken',
      text: String(data.get('text') ?? ''),
      transferability: (data.get('transferability') as 'transferable' | 'source_specific' | 'unknown') ?? 'unknown',
      uncertainty: (data.get('uncertainty') as 'confident' | 'uncertain' | 'needs_review') ?? 'confident',
    });
    if (!result.ok) setError(result.error.message);
    form.reset();
    await load();
  }

  async function handleCriterion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const start = Number(data.get('start') ?? 0);
    const end = Number(data.get('end') ?? 0);
    const result = await addCoverageCriterion(lesson!.id, {
      label: String(data.get('label') ?? 'Criterion'),
      startSeconds: start,
      endSeconds: end,
    });
    if (!result.ok) setError(result.error.message);
    form.reset();
    await load();
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <header className="row" style={{ justifyContent: 'space-between' }}>
        <div className="stack" style={{ gap: 'var(--sp-1)' }}>
          <h1 className="display-sm">{lesson.title}</h1>
          <div className="row">
            <span className="sticker">{lesson.kind === 'youtube' ? 'YouTube lesson' : 'Manual lesson'}</span>
            {lesson.permissionAcknowledgedAt ? <span className="sticker sticker-pass">Permission acknowledged</span> : null}
            {lesson.transcriptSource ? <span className="sticker sticker-blue">Transcript: {lesson.transcriptSource.replace(/_/g, ' ')}</span> : null}
            <span className="sticker sticker-sunburst">Position {formatTime(positionSeconds)}</span>
          </div>
        </div>
        {lesson.missionId ? <Link to={`/studio/missions/${lesson.missionId}`} className="btn">Back to mission</Link> : null}
      </header>

      {error ? <p className="field-error" role="alert">{error}</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 'var(--sp-4)' }} className="watch-grid">
        <div className="stack">
          {lesson.kind === 'youtube' && lesson.videoId ? (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <iframe
                ref={playerRef}
                title={`YouTube player: ${lesson.title}`}
                src={embedUrl(lesson.videoId, origin)}
                style={{ width: '100%', aspectRatio: '16 / 9', border: 'none', display: 'block' }}
                allow="accelerometer; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="card card-wash-lavender">
              <p>
                Manual lesson — no video. Paste a transcript or record observations directly. If a video is
                unavailable or blocked, this mode is the honest fallback.
              </p>
            </div>
          )}

          <section className="card stack" aria-labelledby="transcript-heading">
            <h2 id="transcript-heading" className="subhead">Transcript ({segments.length} segments)</h2>
            {segments.length === 0 ? (
              <form onSubmit={handleTranscriptPaste} className="stack">
                <p className="label">
                  Paste your transcript, or upload .txt / .srt / .vtt. Cherry never scrapes captions — the
                  transcript must come from you or a permitted source.
                </p>
                <textarea className="textarea" name="transcript" placeholder={'[0:12] The presenter opens the layout panel…'} />
                <div className="row">
                  <button type="submit" className="btn">Import pasted text</button>
                  <label className="btn">
                    Upload file
                    <input
                      type="file"
                      accept=".txt,.srt,.vtt,text/plain"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        if (file) void handleTranscriptFile(file);
                      }}
                    />
                  </label>
                </div>
              </form>
            ) : (
              <>
                <div className="row">
                  <button type="button" className="btn btn-sm btn-danger" onClick={async () => { await deleteTranscript(lesson.id); await load(); }}>
                    Delete transcript
                  </button>
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }} className="stack">
                  {segments.map((segment) => (
                    <div key={segment.id} className="event-row">
                      <span className="mono">{formatTime(segment.startSeconds)}</span>
                      <span>{segment.text}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="card card-wash-cherry stack" aria-labelledby="observe-heading">
            <h2 id="observe-heading" className="subhead">Record observation</h2>
            <form onSubmit={handleObservation} className="stack">
              <label className="field">
                <span>At {formatTime(positionSeconds)} — what do you see or hear?</span>
                <textarea className="textarea" name="text" required maxLength={2000} style={{ minHeight: 72 }} />
              </label>
              <div className="row">
                <label className="field">
                  <span>Kind</span>
                  <select className="select" name="kind" defaultValue="spoken">
                    <option value="spoken">Spoken (transcript)</option>
                    <option value="visual">Visual (on screen)</option>
                    <option value="inferred">Inferred</option>
                  </select>
                </label>
                <label className="field">
                  <span>Transfers?</span>
                  <select className="select" name="transferability" defaultValue="transferable">
                    <option value="transferable">Transferable principle</option>
                    <option value="source_specific">Source-specific detail</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
                <label className="field">
                  <span>Certainty</span>
                  <select className="select" name="uncertainty" defaultValue="confident">
                    <option value="confident">Confident</option>
                    <option value="uncertain">Uncertain</option>
                    <option value="needs_review">Needs review</option>
                  </select>
                </label>
              </div>
              <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Record</button>
            </form>
          </section>

          <section className="card stack" aria-labelledby="coverage-heading">
            <h2 id="coverage-heading" className="subhead">Coverage</h2>
            {coverage ? (
              <>
                <div className="row">
                  <span className={coverage.complete ? 'sticker sticker-pass' : 'sticker sticker-wait'}>
                    {coverage.complete ? 'Criteria complete' : 'Incomplete'}
                  </span>
                  <span className="sticker">{coverage.criteriaSatisfied}/{coverage.criteriaTotal} criteria</span>
                  <span className="sticker sticker-blue">{formatTime(coverage.transcriptCoveredSeconds)} transcript</span>
                  <span className="sticker sticker-lavender">{coverage.observationCount} observations</span>
                </div>
                <p style={{ fontSize: 13 }}>{coverage.completenessNote}</p>
                {coverage.gaps.length > 0 ? (
                  <details>
                    <summary className="label">Evidence gaps ({coverage.gaps.length})</summary>
                    <ul className="stack" style={{ marginTop: 'var(--sp-2)' }}>
                      {coverage.gaps.slice(0, 8).map((gap, index) => (
                        <li key={index} className="mono">
                          {formatTime(gap.startSeconds)}–{formatTime(gap.endSeconds)} · {gap.reason.replace(/_/g, ' ')}
                          {gap.label ? ` · ${gap.label}` : ''}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                <form onSubmit={handleCriterion} className="stack">
                  <span className="label">Declare a coverage criterion</span>
                  <div className="row">
                    <input className="input" name="label" placeholder="e.g. Setup steps" required style={{ flex: 1, minWidth: 120 }} />
                    <input className="input" name="start" type="number" min="0" placeholder="start s" required style={{ width: 90 }} />
                    <input className="input" name="end" type="number" min="0" placeholder="end s" required style={{ width: 90 }} />
                    <button type="submit" className="btn btn-sm">Add</button>
                  </div>
                </form>
              </>
            ) : (
              <p>Loading coverage…</p>
            )}
          </section>

          <section className="card stack" aria-labelledby="observations-heading">
            <h2 id="observations-heading" className="subhead">Observations ({observations.length})</h2>
            <div style={{ maxHeight: 300, overflowY: 'auto' }} className="stack">
              {observations.map((observation) => (
                <div key={observation.id} className="event-row" style={{ alignItems: 'flex-start' }}>
                  <span className="mono">{formatTime(observation.timestampSeconds)}</span>
                  <span className={observation.kind === 'visual' ? 'sticker sticker-violet' : observation.kind === 'spoken' ? 'sticker sticker-blue' : 'sticker'} style={{ padding: '2px 8px' }}>
                    {observation.kind}
                  </span>
                  <span style={{ flex: 1 }}>{observation.text}</span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    aria-label={`Delete observation at ${formatTime(observation.timestampSeconds)}`}
                    onClick={async () => { await deleteObservation(observation.id); await load(); }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {observations.length === 0 ? <p>None yet. Observations become the evidence behind the SkillGraph.</p> : null}
            </div>
          </section>
        </div>
      </div>

      <style>{`@media (max-width: 833px) { .watch-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
