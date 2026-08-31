import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { getMission, transitionMission, updateMission } from '../../cherry/mission/mission-service.ts';
import type { Mission, MissionState } from '../../cherry/mission/mission-model.ts';
import { nextStates } from '../../cherry/mission/mission-state.ts';
import { loadLesson } from '../../cherry/watch/lesson-service.ts';
import { addEvidence, listEvidence, setEvidenceTrust, deleteEvidence } from '../../cherry/evidence/evidence-service.ts';
import type { EvidenceRecord, TrustLevel } from '../../cherry/evidence/evidence-model.ts';
import { draftSkillGraph, getSkillGraph, requestSkillGraphApproval, reviseSkillGraph } from '../../cherry/skillgraph/skillgraph-service.ts';
import type { Evaluation, SkillGraph } from '../../cherry/skillgraph/skillgraph-model.ts';
import { createArtifactSet } from '../../cherry/artifacts/artifact-service.ts';
import { runVerification, listVerifications } from '../../cherry/verify/verification-service.ts';
import type { VerificationReport } from '../../cherry/verify/assertion-model.ts';
import { createProofReceipt } from '../../cherry/proof/proof-service.ts';
import { Icons } from '../../components/Icons.tsx';

/** Plain-word status labels; the raw state stays available as a quiet label / title. */
const STATE_LABELS: Record<MissionState, string> = {
  DRAFT: 'Draft',
  LEARNING: 'Learning',
  PLANNING: 'Planning',
  AWAITING_APPROVAL: 'Waiting for your approval',
  EXECUTING: 'Running',
  VERIFYING: 'Verifying',
  COMPLETE: 'Complete',
  BLOCKED: 'Blocked',
  CANCELLED: 'Cancelled',
};

/** Shorter forms for buttons and the phase stepper. */
const MOVE_LABELS: Record<MissionState, string> = {
  ...STATE_LABELS,
  AWAITING_APPROVAL: 'Awaiting approval',
};

const MISSION_PHASES = ['DRAFT', 'LEARNING', 'PLANNING', 'AWAITING_APPROVAL', 'EXECUTING', 'VERIFYING', 'COMPLETE'] as const;

function timeOf(iso: string): string {
  return iso.slice(11, 19);
}

function since(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function MissionDetail() {
  const { missionId } = useParams<{ missionId: string }>();
  const { refresh, setActiveMission } = useAppState();
  const [mission, setMission] = useState<Mission | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [graph, setGraph] = useState<SkillGraph | null>(null);
  const [verifications, setVerifications] = useState<VerificationReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!missionId) return;
    const loaded = await getMission(missionId);
    setMission(loaded ?? null);
    if (loaded) {
      setEvidence(await listEvidence(loaded.workspaceId, { missionId: loaded.id }));
      setGraph(loaded.skillGraphId ? ((await getSkillGraph(loaded.skillGraphId)) ?? null) : null);
      setVerifications(await listVerifications(loaded.workspaceId, loaded.id));
    }
  }, [missionId]);

  useEffect(() => {
    if (missionId) setActiveMission(missionId);
    void load();
    // setActiveMission triggers a refresh loop if included; run once per missionId.
  }, [missionId, load]);

  if (!mission) {
    return (
      <div className="empty-state">
        <p className="subhead">Mission not found. It may have been deleted or belongs to another workspace.</p>
        <Link to="/studio" className="btn">Back to Command Center</Link>
      </div>
    );
  }

  async function act<T>(work: () => Promise<{ ok: true; value: T } | { ok: false; error: { message: string } }>, successNote?: string) {
    setError(null);
    setNotice(null);
    const result = await work();
    if (!result.ok) {
      setError(result.error.message);
    } else if (successNote) {
      setNotice(successNote);
    }
    await load();
    await refresh();
  }

  async function handleTransition(to: MissionState) {
    await act(() => transitionMission(mission!.id, to, 'human'), `Mission moved to ${MOVE_LABELS[to]}`);
  }

  async function handleStartLearning(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const url = String(form.get('url') ?? '').trim();
    const kind = url ? 'youtube' : 'manual';
    const permissionAcknowledged = form.get('permission') === 'on';
    await act(async () => {
      const lesson = await loadLesson({
        workspaceId: mission!.workspaceId,
        missionId: mission!.id,
        title: String(form.get('title') ?? 'Lesson'),
        kind,
        ...(url ? { url } : {}),
        permissionAcknowledged,
      });
      if (!lesson.ok) return lesson;
      await updateMission(mission!.id, { lessonId: lesson.value.id });
      if (mission!.state === 'DRAFT') await transitionMission(mission!.id, 'LEARNING');
      return lesson;
    }, 'Lesson loaded');
  }

  async function handleAddEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await act(
      () =>
        addEvidence({
          workspaceId: mission!.workspaceId,
          missionId: mission!.id,
          lessonId: mission!.lessonId ?? null,
          sourceType: 'user_statement',
          claim: String(data.get('claim') ?? ''),
          provenanceMethod: 'user_typed',
          transferability: 'transferable',
        }),
      'Evidence recorded (untrusted until you review it)',
    );
    form.reset();
  }

  async function handleTrust(record: EvidenceRecord, trust: TrustLevel) {
    await act(() => setEvidenceTrust(record.id, trust, 'human'));
  }

  async function handleDraftGraph() {
    await act(async () => {
      const drafted = await draftSkillGraph({
        workspaceId: mission!.workspaceId,
        missionId: mission!.id,
        name: `${mission!.title} skill`,
        purpose: mission!.objective,
        nodes: [
          { kind: 'build', title: 'Produce the artifact', goal: mission!.definitionOfDone[0] ?? 'Produce the mission output' },
          { kind: 'verification', title: 'Verify against the definition of done', goal: 'All acceptance assertions pass' },
        ],
      });
      if (!drafted.ok) return drafted;
      // Acceptance checks derive from the mission's definition of done: any DoD
      // line naming a file becomes a real file assertion, plus standing
      // hash/placeholder/accessibility checks over whatever artifacts exist.
      const derived: Evaluation[] = [];
      for (const line of mission!.definitionOfDone) {
        const fileMatch = /([A-Za-z0-9._/-]+\.(?:html|css|js|mjs|md|json))/.exec(line);
        if (fileMatch) {
          const wantsH1 = /\bh1\b/i.test(line);
          derived.push({
            id: `dod-${derived.length}`,
            name: line,
            type: 'file',
            severity: 'blocking',
            config: wantsH1 ? { path: fileMatch[1], contains: '<h1' } : { path: fileMatch[1] },
          });
        }
      }
      derived.push(
        { id: 'std-hash', name: 'Artifact hashes recompute', type: 'hash', severity: 'blocking', config: {} },
        { id: 'std-policy', name: 'No unresolved placeholder markers', type: 'policy', severity: 'blocking', config: {} },
        { id: 'std-a11y', name: 'Entry HTML accessibility basics', type: 'accessibility', severity: 'error', config: {} },
      );
      const withChecks = await reviseSkillGraph(
        drafted.value.id,
        { evaluations: [...drafted.value.evaluations, ...derived] },
        'Derived acceptance checks from the definition of done',
        'system',
      );
      if (!withChecks.ok) return withChecks;
      await updateMission(mission!.id, { skillGraphId: drafted.value.id });
      if (mission!.state === 'LEARNING') await transitionMission(mission!.id, 'PLANNING');
      return withChecks;
    }, 'Skill draft created with acceptance checks from the definition of done');
  }

  async function handleRequestApproval() {
    await act(async () => {
      const request = await requestSkillGraphApproval(graph!.id, 'Please review this skill revision', 'user');
      if (request.ok && mission!.state === 'PLANNING') {
        await transitionMission(mission!.id, 'AWAITING_APPROVAL');
      }
      return request;
    }, 'Approval requested — decide it from the Command Center');
  }

  async function handleCreateArtifacts() {
    await act(async () => {
      const set = await createArtifactSet(mission!.workspaceId, mission!.id, `${mission!.title} artifacts`);
      if (!set.ok) return set;
      await updateMission(mission!.id, { artifactSetId: set.value.id });
      return set;
    }, 'File workspace created');
  }

  async function handleVerify() {
    await act(async () => {
      if (mission!.state === 'EXECUTING') await transitionMission(mission!.id, 'VERIFYING');
      return runVerification({ missionId: mission!.id });
    });
  }

  async function handleReceipt() {
    await act(() => createProofReceipt(mission!.id), 'Proof receipt generated — see the Proof page');
  }

  const latestVerification = verifications[0] ?? null;
  const failedAssertions = latestVerification ? latestVerification.results.filter((assertion) => assertion.status === 'failed') : [];
  const lastChange = mission.stateHistory[mission.stateHistory.length - 1] ?? null;
  const availableStates = nextStates(mission.state);

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <header className="stack" style={{ gap: 'var(--sp-2)' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h1 className="display-sm">{mission.title}</h1>
          <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
            <span className="sticker sticker-cherry">{STATE_LABELS[mission.state]}</span>
            <span className="label mission-raw-state" data-testid="mission-state">{mission.state}</span>
          </div>
        </div>
        <p className="subhead">{mission.objective}</p>
        <div className="row" aria-label="Mission phases" data-testid="mission-stepper" style={{ gap: 'var(--sp-1)' }}>
          {MISSION_PHASES.map((phase, index, phases) => {
            const currentIndex = phases.indexOf(mission.state as (typeof phases)[number]);
            const status = mission.state === phase ? 'current' : currentIndex > index ? 'done' : 'ahead';
            return (
              <span
                key={phase}
                title={phase}
                className={status === 'current' ? 'sticker sticker-cherry' : status === 'done' ? 'sticker sticker-pass' : 'sticker'}
                style={{ padding: '2px 10px', fontSize: 12, opacity: status === 'ahead' ? 0.55 : 1 }}
              >
                {status === 'done' ? <>{Icons.check(14)} </> : null}{MOVE_LABELS[phase]}
              </span>
            );
          })}
        </div>
        <div className="stack" style={{ gap: 'var(--sp-1)' }}>
          <h2 className="contract-h" style={{ margin: 0 }}>Definition of done</h2>
          <ul className="dod-list">
            {mission.definitionOfDone.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      </header>

      {error ? <p className="field-error" role="alert">{error}</p> : null}
      {notice ? <p className="sticker sticker-pass" role="status">{notice}</p> : null}

      <section className="card stack" aria-labelledby="run-heading">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 id="run-heading" className="subhead">Run</h2>
          <p className="run-meta tnum" title={`Raw state: ${mission.state}`}>
            {STATE_LABELS[mission.state]}
            {lastChange ? ` for ${since(lastChange.at)}` : ''} · updated {timeOf(mission.updatedAt)}
          </p>
        </div>

        <div className="row">
          {availableStates.map((state) => (
            <button key={state} type="button" className="btn btn-sm" title={`Raw state: ${state}`} onClick={() => void handleTransition(state)}>
              Move to {MOVE_LABELS[state]}
            </button>
          ))}
          {availableStates.length === 0 ? <span>This mission has reached its final state.</span> : null}
        </div>

        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => void handleVerify()} data-testid="run-verification">
            Run verification
          </button>
          <button type="button" className="btn" onClick={() => void handleReceipt()} disabled={!graph}>
            Generate proof receipt
          </button>
          {latestVerification ? (
            <span
              key={latestVerification.id}
              className={latestVerification.status === 'passed' ? 'sticker sticker-pass' : 'sticker sticker-fail'}
              data-testid="verification-status"
            >
              {latestVerification.status} · {latestVerification.totalAssertions - latestVerification.blockingFailures}/{latestVerification.totalAssertions}
            </span>
          ) : (
            <span className="contract-empty">Not verified yet — verification tests the real files and cannot be toggled by hand.</span>
          )}
        </div>

        {latestVerification && latestVerification.status === 'passed' ? (
          <div className="pass-calm">
            <span className="run-ico run-ico-pass" aria-hidden="true">{Icons.check(16)}</span>
            <p style={{ margin: 0 }}>
              <strong>Verified.</strong>{' '}
              <span className="contract-empty">All {latestVerification.totalAssertions} checks passed against the real files at {timeOf(latestVerification.finishedAt)}.</span>
            </p>
          </div>
        ) : null}

        {latestVerification && latestVerification.status === 'failed' ? (
          <div className="fail-panel">
            <strong>Failed assertions</strong>
            <ul className="assert-list">
              {failedAssertions.map((assertion) => (
                <li key={assertion.id} className="assert-row">
                  <span className="run-ico run-ico-fail" aria-hidden="true">{Icons.close(16)}</span>
                  <div style={{ minWidth: 0 }}>
                    <span>{assertion.name}</span>
                    {assertion.evidence.slice(0, 3).map((line, index) => (
                      <p key={index} className="assert-quote">“{line}”</p>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <p style={{ margin: 0 }}>
              Cause: the produced files do not yet meet the definition of done. Next action: fix the files, then run verification again.
            </p>
            {mission.artifactSetId ? (
              <Link to={`/studio/artifacts/${mission.artifactSetId}`} className="btn btn-sm btn-primary" style={{ alignSelf: 'flex-start' }}>
                Apply repair and rerun
              </Link>
            ) : null}
          </div>
        ) : null}

        {latestVerification ? (
          <div className="stack" style={{ gap: 'var(--sp-1)' }}>
            <h3 className="contract-h" style={{ margin: 0 }}>Checks</h3>
            <div className="run-rows">
              {latestVerification.results.map((assertion) => (
                <div key={assertion.id} className="run-row">
                  <span className={assertion.status === 'passed' ? 'run-ico run-ico-pass' : 'run-ico run-ico-fail'} aria-hidden="true">
                    {assertion.status === 'passed' ? Icons.check(14) : Icons.close(14)}
                  </span>
                  <span className="run-time">{timeOf(assertion.finishedAt)}</span>
                  <span>{assertion.name}</span>
                  <span className="run-result">{assertion.status}{assertion.status !== 'passed' && assertion.evidence[0] ? ` — ${assertion.evidence[0]}` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="stack" style={{ gap: 'var(--sp-1)' }}>
          <h3 className="contract-h" style={{ margin: 0 }}>Events ({mission.stateHistory.length})</h3>
          <div className="run-rows">
            {mission.stateHistory.map((change, index) => (
              <div key={index} className="run-row" title={`${change.from ?? '∅'} → ${change.to}`}>
                <span className="run-ico run-ico-step" aria-hidden="true">→</span>
                <span className="run-time">{timeOf(change.at)}</span>
                <span>{change.from === null ? 'Mission created' : `Moved to ${MOVE_LABELS[change.to]}`}{change.reason ? ` — ${change.reason}` : ''}</span>
                <span className="run-result">{change.actorType}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid-cards">
        <section className="card card-wash-sky stack" aria-labelledby="lesson-heading">
          <h2 id="lesson-heading" className="subhead">Lesson</h2>
          {mission.lessonId ? (
            <Link to={`/studio/watch/${mission.lessonId}`} className="btn btn-primary">Open Cherry Watch</Link>
          ) : (
            <form onSubmit={handleStartLearning} className="stack">
              <label className="field">
                <span>Lesson title</span>
                <input className="input" name="title" required maxLength={300} placeholder="How the tutorial builds it" />
              </label>
              <label className="field">
                <span>YouTube URL or video id (blank = manual lesson)</span>
                <input className="input" name="url" placeholder="https://youtu.be/…" />
              </label>
              <label className="row" style={{ fontSize: 14 }}>
                <input type="checkbox" name="permission" style={{ width: 20, height: 20 }} />
                I am permitted to learn from this source, and I will not copy its branding or assets.
              </label>
              <button type="submit" className="btn" style={{ alignSelf: 'flex-start' }}>Load lesson</button>
            </form>
          )}
        </section>

        <section className="card stack" aria-labelledby="graph-heading">
          <h2 id="graph-heading" className="subhead">Skill steps</h2>
          {graph ? (
            <>
              <p>
                <strong>{graph.name}</strong> · v{graph.version} · r{graph.revision} ·{' '}
                <span className="sticker">{graph.status}</span>
              </p>
              <div className="row">
                <Link to={`/studio/skills/${graph.id}`} className="btn btn-sm">Open graph</Link>
                {graph.status !== 'approved' && graph.status !== 'ready_for_review' ? (
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => void handleRequestApproval()}>
                    Request approval of r{graph.revision}
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <p>No skill yet. Compile the lesson from Cherry Watch, or draft one from the mission.</p>
              <button type="button" className="btn" onClick={() => void handleDraftGraph()}>Draft the skill</button>
            </>
          )}
        </section>

        <section className="card card-wash-mint stack" aria-labelledby="artifact-heading">
          <h2 id="artifact-heading" className="subhead">Files & preview</h2>
          {mission.artifactSetId ? (
            <Link to={`/studio/artifacts/${mission.artifactSetId}`} className="btn btn-primary">Open file workspace</Link>
          ) : (
            <>
              <p>The actual output of this mission: HTML, CSS, JS, Markdown, JSON. Every save is versioned and hashed; the preview runs sealed off from your data.</p>
              <button type="button" className="btn" onClick={() => void handleCreateArtifacts()}>Create file workspace</button>
            </>
          )}
        </section>
      </div>

      <section className="card stack" aria-labelledby="evidence-heading">
        <h2 id="evidence-heading" className="subhead">Evidence ledger ({evidence.length})</h2>
        <form onSubmit={handleAddEvidence} className="row">
          <input className="input" name="claim" required maxLength={2000} placeholder="Record a claim or learned principle" style={{ flex: 1, minWidth: 220 }} />
          <button type="submit" className="btn">Add evidence</button>
        </form>
        {evidence.length === 0 ? (
          <p>Empty. Everything Cherry learns is written here with provenance and a trust label.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Claim</th>
                  <th scope="col">Source</th>
                  <th scope="col">Trust</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {evidence.map((record) => (
                  <tr key={record.id}>
                    <td>{record.claim}</td>
                    <td>{record.sourceType}{typeof record.timestampSeconds === 'number' ? ` @ ${record.timestampSeconds}s` : ''}</td>
                    <td>
                      <span className={record.trust === 'approved' ? 'sticker sticker-pass' : record.trust === 'reviewed' ? 'sticker sticker-wait' : 'sticker sticker-fail'}>
                        {record.trust}
                      </span>
                    </td>
                    <td>
                      <div className="row">
                        {record.trust !== 'approved' ? (
                          <button type="button" className="btn btn-sm" onClick={() => void handleTrust(record, record.trust === 'untrusted' ? 'reviewed' : 'approved')}>
                            Raise trust
                          </button>
                        ) : null}
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => void act(() => deleteEvidence(record.id))}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
