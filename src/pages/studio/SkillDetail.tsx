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
import { exportSkillFile, type SkillExportFormat } from '../../cherry/library/library-service.ts';
import { buildConnectUrl, buildRoutineDraftUrl } from '../../cherry/library/library-links.ts';
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

function plainSkillMessage(message: string): string {
  return message
    .replace(/\bskill\s*graph\b/gi, (word) => (word[0] === word[0]?.toUpperCase() ? 'Skill' : 'skill'))
    .replace(/\brevision binding\b/gi, 'approved version')
    .replace(/\brevisions?\b/gi, (word) => (word.toLowerCase() === 'revision' ? 'version' : 'versions'))
    .replace(/\bworkspaces?\b/gi, (word) => (word.toLowerCase() === 'workspace' ? 'space' : 'spaces'))
    .replace(/\bmissions?\b/gi, (word) => (word.toLowerCase() === 'mission' ? 'project' : 'projects'))
    .replace(/\blessons?\b/gi, (word) => (word.toLowerCase() === 'lesson' ? 'source' : 'sources'))
    .replace(/\bnodes?\b/gi, (word) => (word.toLowerCase() === 'node' ? 'step' : 'steps'))
    .replace(/\bprovenance\b/gi, 'where this came from')
    .replace(/\bartifact set\b/gi, 'files');
}

function evaluationLabel(name: string): string {
  return name === 'Skill graph is structurally valid' ? 'Skill is structurally valid' : name;
}

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
  const installReady = graph.status === 'approved' && graph.approvedRevision === graph.revision;

  async function run<T>(work: () => Promise<{ ok: true; value: T } | { ok: false; error: { message: string } }>, successNote?: string) {
    setError(null);
    setNotice(null);
    const result = await work();
    if (!result.ok) setError(plainSkillMessage(result.error.message));
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
      'Step updated as a new version',
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
      setNotice(`Downloaded ${bundle.fileName} (${bundle.fileList.length} files, sha256 ${bundle.sha256.slice(0, 12)}…)`);
    }
  }

  async function handleExport(format: SkillExportFormat, mode: 'download' | 'copy') {
    const result = await run(() => exportSkillFile(graph!.id, format));
    if (!result.ok) return;
    const file = result.value;
    if (mode === 'copy') {
      try {
        await navigator.clipboard.writeText(file.content);
        setNotice(`Copied ${file.fileName} (r${file.revision}) to the clipboard`);
      } catch {
        setError('Clipboard unavailable in this browser. Use the download instead.');
      }
      return;
    }
    const url = URL.createObjectURL(new Blob([file.content], { type: 'text/markdown' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(`Downloaded ${file.fileName} (approved r${file.revision})`);
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
          <strong>Fix before approval:</strong>
          <ul>{issues.map((issue) => <li key={issue.code + (issue.nodeId ?? '')}>{plainSkillMessage(issue.message)}</li>)}</ul>
        </div>
      ) : null}

      <div className="row">
        {installReady ? (
          <>
            <Link className="btn btn-primary" to={buildRoutineDraftUrl(graph.workspaceId, graph.id)}>Use in routine</Link>
            <a className="btn" href={buildConnectUrl(graph.targets)}>Send to agent</a>
          </>
        ) : null}
        {!pendingApproval && graph.status !== 'approved' ? (
          <button type="button" className="btn btn-primary" onClick={() => void run(() => requestSkillGraphApproval(graph.id, 'Review requested from the skill page', 'user'), 'Approval requested')}>
            Request approval
          </button>
        ) : null}
        {pendingApproval ? (
          <>
            <button type="button" className="btn btn-primary" data-testid="approve-skill" onClick={() => void run(() => decideSkillGraphApproval(pendingApproval.id, 'approved', 'user'), 'Approved at this exact version')}>
              Approve this version
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
          title={graph.status !== 'approved' || graph.approvedRevision !== graph.revision ? 'Download requires approval of the current version' : 'Download the portable skill bundle'}
        >
          Download bundle (.zip)
        </button>
        <button
          type="button"
          className="btn"
          data-testid="export-skill-md"
          onClick={() => void handleExport('skill-md', 'download')}
          disabled={graph.status !== 'approved' || graph.approvedRevision !== graph.revision}
          title={graph.status !== 'approved' || graph.approvedRevision !== graph.revision ? 'Download requires approval of the current version' : 'Agent Skills format: Claude Code, Hermes-class agents'}
        >
          Download SKILL.md
        </button>
        <button
          type="button"
          className="btn"
          data-testid="copy-agents-md"
          onClick={() => void handleExport('agents-md', 'copy')}
          disabled={graph.status !== 'approved' || graph.approvedRevision !== graph.revision}
          title={graph.status !== 'approved' || graph.approvedRevision !== graph.revision ? 'Copying requires approval of the current version' : 'Copy the AGENTS.md block for Codex'}
        >
          Copy AGENTS.md (Codex)
        </button>
        <button
          type="button"
          className="btn"
          data-testid="export-claude-md"
          onClick={() => void handleExport('claude-md', 'download')}
          disabled={graph.status !== 'approved' || graph.approvedRevision !== graph.revision}
          title={graph.status !== 'approved' || graph.approvedRevision !== graph.revision ? 'Download requires approval of the current version' : 'CLAUDE.md install file for Claude Code'}
        >
          Download CLAUDE.md
        </button>
      </div>

      <div className="contract-grid">
        <article className="card contract-doc" aria-label="Skill details">
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
                <h3 className="label">Edit step — saves as a new version</h3>
                <label className="field"><span>Title</span><input className="input" name="title" defaultValue={selectedNode.title} required /></label>
                <label className="field"><span>Goal</span><textarea className="textarea" name="goal" defaultValue={selectedNode.goal} required style={{ minHeight: 60 }} /></label>
                <div className="row">
                  <span className="sticker">{selectedNode.evidenceIds.length} source notes</span>
                  <span className="sticker">{selectedNode.humanGateIds.length} approvals needed</span>
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
            <h2 id="evidence-list-heading" className="contract-h">What the source said ({evidence.length})</h2>
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
                    {evaluationLabel(evaluation.name)} <span className="quiet">— {evaluation.type} · {evaluation.severity}</span>
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
              <dt>Skill version</dt><dd className="tnum">v{graph.version} · r{graph.revision}</dd>
              {typeof graph.approvedRevision === 'number' ? (
                <><dt>Approved</dt><dd className="tnum">r{graph.approvedRevision}</dd></>
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
              <h2 id="checkpoint-heading" className="contract-h" style={{ margin: 0 }}>Approved exactly as you read it</h2>
              {graph.versionHash ? <p className="checkpoint-hash" title="Content hash of the approved version">{graph.versionHash}</p> : null}
              <p className="contract-empty">approved r{graph.approvedRevision} by {graph.approvedBy === 'user' ? 'you' : graph.approvedBy}</p>
            </section>
          ) : null}

          <section className="card stack" aria-labelledby="versions-heading">
            <h2 id="versions-heading" className="contract-h" style={{ margin: 0 }}>Version history ({versions.length})</h2>
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
