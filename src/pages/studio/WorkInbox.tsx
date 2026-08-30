import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { attentionQueue, createWorkItem, listCrews, listWorkItems } from '../../cherry/workforce/workforce-service.ts';
import { WORK_ITEM_STATUS_LABEL } from '../../cherry/workforce/workforce-model.ts';
import type { AttentionItem, Crew, WorkItem } from '../../cherry/workforce/workforce-model.ts';

const STATUS_STICKER: Record<string, string> = {
  DRAFT: 'sticker',
  READY: 'sticker sticker-lavender',
  QUEUED: 'sticker sticker-wait',
  LEASED: 'sticker sticker-wait',
  RUNNING: 'sticker sticker-blue',
  WAITING_FOR_HUMAN: 'sticker sticker-sunburst',
  WAITING_FOR_DEPENDENCY: 'sticker sticker-wait',
  RETRYING: 'sticker sticker-wait',
  VERIFYING: 'sticker sticker-lavender',
  SUCCEEDED: 'sticker sticker-pass',
  FAILED: 'sticker sticker-fail',
  CANCELLED: 'sticker',
};

export default function WorkInbox() {
  const { activeWorkspace } = useAppState();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refreshInbox() {
    if (!activeWorkspace) return;
    const [loadedItems, loadedAttention, loadedCrews] = await Promise.all([
      listWorkItems(activeWorkspace.id),
      attentionQueue(activeWorkspace.id),
      listCrews(activeWorkspace.id),
    ]);
    setItems(loadedItems);
    setAttention(loadedAttention);
    setCrews(loadedCrews);
  }

  useEffect(() => {
    void refreshInbox();
  }, [activeWorkspace]);

  async function handleHandoff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeWorkspace) return;
    setError(null);
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const created = await createWorkItem({
      workspaceId: activeWorkspace.id,
      title: String(form.get('title') ?? ''),
      objective: String(form.get('objective') ?? ''),
      definitionOfDone: String(form.get('dod') ?? '').split('\n'),
      priority: (String(form.get('priority') ?? 'normal') as WorkItem['priority']),
      riskLevel: (String(form.get('risk') ?? 'low') as WorkItem['riskLevel']),
      crewId: String(form.get('crew') ?? '') || null,
    });
    setBusy(false);
    if (!created.ok) {
      setError(created.error.message);
      return;
    }
    (event.target as HTMLFormElement).reset?.();
    await refreshInbox();
  }

  if (!activeWorkspace) {
    return (
      <div className="stack">
        <h1 className="display-sm title-3d">Work Inbox</h1>
        <p className="subhead">Create a workspace in the Command Center first — the inbox lives inside it.</p>
        <Link to="/studio" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Open Command Center</Link>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <header className="stack" style={{ gap: 'var(--sp-2)' }}>
        <h1 className="display-sm title-3d">Work Inbox</h1>
        <p className="subhead" style={{ maxWidth: 680 }}>
          Hand work to your crew. Every item is tracked through a strict, honest workflow — nothing shows as
          running unless a host actually leased it.
        </p>
      </header>

      {error ? <p className="field-error" role="alert">{error}</p> : null}

      {attention.length > 0 ? (
        <section className="card card-wash-cherry stack" aria-labelledby="attention-heading" data-testid="attention-queue">
          <h2 id="attention-heading" className="subhead" style={{ fontSize: 20 }}>Needs you ({attention.length})</h2>
          {attention.slice(0, 6).map((entry) => (
            <div key={entry.id} className="row" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{entry.title}</span>
              <span className="sticker" style={{ padding: '2px 8px' }}>{entry.kind.replace(/_/g, ' ')}</span>
            </div>
          ))}
        </section>
      ) : null}

      <form onSubmit={handleHandoff} className="card stack" aria-labelledby="composer-heading" data-testid="work-composer">
        <h2 id="composer-heading" className="subhead" style={{ fontSize: 20 }}>What should your crew get done?</h2>
        <label className="field">
          <span>Objective title</span>
          <input className="input" name="title" required maxLength={160} placeholder="Ship the pricing page refresh" />
        </label>
        <label className="field">
          <span>Objective</span>
          <textarea className="textarea" name="objective" required style={{ minHeight: 64 }} placeholder="What outcome counts, in one or two sentences." />
        </label>
        <label className="field">
          <span>Definition of done (one item per line)</span>
          <textarea className="textarea" name="dod" required style={{ minHeight: 64 }} placeholder={'page deployed\nlighthouse >= 90'} />
        </label>
        <div className="row">
          <label className="field">
            <span>Priority</span>
            <select className="select" name="priority" defaultValue="normal">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
          <label className="field">
            <span>Risk</span>
            <select className="select" name="risk" defaultValue="low">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="field">
            <span>Crew</span>
            <select className="select" name="crew" defaultValue="">
              <option value="">Unassigned</option>
              {crews.map((crew) => (
                <option key={crew.id} value={crew.id}>{crew.name}</option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy} style={{ alignSelf: 'flex-start' }} data-testid="handoff-submit">
          {busy ? 'Handing off…' : 'Hand it off'}
        </button>
      </form>

      <section className="stack" aria-labelledby="items-heading">
        <h2 id="items-heading" className="subhead" style={{ fontSize: 20 }}>Work items ({items.length})</h2>
        {items.length === 0 ? (
          <p className="card">Nothing in flight. Hand off the first objective above.</p>
        ) : (
          <div className="event-strip">
            {items.map((item) => (
              <Link key={item.id} to={`/studio/work/${item.id}`} className="event-row" style={{ textDecoration: 'none' }} data-testid="work-item-row">
                <span className={STATUS_STICKER[item.status] ?? 'sticker'} style={{ padding: '2px 10px' }}>{WORK_ITEM_STATUS_LABEL[item.status]}</span>
                <span style={{ fontWeight: 700 }}>{item.title}</span>
                <span className="mono">{item.priority}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
