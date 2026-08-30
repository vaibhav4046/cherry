import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { addWorkMessage, getWorkItem, listWorkMessages, transitionWorkItem } from '../../cherry/workforce/workforce-service.ts';
import { WORK_ITEM_TRANSITIONS, type WorkItem, type WorkItemStatus, type WorkMessage } from '../../cherry/workforce/workforce-model.ts';

/** Human-facing controls: label per target state, offered only when legal. */
const HUMAN_ACTIONS: Array<{ to: WorkItemStatus; label: string; danger?: boolean }> = [
  { to: 'READY', label: 'Mark ready' },
  { to: 'QUEUED', label: 'Queue it' },
  { to: 'CANCELLED', label: 'Cancel', danger: true },
];

export default function WorkThread() {
  const { workItemId } = useParams<{ workItemId: string }>();
  const { activeWorkspace } = useAppState();
  const [item, setItem] = useState<WorkItem | null>(null);
  const [messages, setMessages] = useState<WorkMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refreshThread() {
    if (!activeWorkspace || !workItemId) return;
    setItem(await getWorkItem(activeWorkspace.id, workItemId));
    setMessages(await listWorkMessages(activeWorkspace.id, workItemId));
  }

  useEffect(() => {
    void refreshThread();
  }, [activeWorkspace, workItemId]);

  async function handleTransition(to: WorkItemStatus) {
    if (!activeWorkspace || !item) return;
    setError(null);
    const moved = await transitionWorkItem(activeWorkspace.id, item.id, to, { expectedRevision: item.revision });
    if (!moved.ok) setError(moved.error.message);
    await refreshThread();
  }

  async function handleMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeWorkspace || !item) return;
    setError(null);
    const form = new FormData(event.currentTarget);
    const added = await addWorkMessage(activeWorkspace.id, item.id, {
      actorType: 'human',
      kind: 'message',
      body: String(form.get('body') ?? ''),
    });
    if (!added.ok) setError(added.error.message);
    (event.target as HTMLFormElement).reset();
    await refreshThread();
  }

  if (!activeWorkspace || !item) {
    return (
      <div className="stack">
        <h1 className="display-sm title-3d">Work Thread</h1>
        <p className="subhead">{activeWorkspace ? 'Work item not found in this workspace.' : 'Create a workspace first.'}</p>
        <Link to="/studio/inbox" className="btn" style={{ alignSelf: 'flex-start' }}>Back to the inbox</Link>
      </div>
    );
  }

  const legal = new Set(WORK_ITEM_TRANSITIONS[item.status]);
  const actions = HUMAN_ACTIONS.filter((action) => legal.has(action.to));

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <header className="stack" style={{ gap: 'var(--sp-2)' }}>
        <Link to="/studio/inbox" className="label" style={{ textDecoration: 'none' }}>← Work Inbox</Link>
        <h1 className="display-sm title-3d">{item.title}</h1>
        <div className="row">
          <span className="sticker sticker-cherry" data-testid="work-status">{item.status.replace(/_/g, ' ')}</span>
          <span className="sticker">{item.priority}</span>
          <span className="sticker">risk {item.riskLevel}</span>
          <span className="sticker">r{item.revision}</span>
        </div>
        <p className="subhead" style={{ maxWidth: 680, fontSize: 18 }}>{item.objective}</p>
      </header>

      {error ? <p className="field-error" role="alert">{error}</p> : null}

      <section className="card stack" aria-labelledby="dod-heading">
        <h2 id="dod-heading" className="subhead" style={{ fontSize: 18 }}>Definition of done</h2>
        <ul style={{ margin: 0, paddingLeft: 'var(--sp-5)' }}>
          {item.definitionOfDone.map((line, index) => (
            <li key={index} style={{ fontSize: 13 }}>{line}</li>
          ))}
        </ul>
      </section>

      {actions.length > 0 ? (
        <div className="row" data-testid="work-actions">
          {actions.map((action) => (
            <button
              key={action.to}
              type="button"
              className={action.danger ? 'btn btn-danger' : 'btn btn-primary'}
              onClick={() => void handleTransition(action.to)}
            >
              {action.label}
            </button>
          ))}
          <span className="label">
            Only legal moves are offered — running states belong to a real execution host.
          </span>
        </div>
      ) : (
        <p className="label">This item is {item.status === 'SUCCEEDED' ? 'done' : 'terminal'} — no further human moves.</p>
      )}

      <section className="stack" aria-labelledby="thread-heading">
        <h2 id="thread-heading" className="subhead" style={{ fontSize: 18 }}>Thread</h2>
        {messages.length === 0 ? <p className="card">No messages yet.</p> : (
          <div className="event-strip" data-testid="work-messages">
            {messages.map((message) => (
              <div key={message.id} className="event-row">
                <span className="mono">{message.createdAt.slice(11, 19)}</span>
                <span className="sticker" style={{ padding: '2px 8px' }}>{message.actorType} · {message.kind}</span>
                <span>{message.body}</span>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={handleMessage} className="row">
          <input className="input" name="body" required placeholder="Add a note, question, or decision…" style={{ flex: 1 }} />
          <button type="submit" className="btn btn-primary">Post</button>
        </form>
      </section>
    </div>
  );
}
