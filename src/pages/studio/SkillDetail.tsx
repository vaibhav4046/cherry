import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  decideSkillGraphApproval,
  getSkillGraph,
  graphIssues,
  listApprovals,
  listSkillGraphVersions,
  requestSkillGraphApproval,
  reviseSkillGraph,
  rollbackSkillGraph,
} from '../../cherry/skillgraph/skillgraph-service.ts';
import type { SkillGraph, SkillGraphVersion, SkillNode } from '../../cherry/skillgraph/skillgraph-model.ts';
import type { ApprovalRecord } from '../../cherry/approval/approval-model.ts';
import { compileSkillBundle } from '../../cherry/compiler/archive-builder.ts';
import { listEvidence } from '../../cherry/evidence/evidence-service.ts';
import type { EvidenceRecord } from '../../cherry/evidence/evidence-model.ts';
import { useAppState } from '../../app/AppState.tsx';

export default function SkillDetail() {
  const { skillId } = useParams<{ skillId: string }>();
  const { refresh } = useAppState();
  const [graph, setGraph] = useState<SkillGraph | null>(null);
  const [versions, setVersions] = useState<SkillGraphVersion[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [selectedNode, setSelectedNode] = useState<SkillNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!skillId) return;
    const loaded = await getSkillGraph(skillId);
    setGraph(loaded ?? null);
    if (loaded) {
      setVersions(await listSkillGraphVersions(loaded.id));
      setApprovals((await listApprovals(loaded.workspaceId)).filter((approval) => approval.objectId === loaded.id));
      setEvidence(await listEvidence(loaded.workspaceId, loaded.missionId ? { missionId: loaded.missionId } : undefined));
    }
  }, [skillId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!graph) {
    return (
      <div className="empty-state">
        <p className="subhead">Skill not found.</p>
        <Link to="/studio/skills" className="btn">Back to Skills</Link>
      </div>
    );
  }

  const issues = graphIssues(graph);
  const pendingApproval = approvals.find((approval) => approval.decision === 'pending');

  async function run<T>(work: () => Promise<{ ok: true; value: T } | { ok: false; error: { message: string } }>, successNote?: string) {
    setError(null);
    setNotice(null);
    const result = await work();
    if (!result.ok) setError(result.error.message);
    else if (successNote) setNotice(successNote);
    await load();
    await refresh();
    return result;
  }

  async function handleEditNode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedNode) return;
    const data = new FormData(event.currentTarget);
    const updatedNodes = graph!.nodes.map((node) =>
      node.id === selectedNode.id
        ? { ...node, title: String(data.get('title') ?? node.title), goal: String(data.get('goal') ?? node.goal) }
        : node,
    );
    await run(
      () => reviseSkillGraph(graph!.id, { nodes: updatedNodes }, `Edited node "${selectedNode.title}"`, 'human', graph!.revision),
      'Node updated as a new revision',
    );
    setSelectedNode(null);
  }

  async function handleCompile() {
    const result = await run(() => compileSkillBundle(graph!.id));
    if (result.ok) {
      const bundle = result.value;
      const url = URL.createObjectURL(bundle.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = bundle.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice(`Compiled ${bundle.fileName} (${bundle.fileList.length} files, sha256 ${bundle.sha256.slice(0, 12)}…)`);
    }
  }

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <header className="stack" style={{ gap: 'var(--sp-2)' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1 className="display-sm">{graph.name}</h1>
          <span className={graph.status === 'approved' ? 'sticker sticker-pass' : 'sticker sticker-wait'} data-testid="skill-status">
            {graph.status} · r{graph.revision}
          </span>
        </div>
        <p className="subhead">{graph.purpose}</p>
        <div className="row">
          <span className="sticker">v{graph.version}</span>
          {graph.versionHash ? <span className="sticker mono">hash {graph.versionHash.slice(0, 12)}…</span> : null}
          {graph.approvedRevision ? <span className="sticker sticker-pass">approved r{graph.approvedRevision} by {graph.approvedBy}</span> : null}
          {graph.targets.map((target) => <span key={target} className="sticker sticker-blue">{target}</span>)}
        </div>
      </header>

      {error ? <p className="field-error" role="alert">{error}</p> : null}
      {notice ? <p className="sticker sticker-pass" role="status">{notice}</p> : null}
      {issues.length > 0 ? (
        <div className="field-error" role="alert">
          <strong>Validation issues:</strong>
          <ul>{issues.map((issue) => <li key={issue.code + (issue.nodeId ?? '')}>{issue.message}</li>)}</ul>
        </div>
      ) : null}

      <div className="row">
        {!pendingApproval && graph.status !== 'approved' ? (
          <button type="button" className="btn btn-primary" onClick={() => void run(() => requestSkillGraphApproval(graph.id, 'Review requested from the skill page', 'user'), 'Approval requested')}>
            Request approval of r{graph.revision}
          </button>
        ) : null}
        {pendingApproval ? (
          <>
            <button type="button" className="btn btn-primary" data-testid="approve-skill" onClick={() => void run(() => decideSkillGraphApproval(pendingApproval.id, 'approved', 'user'), 'Approved at this exact revision')}>
              Approve r{pendingApproval.objectRevision}
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void run(() => decideSkillGraphApproval(pendingApproval.id, 'rejected', 'user'))}>
              Reject
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="btn"
          data-testid="compile-bundle"
          onClick={() => void handleCompile()}
          disabled={graph.status !== 'approved' || graph.approvedRevision !== graph.revision}
          title={graph.status !== 'approved' ? 'Compiling requires an approval at the current revision' : 'Download the portable skill bundle'}
        >
          Compile skill bundle (.zip)
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)', gap: 'var(--sp-4)' }} className="skill-grid">
        <section className="card stack" aria-labelledby="nodes-heading">
          <h2 id="nodes-heading" className="subhead">Workflow nodes ({graph.nodes.length})</h2>
          <ol className="stack" style={{ margin: 0, paddingLeft: 'var(--sp-6)' }}>
            {graph.nodes.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  className="card row"
                  style={{ width: '100%', justifyContent: 'space-between', cursor: 'pointer', background: selectedNode?.id === node.id ? 'var(--color-cherry-wash)' : 'var(--color-paper-white)' }}
                  onClick={() => setSelectedNode(node)}
                  aria-expanded={selectedNode?.id === node.id}
                >
                  <span><strong>{node.title}</strong> — {node.goal}</span>
                  <span className="sticker">{node.kind}</span>
                </button>
              </li>
            ))}
          </ol>
          {selectedNode ? (
            <form onSubmit={handleEditNode} className="card card-wash-sky stack">
              <h3 className="label">Edit node (creates a new revision)</h3>
              <label className="field"><span>Title</span><input className="input" name="title" defaultValue={selectedNode.title} required /></label>
              <label className="field"><span>Goal</span><textarea className="textarea" name="goal" defaultValue={selectedNode.goal} required style={{ minHeight: 60 }} /></label>
              <div className="row">
                <span className="sticker">evidence: {selectedNode.evidenceIds.length}</span>
                <span className="sticker">gates: {selectedNode.humanGateIds.length}</span>
                <span className="sticker">on failure: {selectedNode.onFailure.strategy}</span>
              </div>
              <div className="row">
                <button type="submit" className="btn btn-sm btn-primary" data-testid="save-node">Save as r{graph.revision + 1}</button>
                <button type="button" className="btn btn-sm" onClick={() => setSelectedNode(null)}>Cancel</button>
              </div>
            </form>
          ) : null}
        </section>

        <div className="stack">
          <section className="card stack" aria-labelledby="versions-heading">
            <h2 id="versions-heading" className="subhead">Revisions ({versions.length})</h2>
            <div style={{ maxHeight: 260, overflowY: 'auto' }} className="stack">
              {[...versions].reverse().map((version) => (
                <div key={version.id} className="event-row" style={{ justifyContent: 'space-between' }}>
                  <span>r{version.revision} · {version.status} — {version.changeSummary}</span>
                  {version.revision !== graph.revision ? (
                    <button type="button" className="btn btn-sm" onClick={() => void run(() => rollbackSkillGraph(graph.id, version.revision), `Rolled back to r${version.revision}`)}>
                      Roll back
                    </button>
                  ) : (
                    <span className="sticker sticker-pass">current</span>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="card stack" aria-labelledby="evidence-list-heading">
            <h2 id="evidence-list-heading" className="subhead">Evidence in scope ({evidence.length})</h2>
            <div style={{ maxHeight: 220, overflowY: 'auto' }} className="stack">
              {evidence.map((record) => (
                <div key={record.id} className="event-row">
                  <span className={record.trust === 'untrusted' ? 'sticker sticker-fail' : 'sticker sticker-pass'} style={{ padding: '2px 8px' }}>{record.trust}</span>
                  <span>{record.claim}</span>
                </div>
              ))}
              {evidence.length === 0 ? <p>No evidence linked to this skill's mission yet.</p> : null}
            </div>
          </section>

          <section className="card stack" aria-labelledby="evals-heading">
            <h2 id="evals-heading" className="subhead">Evaluations ({graph.evaluations.length})</h2>
            <ul className="stack" style={{ margin: 0, paddingLeft: 'var(--sp-4)' }}>
              {graph.evaluations.map((evaluation) => (
                <li key={evaluation.id}>
                  {evaluation.name} <span className="sticker" style={{ padding: '2px 8px' }}>{evaluation.type} · {evaluation.severity}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <style>{`@media (max-width: 833px) { .skill-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
