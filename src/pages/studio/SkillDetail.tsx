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
import type { JsonSchemaObject, SkillGraph, SkillGraphVersion, SkillNode } from '../../cherry/skillgraph/skillgraph-model.ts';
import type { ApprovalRecord } from '../../cherry/approval/approval-model.ts';
import { compileSkillBundle } from '../../cherry/compiler/archive-builder.ts';
import { listEvidence } from '../../cherry/evidence/evidence-service.ts';
import type { EvidenceRecord } from '../../cherry/evidence/evidence-model.ts';
import { useAppState } from '../../app/AppState.tsx';

const FAILURE_LABELS: Record<string, string> = {
  stop: 'stop the run',
  retry: 'retry',
  'return-to-node': 'go back to an earlier step',
  'request-approval': 'ask for your approval',
};

const EFFECT_LABELS: Record<string, string> = {
  allow: 'allowed',
  deny: 'not allowed',
  'require-approval': 'needs your approval',
  'require-verification': 'must be verified',
};

interface SchemaField {
  name: string;
  type: string;
  required: boolean;
}

function schemaFields(schema?: JsonSchemaObject | null): SchemaField[] {
  if (!schema || typeof schema !== 'object') return [];
  const properties = schema.properties ?? {};
  return Object.entries(properties).map(([name, definition]) => {
    const type =
      definition && typeof definition === 'object' && 'type' in definition
        ? String((definition as { type?: unknown }).type ?? '')
        : '';
    return { name, type, required: schema.required?.includes(name) ?? false };
  });
}

function SchemaFieldList({ fields }: { fields: SchemaField[] }) {
  return (
    <ul className="contract-list" style={{ listStyle: 'none', paddingLeft: 0 }}>
      {fields.map((field) => (
        <li key={field.name}>
          <span className="mono">{field.name}</span>{' '}
          <span className="quiet">
            {field.type || 'any'}
            {field.required ? ' · required' : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

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
  const evidenceById = new Map(evidence.map((record) => [record.id, record]));
  const inputFields = schemaFields(graph.inputSchema);
  const outputFields = schemaFields(graph.outputSchema);
  const knowledgeRefs = graph.knowledge ?? [];

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
      'Step updated as a new revision',
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
        <h1 className="display-sm">{graph.name}</h1>
        <p className="subhead">{graph.purpose}</p>
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
            <button type="button" className="btn btn-primary" data-testid="approve-skill" onClick={() => void run(() => decideSkillGraphApproval(pendingApproval.id, 'approved', 'user'), 'Approved at this exact version')}>
              Approve revision {graph.version}.{pendingApproval.objectRevision}
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

      <div className="contract-grid">
        <article className="card contract-doc" aria-label="Skill contract">
          <section className="contract-section" aria-labelledby="goal-heading">
            <h2 id="goal-heading" className="contract-h">Goal</h2>
            <p style={{ margin: 0 }}>{graph.purpose}</p>
          </section>

          <section className="contract-section" aria-labelledby="inputs-heading">
            <h2 id="inputs-heading" className="contract-h">Inputs</h2>
            {inputFields.length > 0 ? <SchemaFieldList fields={inputFields} /> : <p className="contract-empty">None recorded.</p>}
          </section>

          <section className="contract-section" aria-labelledby="method-heading">
            <h2 id="method-heading" className="contract-h">Method ({graph.nodes.length} steps)</h2>
            {graph.nodes.length === 0 ? <p className="contract-empty">None recorded.</p> : (
              <ol className="method-list">
                {graph.nodes.map((node) => (
                  <li key={node.id} className="method-step">
                    <button
                      type="button"
                      className="method-btn"
                      onClick={() => setSelectedNode(selectedNode?.id === node.id ? null : node)}
                      aria-expanded={selectedNode?.id === node.id}
                    >
                      <span>
                        <strong>{node.title}</strong>
                        <span className="method-goal">{node.goal}</span>
                        {node.evidenceIds.length > 0 ? (
                          <span className="method-refs">
                            {node.evidenceIds.map((id) => {
                              const record = evidenceById.get(id);
                              return (
                                <span key={id} className="evidence-chip" title={record?.claim ?? id}>
                                  {record ? record.claim : id.slice(0, 8)}
                                </span>
                              );
                            })}
                          </span>
                        ) : null}
                      </span>
                      <span className="method-kind">{node.kind}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
            {selectedNode ? (
              <form onSubmit={handleEditNode} className="card card-wash-sky stack" style={{ marginTop: 'var(--sp-3)' }}>
                <h3 className="label">Edit step — saves as a new revision</h3>
                <label className="field"><span>Title</span><input className="input" name="title" defaultValue={selectedNode.title} required /></label>
                <label className="field"><span>Goal</span><textarea className="textarea" name="goal" defaultValue={selectedNode.goal} required style={{ minHeight: 60 }} /></label>
                <div className="row">
                  <span className="sticker">{selectedNode.evidenceIds.length} evidence</span>
                  <span className="sticker">{selectedNode.humanGateIds.length} approval gates</span>
                  <span className="sticker">if it fails: {FAILURE_LABELS[selectedNode.onFailure.strategy] ?? selectedNode.onFailure.strategy}</span>
                </div>
                <div className="row">
                  <button type="submit" className="btn btn-sm btn-primary" data-testid="save-node">Save as r{graph.revision + 1}</button>
                  <button type="button" className="btn btn-sm" onClick={() => setSelectedNode(null)}>Cancel</button>
                </div>
              </form>
            ) : null}
          </section>

          <section className="contract-section" aria-labelledby="constraints-heading">
            <h2 id="constraints-heading" className="contract-h">Constraints</h2>
            {graph.guardrails.length > 0 ? (
              <ul className="contract-list" style={{ listStyle: 'none', paddingLeft: 0 }}>
                {graph.guardrails.map((rule) => (
                  <li key={rule.id}>
                    <strong>{rule.title}</strong>{' '}
                    <span className="quiet">— {EFFECT_LABELS[rule.effect] ?? rule.effect}{rule.condition ? ` when ${rule.condition}` : ''}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="contract-empty">None recorded.</p>}
          </section>

          <section className="contract-section" aria-labelledby="evidence-list-heading">
            <h2 id="evidence-list-heading" className="contract-h">Evidence in scope ({evidence.length})</h2>
            {knowledgeRefs.length > 0 ? (
              <ul className="contract-list" style={{ listStyle: 'none', paddingLeft: 0, marginBottom: 'var(--sp-3)' }}>
                {knowledgeRefs.map((reference) => {
                  const record = evidenceById.get(reference.evidenceId);
                  return (
                    <li key={reference.evidenceId}>
                      {record ? record.claim : reference.evidenceId.slice(0, 8)}{' '}
                      <span className="quiet">— {reference.use} · {reference.trust}</span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {evidence.length > 0 ? (
              <div className="stack" style={{ maxHeight: 220, overflowY: 'auto' }}>
                {evidence.map((record) => (
                  <div key={record.id} className="event-row">
                    <span className={record.trust === 'untrusted' ? 'sticker sticker-fail' : 'sticker sticker-pass'} style={{ padding: '2px 8px' }}>{record.trust}</span>
                    <span>{record.claim}</span>
                  </div>
                ))}
              </div>
            ) : (
              knowledgeRefs.length === 0 ? <p className="contract-empty">None recorded.</p> : null
            )}
          </section>

          <section className="contract-section" aria-labelledby="expected-heading">
            <h2 id="expected-heading" className="contract-h">Expected result</h2>
            {outputFields.length > 0 ? <SchemaFieldList fields={outputFields} /> : <p className="contract-empty">None recorded.</p>}
          </section>

          <section className="contract-section" aria-labelledby="evals-heading">
            <h2 id="evals-heading" className="contract-h">Failure checks ({graph.evaluations.length})</h2>
            {graph.evaluations.length > 0 ? (
              <ul className="contract-list" style={{ listStyle: 'none', paddingLeft: 0 }}>
                {graph.evaluations.map((evaluation) => (
                  <li key={evaluation.id}>
                    {evaluation.name} <span className="quiet">— {evaluation.type} · {evaluation.severity}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="contract-empty">None recorded.</p>}
          </section>
        </article>

        <aside className="contract-rail stack" aria-label="Version and history">
          <section className="card stack" aria-labelledby="version-heading">
            <h2 id="version-heading" className="contract-h" style={{ margin: 0 }}>Version</h2>
            <span
              key={`${graph.status}-${graph.revision}`}
              className={graph.status === 'approved' ? 'sticker sticker-pass stamp-in' : 'sticker sticker-wait'}
              data-testid="skill-status"
              style={{ alignSelf: 'flex-start' }}
            >
              {graph.status} · r{graph.revision}
            </span>
            <dl className="rail-kv">
              <dt>Version</dt><dd className="tnum">v{graph.version}</dd>
              <dt>Revision</dt><dd className="tnum">r{graph.revision}</dd>
              {typeof graph.approvedRevision === 'number' ? (
                <><dt>Approved rev</dt><dd className="tnum">r{graph.approvedRevision}</dd></>
              ) : null}
              {graph.versionHash ? (
                <><dt>Content hash</dt><dd className="mono tnum" title={graph.versionHash}>{graph.versionHash.slice(0, 12)}…</dd></>
              ) : null}
              <dt>Created</dt><dd className="tnum">{graph.createdAt.slice(0, 10)}</dd>
            </dl>
            {graph.targets.length > 0 ? (
              <div className="row" style={{ gap: 6 }}>
                {graph.targets.map((target) => <span key={target} className="sticker sticker-blue" style={{ padding: '2px 8px' }}>{target}</span>)}
              </div>
            ) : null}
          </section>

          {graph.status === 'approved' && typeof graph.approvedRevision === 'number' ? (
            <section className="card checkpoint-panel stack" aria-labelledby="checkpoint-heading">
              <h2 id="checkpoint-heading" className="contract-h" style={{ margin: 0 }}>Checkpoint — immutable once approved</h2>
              {graph.versionHash ? <p className="checkpoint-hash" title="Content hash of the approved revision">{graph.versionHash}</p> : null}
              <p className="contract-empty">approved r{graph.approvedRevision} by {graph.approvedBy}</p>
            </section>
          ) : null}

          <section className="card stack" aria-labelledby="versions-heading">
            <h2 id="versions-heading" className="contract-h" style={{ margin: 0 }}>Revisions ({versions.length})</h2>
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
        </aside>
      </div>
    </div>
  );
}
