import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../app/AppState.tsx';
import { createMission, createWorkspace, deleteWorkspace, listWorkspaces } from '../cherry/mission/mission-service.ts';
import { importWorkspace } from '../cherry/persistence/workspace-archive.ts';
import { listProofEvents } from '../cherry/persistence/transactions.ts';
import { getLesson, listTranscript, listObservations } from '../cherry/watch/lesson-service.ts';
import type { Lesson } from '../cherry/watch/watch-model.ts';
import { listEvidence } from '../cherry/evidence/evidence-service.ts';
import type { EvidenceRecord } from '../cherry/evidence/evidence-model.ts';
import { decideSkillGraphApproval, getSkillGraph, listApprovals } from '../cherry/skillgraph/skillgraph-service.ts';
import type { SkillGraph } from '../cherry/skillgraph/skillgraph-model.ts';
import type { ApprovalRecord } from '../cherry/approval/approval-model.ts';
import { listArtifactFiles } from '../cherry/artifacts/artifact-service.ts';
import { listVerifications } from '../cherry/verify/verification-service.ts';
import type { VerificationReport } from '../cherry/verify/assertion-model.ts';
import { listReceipts } from '../cherry/proof/proof-service.ts';
import type { ProofReceipt } from '../cherry/proof/proof-model.ts';
import type { ProofEvent } from '../cherry/core/domain-event.ts';

type StepStatus = 'done' | 'now' | 'todo';

interface StoryStep {
  title: string;
  detail: string;
  status: StepStatus;
  href?: string;
}

interface Chapter {
  name: string;
  from: number;
  to: number;
}

/** Four quiet chapters over the twelve steps: Source, Shape, Prove, Carry. */
const CHAPTERS: Chapter[] = [
  { name: 'Source', from: 0, to: 2 },
  { name: 'Shape', from: 3, to: 4 },
  { name: 'Prove', from: 5, to: 9 },
  { name: 'Carry', from: 10, to: 11 },
];

interface ShowcaseData {
  lesson: Lesson | null;
  transcriptCount: number;
  observationCount: number;
  evidence: EvidenceRecord[];
  skillGraph: SkillGraph | null;
  pendingApproval: ApprovalRecord | null;
  decidedApprovals: number;
  artifactFileCount: number;
  verifications: VerificationReport[];
  receipts: ProofReceipt[];
  events: ProofEvent[];
}

const EMPTY_DATA: ShowcaseData = {
  lesson: null,
  transcriptCount: 0,
  observationCount: 0,
  evidence: [],
  skillGraph: null,
  pendingApproval: null,
  decidedApprovals: 0,
  artifactFileCount: 0,
  verifications: [],
  receipts: [],
  events: [],
};

/**
 * The judge route: one linear apprenticeship story, driven entirely by real
 * persisted state. Starts empty in a fresh browser; the sample workspace is
 * opt-in and labelled. Nothing on this page is scripted or pre-completed.
 */
export function Showcase() {
  const { ready, activeWorkspace, activeMission, missions, webmcp, refresh, setActiveWorkspace } = useAppState();
  const [data, setData] = useState<ShowcaseData>(EMPTY_DATA);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openChapters, setOpenChapters] = useState<Record<string, boolean>>({});

  const loadAll = useCallback(async () => {
    if (!activeWorkspace) {
      setData(EMPTY_DATA);
      return;
    }
    const workspaceId = activeWorkspace.id;
    const mission = activeMission;
    try {
    const lesson = mission?.lessonId ? ((await getLesson(mission.lessonId)) ?? null) : null;
    const [transcript, observations] = lesson
      ? await Promise.all([listTranscript(lesson.id), listObservations(lesson.id)])
      : [[], []];
    const evidence = await listEvidence(workspaceId, mission ? { missionId: mission.id } : undefined);
    const skillGraph = mission?.skillGraphId ? ((await getSkillGraph(mission.skillGraphId)) ?? null) : null;
    const approvals = await listApprovals(workspaceId);
    const pendingApproval = approvals.find((approval) => approval.decision === 'pending') ?? null;
    const artifactFiles = mission?.artifactSetId ? await listArtifactFiles(mission.artifactSetId) : [];
    const verifications = mission ? await listVerifications(workspaceId, mission.id) : [];
    const receipts = await listReceipts(workspaceId);
    const events = await listProofEvents(workspaceId);
    setData({
      lesson,
      transcriptCount: transcript.length,
      observationCount: observations.length,
      evidence,
      skillGraph,
      pendingApproval,
      decidedApprovals: approvals.filter((approval) => approval.decision !== 'pending').length,
      artifactFileCount: artifactFiles.length,
      verifications,
      receipts,
      events: events.slice(-14).reverse(),
    });
    setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load showcase data.');
    }
  }, [activeWorkspace, activeMission]);

  useEffect(() => {
    void loadAll();
    // Re-read after every real tool call and whenever the mission advances.
  }, [loadAll, webmcp.recentCalls.length, activeMission?.state]);

  async function startFresh() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const workspace = await createWorkspace({ name: 'Showcase run' }, 'human');
      if (!workspace.ok) {
        setError(workspace.error.message);
        return;
      }
      setActiveWorkspace(workspace.value.id);
      setNotice('Fresh workspace created. An attached agent can now call start_apprenticeship — or use the buttons above.');
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Unable to create a workspace.');
    } finally {
      setBusy(false);
    }
  }

  async function createShowcaseMission() {
    if (!activeWorkspace) return;
    setBusy(true);
    setError(null);
    try {
      const mission = await createMission(
        {
          workspaceId: activeWorkspace.id,
          title: 'Learn a lesson and prove it',
          objective: 'Turn a permitted lesson into an approved, verified, portable skill.',
          definitionOfDone: ['Evidence linked', 'Exact revision approved by a human', 'Verification passed'],
        },
        'human',
      );
      if (!mission.ok) setError(mission.error.message);
      await refresh();
    } catch (missionError) {
      setError(missionError instanceof Error ? missionError.message : 'Unable to create a mission.');
    } finally {
      setBusy(false);
    }
  }

  async function loadSample() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/examples/example-workspace.json');
      if (!response.ok) throw new Error(`example not found (${response.status})`);
      const result = await importWorkspace(await response.text(), { markExample: true });
      if (!result.ok) {
        setError(result.error.message);
      } else {
        setActiveWorkspace(result.value.workspaceId);
        setNotice(`SAMPLE workspace imported (hash ${result.value.hashVerified ? 'verified' : 'absent'}). It is labelled as an example and deletable from Connections.`);
      }
    } catch (importError) {
      setError((importError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resetDemo() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const all = await listWorkspaces();
      const demoWorkspaces = all.filter(
        (workspace) => workspace.isExample === true || workspace.name === 'Showcase run' || workspace.name.startsWith('EXAMPLE'),
      );
      for (const workspace of demoWorkspaces) {
        const result = await deleteWorkspace(workspace.id);
        if (!result.ok) setError(result.error.message);
      }
      setActiveWorkspace(null);
      await refresh();
      await loadAll();
      setNotice(
        demoWorkspaces.length > 0
          ? `Reset: removed ${demoWorkspaces.length} demo workspace(s). Your own workspaces were not touched.`
          : 'Nothing to reset — no demo workspaces exist.',
      );
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Unable to reset the showcase.');
    } finally {
      setBusy(false);
    }
  }

  async function decideApproval(decision: 'approved' | 'rejected') {
    if (!data.pendingApproval) return;
    setBusy(true);
    setError(null);
    try {
      const result = await decideSkillGraphApproval(data.pendingApproval.id, decision, 'user');
      if (!result.ok) setError(result.error.message);
      await refresh();
      await loadAll();
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : 'Unable to record approval decision.');
    } finally {
      setBusy(false);
    }
  }

  const failedVerifications = data.verifications.filter((report) => report.status === 'failed');
  const passedVerification = data.verifications.find((report) => report.status === 'passed') ?? null;
  const latestReceipt = data.receipts[0] ?? null;
  const approvedExact =
    data.skillGraph?.status === 'approved' && data.skillGraph.approvedRevision === data.skillGraph.revision;

  const steps: StoryStep[] = [
    {
      title: '1 · Source permission',
      detail: data.lesson
        ? `${data.lesson.kind === 'youtube' ? 'YouTube (official player)' : 'Manual material'} — "${data.lesson.title}"`
        : 'No source yet. Load a permitted lesson — rights are acknowledged explicitly, never assumed.',
      status: data.lesson ? 'done' : 'todo',
      href: data.lesson ? `/studio/watch/${data.lesson.id}` : undefined,
    },
    {
      title: '2 · Agent start',
      detail: activeMission
        ? `Mission "${activeMission.title}" (${activeMission.state})${webmcp.agent.name ? ` · agent: ${webmcp.agent.name}` : ''}`
        : 'Waiting for start_apprenticeship (agent) or the buttons above (human).',
      status: activeMission ? 'done' : 'todo',
    },
    {
      title: '3 · Timestamped evidence',
      detail:
        data.evidence.length + data.transcriptCount + data.observationCount > 0
          ? `${data.evidence.length} evidence records · ${data.transcriptCount} transcript segments · ${data.observationCount} observations — external content starts untrusted`
          : 'No evidence yet. Everything a source says stays data until you promote it.',
      status: data.evidence.length + data.transcriptCount + data.observationCount > 0 ? 'done' : 'todo',
    },
    {
      title: '4 · Candidate skill',
      detail: data.skillGraph
        ? `"${data.skillGraph.name}" r${data.skillGraph.revision} (${data.skillGraph.status})`
        : 'No skill drafted yet.',
      status: data.skillGraph ? 'done' : 'todo',
      href: data.skillGraph ? `/studio/skills/${data.skillGraph.id}` : undefined,
    },
    {
      title: '5 · Exact revision',
      detail: data.skillGraph?.versionHash
        ? `Revision r${data.skillGraph.revision} · hash ${data.skillGraph.versionHash.slice(0, 12)}… — any edit invalidates approval`
        : 'Approval binds to a hashed revision, not to a vibe.',
      status: data.skillGraph ? 'done' : 'todo',
    },
    {
      title: '6 · Human approval',
      detail: approvedExact
        ? `Approved at exactly r${data.skillGraph!.approvedRevision}`
        : data.pendingApproval
          ? `PENDING for r${data.pendingApproval.objectRevision} — only you can decide, in the inspector`
          : `${data.decidedApprovals} decided · no pending request`,
      status: approvedExact ? 'done' : data.pendingApproval ? 'now' : 'todo',
    },
    {
      title: '7 · Real artifact',
      detail:
        data.artifactFileCount > 0
          ? `${data.artifactFileCount} file(s) in a sandboxed, network-blocked workspace`
          : 'No artifact files yet.',
      status: data.artifactFileCount > 0 ? 'done' : 'todo',
      href: activeMission?.artifactSetId ? `/studio/artifacts/${activeMission.artifactSetId}` : undefined,
    },
    {
      title: '8 · Honest failure',
      detail:
        failedVerifications.length > 0
          ? `${failedVerifications.length} failed run(s) preserved — ${failedVerifications[0]!.blockingFailures} blocking failure(s) recorded, never hidden`
          : 'No failure recorded yet. If the first run passes, that is the truth too.',
      status: failedVerifications.length > 0 ? 'done' : 'todo',
    },
    {
      title: '9 · Repair',
      detail:
        failedVerifications.length > 0 && passedVerification
          ? 'Repaired and re-verified — the failure stays in the receipt'
          : 'A repair only counts when the same assertions pass afterwards.',
      status: failedVerifications.length > 0 && passedVerification ? 'done' : 'todo',
    },
    {
      title: '10 · Verified pass',
      detail: passedVerification
        ? `${passedVerification.totalAssertions - passedVerification.blockingFailures}/${passedVerification.totalAssertions} assertions passed`
        : 'Deterministic checks over the real files — no provider says "looks good".',
      status: passedVerification ? 'done' : 'todo',
    },
    {
      title: '11 · Portable bundle',
      detail:
        activeMission?.state === 'COMPLETE'
          ? 'Compile from the skill page — installs into Claude Code and Codex, verifier included'
          : 'Unlocked after verification passes.',
      status: activeMission?.state === 'COMPLETE' ? 'done' : 'todo',
      href: data.skillGraph ? `/studio/skills/${data.skillGraph.id}` : undefined,
    },
    {
      title: '12 · Proof receipt',
      detail: latestReceipt
        ? `${latestReceipt.receiptId} · ${latestReceipt.receiptHash.slice(0, 16)}… (recomputable, tamper-evident — not a signature)`
        : 'SHA-256 over RFC 8785 canonical JSON. Anyone can recompute it.',
      status: latestReceipt ? 'done' : 'todo',
      href: latestReceipt ? `/studio/proof/${latestReceipt.receiptId}` : undefined,
    },
  ];
  const firstTodo = steps.find((step) => step.status === 'todo');
  if (firstTodo && !steps.some((step) => step.status === 'now')) firstTodo.status = 'now';

  // Current chapter = first chapter containing a non-done step; all done → last.
  const firstUnfinishedChapter = CHAPTERS.findIndex((chapter) =>
    steps.slice(chapter.from, chapter.to + 1).some((step) => step.status !== 'done'),
  );
  const currentChapter = firstUnfinishedChapter === -1 ? CHAPTERS.length - 1 : firstUnfinishedChapter;

  const milestones = [
    { label: 'empty', reached: true },
    { label: 'learning', reached: activeMission !== null },
    { label: 'approval needed', reached: data.pendingApproval !== null || data.decidedApprovals > 0 },
    { label: 'approved', reached: approvedExact },
    { label: 'failed', reached: failedVerifications.length > 0 },
    { label: 'repaired', reached: failedVerifications.length > 0 && passedVerification !== null },
    { label: 'verified', reached: passedVerification !== null },
    { label: 'exported', reached: latestReceipt !== null },
  ];

  const sourceStatus = data.lesson
    ? `${data.lesson.kind === 'youtube' ? 'Official player + your transcript' : 'Manual material'} · "${data.lesson.title}"`
    : 'No source yet · add a lesson to begin';
  const approvalStatus = data.pendingApproval
    ? 'Waiting for your approval'
    : approvedExact
      ? `Approved · revision ${data.skillGraph!.approvedRevision}`
      : 'Not requested yet';
  const verificationStatus = passedVerification
    ? 'Verified'
    : failedVerifications.length > 0
      ? 'This run failed one check · repair is ready'
      : 'Not run yet';
  const exportStatus = latestReceipt ? 'Bundle verified' : 'Not exported yet';
  const lastCall = webmcp.recentCalls.length > 0 ? webmcp.recentCalls[webmcp.recentCalls.length - 1]! : null;

  if (!ready) {
    return (
      <div className="empty-state" role="status" aria-live="polite">
        <span className="sticker sticker-cherry">Loading</span>
      </div>
    );
  }

  return (
    <main className="band band-cream" style={{ minHeight: '100vh' }}>
      <div className="band-inner stack" style={{ gap: 'var(--sp-6)' }}>
        <nav className="row" aria-label="Showcase navigation" style={{ justifyContent: 'space-between' }}>
          <Link to="/" className="nav-pill">← Cherry</Link>
          <div className="row">
            <Link to="/studio" className="nav-pill">Open Studio</Link>
            <Link to="/studio/agent" className="nav-pill">Agent View</Link>
            <Link to="/compatibility" className="nav-pill">What's proven</Link>
          </div>
        </nav>

        <header className="stack" style={{ gap: 'var(--sp-3)' }}>
          <p className="kicker">Showcase / Guided example</p>
          <h1 className="home-headline" style={{ maxWidth: 720 }}>Watch a lesson become a proven skill</h1>
          <p className="subhead" style={{ maxWidth: 560 }}>A complete run using a labelled offline lesson.</p>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => void startFresh()} disabled={busy} data-testid="showcase-start-fresh">
              Start fresh
            </button>
            {activeWorkspace && !activeMission ? (
              <button type="button" className="btn" onClick={() => void createShowcaseMission()} disabled={busy}>
                Create the mission
              </button>
            ) : null}
            <button type="button" className="btn" onClick={() => void loadSample()} disabled={busy} data-testid="showcase-load-sample">
              Load labelled sample
            </button>
            <button type="button" className="btn btn-sm showcase-btn-quiet" onClick={() => void resetDemo()} disabled={busy} data-testid="showcase-reset-demo">
              Reset demo
            </button>
            <button type="button" className="btn btn-sm showcase-btn-quiet" onClick={() => void loadAll()} disabled={busy}>
              Refresh
            </button>
          </div>
          <p className="label" style={{ margin: 0 }}>
            Reset demo removes only workspaces this page created (fresh runs and the labelled sample) — never your own work.
          </p>
          {notice ? <p className="label" role="status">{notice}</p> : null}
          {error ? <p className="field-error" role="alert">{error}</p> : null}
        </header>

        <div className="showcase-grid">
          <aside className="stack showcase-inspector" style={{ gap: 'var(--sp-4)' }} aria-label="Run inspector">
            <section className="card stack" aria-labelledby="inspector-heading">
              <h2 id="inspector-heading" className="subhead">This run</h2>
              {activeWorkspace ? (
                <p style={{ margin: 0 }}>
                  Workspace <strong>{activeWorkspace.name}</strong>{' '}
                  {activeWorkspace.name.startsWith('EXAMPLE') ? <span className="sticker sticker-wait">SAMPLE DATA</span> : null}
                  {' · '}
                  {missions.length} mission(s)
                </p>
              ) : (
                <p style={{ margin: 0 }}>Fresh session — no workspace exists in this browser yet.</p>
              )}
              <dl className="showcase-facts">
                <div>
                  <dt>Mission</dt>
                  <dd>{activeMission ? activeMission.title : 'No mission yet'}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{sourceStatus}</dd>
                </div>
                <div>
                  <dt>Approval</dt>
                  <dd>{approvalStatus}</dd>
                </div>
                <div>
                  <dt>Verification</dt>
                  <dd>{verificationStatus}</dd>
                </div>
                <div>
                  <dt>Export</dt>
                  <dd>{exportStatus}</dd>
                </div>
              </dl>
            </section>

            <section className="card stack" aria-labelledby="host-heading" data-testid="showcase-host">
              <h2 id="host-heading" className="subhead">WebMCP host</h2>
              {webmcp.supported ? (
                <p style={{ margin: 0 }}>
                  <span className="sticker sticker-pass">Host attached</span>{' '}
                  {webmcp.registered.length} tools live · stage: {webmcp.productState}
                  {webmcp.agent.name ? ` · agent "${webmcp.agent.name}"` : ' · agent has not introduced itself yet'}
                </p>
              ) : (
                <p style={{ margin: 0 }}>
                  <span className="sticker sticker-wait">No WebMCP host</span> This browser exposes no{' '}
                  <span className="mono">modelContext</span>. Every step still works manually — the agent
                  path and the human path are the same product.
                </p>
              )}
              {lastCall ? (
                <p className="label showcase-last-call" style={{ margin: 0 }} data-testid="showcase-last-call">
                  Last call: <span className="mono">{lastCall.name}</span>{' '}
                  ({lastCall.ok ? 'tool ok' : 'tool returned an error'}) ·{' '}
                  <span className="tnum">{new Date(lastCall.at).toLocaleTimeString()}</span> ·{' '}
                  {lastCall.resultPreview.slice(0, 80)}
                </p>
              ) : (
                <p className="label" style={{ margin: 0 }}>No tool calls yet this session.</p>
              )}
            </section>

            {data.pendingApproval ? (
              <section className="card stack showcase-approval" aria-labelledby="approval-heading" data-testid="showcase-approval">
                <h2 id="approval-heading" className="subhead">Approval checkpoint — human only</h2>
                <p style={{ margin: 0 }}>
                  The agent requested approval for revision r{data.pendingApproval.objectRevision}. No tool can
                  decide this; the buttons below are the only path.
                </p>
                <div className="row">
                  <button type="button" className="btn btn-primary" onClick={() => void decideApproval('approved')} disabled={busy}>
                    Approve this exact revision
                  </button>
                  <button type="button" className="btn" onClick={() => void decideApproval('rejected')} disabled={busy}>
                    Reject
                  </button>
                </div>
              </section>
            ) : null}

            <details className="card" data-testid="showcase-judge-script">
              <summary className="subhead" style={{ cursor: 'pointer' }}>Judge script — the whole path in two minutes</summary>
              <ol className="stack" style={{ gap: 'var(--sp-2)', marginTop: 'var(--sp-3)', paddingLeft: '1.2em' }}>
                <li><strong>Start fresh</strong> — a blank workspace; every chapter starts as to-do.</li>
                <li><strong>Load labelled sample</strong> — imports the hash-verified example (clearly badged as such) if you want the finished journey instead of driving it yourself.</li>
                <li>Driving it yourself: create the mission, open the lesson, paste a transcript, and watch <strong>timestamped evidence</strong> land — everything external starts untrusted.</li>
                <li>Generate the skill draft, then <strong>approve the exact revision</strong> — the one button no agent can press.</li>
                <li>Run verification: the demo artifact <strong>fails honestly</strong> (heading hierarchy), gets repaired, and passes.</li>
                <li><strong>Export</strong> the bundle + receipt — recompute the hash yourself; a one-byte edit breaks it.</li>
                <li>The host panel shows live tools when a compatible host is attached — and says so honestly when one is not.</li>
              </ol>
            </details>
          </aside>

          <div className="stack showcase-canvas" style={{ gap: 'var(--sp-5)' }}>
            <ol className="showcase-rail" aria-label="Run progress">
              {milestones.map((milestone) => (
                <li
                  key={milestone.label}
                  className={`showcase-rail-item${milestone.reached ? ' is-on' : ''}`}
                  aria-label={`${milestone.label} — ${milestone.reached ? 'reached' : 'not yet'}`}
                >
                  <span className="showcase-rail-dot" aria-hidden="true" />
                  <span className="showcase-rail-label">{milestone.label}</span>
                </li>
              ))}
            </ol>

            <div className="stack" style={{ gap: 'var(--sp-3)' }} data-testid="showcase-steps">
              {CHAPTERS.map((chapter, chapterIndex) => {
                const chapterSteps = steps.slice(chapter.from, chapter.to + 1);
                const doneCount = chapterSteps.filter((step) => step.status === 'done').length;
                const isCurrent = chapterIndex === currentChapter;
                return (
                  <details
                    key={chapter.name}
                    className={`showcase-chapter${isCurrent ? ' is-current' : ''}`}
                    open={openChapters[chapter.name] ?? isCurrent}
                    onToggle={(event) => setOpenChapters((current) => ({ ...current, [chapter.name]: (event.currentTarget as HTMLDetailsElement).open }))}
                  >
                    <summary>
                      <span className="showcase-chapter-name">{chapter.name}</span>
                      <span className="showcase-chapter-count">
                        {doneCount} of {chapterSteps.length} done
                      </span>
                    </summary>
                    <ol className="showcase-chapter-steps">
                      {chapterSteps.map((step) => (
                        <li key={step.title} className="showcase-step">
                          <span
                            className={`sticker ${step.status === 'done' ? 'sticker-pass' : step.status === 'now' ? 'sticker-wait' : ''}`}
                            aria-label={step.status === 'done' ? 'complete' : step.status === 'now' ? 'current step' : 'not started'}
                          >
                            {step.status === 'done' ? 'DONE' : step.status === 'now' ? 'NOW' : 'TODO'}
                          </span>
                          <div className="stack showcase-step-body" style={{ gap: 'var(--sp-1)' }}>
                            <strong>{step.title}</strong>
                            <span>{step.detail}</span>
                          </div>
                          {step.href ? <Link to={step.href} className="link-quiet">Open</Link> : null}
                        </li>
                      ))}
                    </ol>
                  </details>
                );
              })}
            </div>

            <section className="card stack" aria-labelledby="timeline-heading">
              <h2 id="timeline-heading" className="subhead">Event timeline (append-only)</h2>
              {data.events.length === 0 ? (
                <p className="label" style={{ margin: 0 }}>No events yet — every mutation will land here with its actor.</p>
              ) : (
                <div className="stack" style={{ gap: 'var(--sp-1)', maxHeight: 280, overflowY: 'auto' }}>
                  {data.events.map((event) => (
                    <div key={event.id} className="event-row">
                      <span className="mono">#{event.sequence}</span>{' '}
                      <span className="sticker">{event.actorType.toUpperCase()}</span> {event.summary}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        <footer className="row" style={{ justifyContent: 'space-between' }}>
          <span className="label">Local-first · everything above lives in this browser's IndexedDB</span>
          <Link to="/studio" className="link-quiet">Continue in the Studio →</Link>
        </footer>
      </div>
    </main>
  );
}
