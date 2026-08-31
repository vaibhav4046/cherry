import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAppState } from '../../app/AppState.tsx';
import {
  compileCorrection,
  decideMemory,
  deleteMemory,
  listMemories,
  proposeMemory,
  setMemoryPinned,
} from '../../cherry/memory/memory-service.ts';
import { CORRECTION_CLASS_TARGET, CORRECTION_CLASSES, type MemoryRecord } from '../../cherry/memory/memory-model.ts';
import MemoryGraph from './MemoryGraph.tsx';
import { Icons } from '../../components/Icons.tsx';

export default function MemoryVault() {
  const { activeWorkspace, activeMission } = useAppState();
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setMemories(await listMemories(activeWorkspace.id));
  }, [activeWorkspace]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!activeWorkspace) {
    return <div className="empty-state"><p className="subhead">Create a workspace first.</p></div>;
  }

  const inbox = memories.filter((memory) => memory.status === 'proposed');
  const visible = memories.filter((memory) => (filterStatus === 'all' ? memory.status !== 'proposed' : memory.status === filterStatus));

  async function handlePropose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const result = await proposeMemory({
      workspaceId: activeWorkspace!.id,
      type: (data.get('type') as MemoryRecord['type']) ?? 'preference',
      title: String(data.get('title') ?? ''),
      content: String(data.get('content') ?? ''),
      scope: (data.get('scope') as MemoryRecord['scope']) ?? 'workspace',
      sensitivity: (data.get('sensitivity') as MemoryRecord['sensitivity']) ?? 'private',
      provenance: [{ sourceType: 'human', trust: 'reviewed', description: 'Entered directly in the Memory Vault' }],
    });
    if (!result.ok) setError(result.error.message);
    form.reset();
    await load();
  }

  async function handleCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const result = await compileCorrection({
      workspaceId: activeWorkspace!.id,
      missionId: activeMission?.id ?? null,
      correctionClass: (data.get('correctionClass') as (typeof CORRECTION_CLASSES)[number]) ?? 'mission_rule',
      whatFailed: String(data.get('whatFailed') ?? ''),
      approvedFix: String(data.get('approvedFix') ?? ''),
    });
    if (!result.ok) setError(result.error.message);
    form.reset();
    await load();
  }

  async function decide(memory: MemoryRecord, decision: 'approved' | 'rejected') {
    setError(null);
    const result = await decideMemory(memory.id, decision, 'user');
    if (!result.ok) setError(result.error.message);
    await load();
  }

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <h1 className="display-sm">Memory Vault</h1>
      <p className="subhead">
        Explicit, inspectable, source-linked. Nothing here took effect without your approval.
      </p>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      <MemoryGraph workspaceId={activeWorkspace.id} missionId={activeMission?.id} />

      <section className="card card-wash-lavender stack" aria-labelledby="inbox-heading">
        <h2 id="inbox-heading" className="subhead">Memory Inbox ({inbox.length})</h2>
        {inbox.length === 0 ? (
          <p>No proposals waiting. When an agent (or the correction compiler) proposes memory, it stops here first.</p>
        ) : (
          inbox.map((memory) => (
            <div key={memory.id} className="card stack" data-testid="memory-proposal">
              <div className="row">
                <span className="sticker sticker-violet">{memory.type}</span>
                <span className="sticker">{memory.scope}</span>
                <span className="sticker">{memory.sensitivity}</span>
                <span className="sticker sticker-wait">confidence {memory.confidence}</span>
              </div>
              <strong>{memory.title}</strong>
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{memory.content}</p>
              <details>
                <summary className="label">Why this was proposed</summary>
                <ul>
                  {memory.provenance.map((entry) => (
                    <li key={entry.id} className="mono">
                      {entry.sourceType} ({entry.trust}) — {entry.description}
                    </li>
                  ))}
                </ul>
              </details>
              <div className="row">
                <button type="button" className="btn btn-sm btn-primary" onClick={() => void decide(memory, 'approved')}>Approve</button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => void decide(memory, 'rejected')}>Reject</button>
              </div>
            </div>
          ))
        )}
      </section>

      <div className="grid-cards">
        <section className="card stack" aria-labelledby="propose-heading">
          <h2 id="propose-heading" className="subhead">Add a memory</h2>
          <form onSubmit={handlePropose} className="stack">
            <label className="field"><span>Title</span><input className="input" name="title" required maxLength={200} /></label>
            <label className="field"><span>Content</span><textarea className="textarea" name="content" required maxLength={8000} /></label>
            <div className="row">
              <label className="field"><span>Type</span>
                <select className="select" name="type" defaultValue="preference">
                  {(['identity', 'preference', 'project', 'procedure', 'correction', 'policy', 'episode'] as const).map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label className="field"><span>Scope</span>
                <select className="select" name="scope" defaultValue="workspace">
                  {(['global', 'workspace', 'project', 'mission', 'run'] as const).map((scope) => (
                    <option key={scope} value={scope}>{scope}</option>
                  ))}
                </select>
              </label>
              <label className="field"><span>Sensitivity</span>
                <select className="select" name="sensitivity" defaultValue="private">
                  {(['public', 'private', 'sensitive'] as const).map((sensitivity) => (
                    <option key={sensitivity} value={sensitivity}>{sensitivity}</option>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Propose (goes to inbox)</button>
          </form>
        </section>

        <section className="card card-wash-cherry stack" aria-labelledby="correction-heading">
          <h2 id="correction-heading" className="subhead">Correction compiler</h2>
          <p style={{ fontSize: 14 }}>
            Turn a correction into scoped memory. Classify it; Cherry proposes the right record and it still
            needs your approval.
          </p>
          <form onSubmit={handleCorrection} className="stack">
            <label className="field"><span>What failed</span><textarea className="textarea" name="whatFailed" required style={{ minHeight: 60 }} /></label>
            <label className="field"><span>Approved fix</span><textarea className="textarea" name="approvedFix" required style={{ minHeight: 60 }} /></label>
            <label className="field"><span>Classify as</span>
              <select className="select" name="correctionClass" defaultValue="mission_rule">
                {CORRECTION_CLASSES.map((correctionClass) => (
                  <option key={correctionClass} value={correctionClass}>{CORRECTION_CLASS_TARGET[correctionClass].label}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn" style={{ alignSelf: 'flex-start' }}>Compile correction</button>
          </form>
        </section>
      </div>

      <section className="stack" aria-labelledby="vault-heading">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 id="vault-heading" className="subhead">Vault ({visible.length})</h2>
          <label className="field">
            <span className="sr-only">Filter by status</span>
            <select className="select" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}>
              <option value="all">All decided</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="superseded">Superseded</option>
              <option value="expired">Expired</option>
            </select>
          </label>
        </div>
        {visible.length === 0 ? (
          <p className="card">Nothing here yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Memory</th>
                  <th scope="col">Type / scope</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((memory) => (
                  <tr key={memory.id}>
                    <td>
                      <strong>{memory.pinned ? <span aria-label="Pinned" title="Pinned">{Icons.pin(14)} </span> : null}{memory.title}</strong>
                      <div style={{ fontSize: 13, color: 'var(--color-ink-soft)' }}>{memory.content.slice(0, 160)}</div>
                    </td>
                    <td>{memory.type} / {memory.scope}</td>
                    <td>
                      <span className={memory.status === 'approved' ? 'sticker sticker-pass' : 'sticker sticker-fail'}>{memory.status}</span>
                    </td>
                    <td>
                      <div className="row">
                        <button type="button" className="btn btn-sm" onClick={async () => { await setMemoryPinned(memory.id, !memory.pinned); await load(); }}>
                          {memory.pinned ? 'Unpin' : 'Pin'}
                        </button>
                        <button type="button" className="btn btn-sm btn-danger" onClick={async () => { await deleteMemory(memory.id); await load(); }}>
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
