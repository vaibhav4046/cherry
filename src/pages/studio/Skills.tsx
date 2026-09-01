import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { filterLibraryEntries, listLibraryEntries, type LibraryEntry } from '../../cherry/library/library-service.ts';
import { buildConnectUrl, buildRoutineDraftUrl } from '../../cherry/library/library-links.ts';
import { StickerCluster } from '../../components/Ribbon.tsx';

export default function Skills() {
  const { activeWorkspace } = useAppState();
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'approved'>('all');

  useEffect(() => {
    (async () => {
      setEntries(await listLibraryEntries());
      setLoaded(true);
    })();
  }, [activeWorkspace]);

  const visible = useMemo(() => filterLibraryEntries(entries, { query, status }), [entries, query, status]);
  const installReadyCount = useMemo(() => entries.filter((entry) => entry.installReady).length, [entries]);

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <header className="stack" style={{ gap: 'var(--sp-2)' }}>
        <h1 className="display-sm">Skill Library</h1>
        <p className="subhead" style={{ margin: 0 }}>
          Find every skill you have approved. Download one for Codex or Claude Code, use it in a
          routine, or send it to a connected agent.
        </p>
      </header>

      {entries.length > 0 ? (
        <div className="row" role="search" style={{ gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <label className="field" style={{ minWidth: 240, flex: '1 1 240px' }}>
            <span>Search skills</span>
            <input
              type="search"
              className="input"
              data-testid="library-search"
              placeholder="Name or purpose"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="row" role="group" aria-label="Filter by status" style={{ gap: 'var(--sp-2)' }}>
            <button
              type="button"
              className={status === 'all' ? 'btn btn-primary' : 'btn'}
              aria-pressed={status === 'all'}
              onClick={() => setStatus('all')}
            >
              All ({entries.length})
            </button>
            <button
              type="button"
              className={status === 'approved' ? 'btn btn-primary' : 'btn'}
              data-testid="library-filter-approved"
              aria-pressed={status === 'approved'}
              onClick={() => setStatus('approved')}
            >
              Install-ready ({installReadyCount})
            </button>
          </div>
        </div>
      ) : null}

      {loaded && entries.length === 0 ? (
        <div className="empty-state">
          <StickerCluster />
          <p className="subhead" style={{ maxWidth: 520 }}>
            Nothing saved yet. Add a source and approve its method to create your first skill.
          </p>
          <Link to="/studio/quick" className="btn btn-primary">Create a skill</Link>
        </div>
      ) : null}

      {loaded && entries.length > 0 && visible.length === 0 ? (
        <div className="empty-state">
          <p className="subhead">Nothing matches that search.</p>
          <button type="button" className="btn" onClick={() => { setQuery(''); setStatus('all'); }}>Clear search</button>
        </div>
      ) : null}

      <div className="grid-cards" data-testid="library-grid">
        {visible.map((entry) => (
          <article
            key={entry.skillId}
            className="card stack"
            data-testid="library-card"
          >
            <div className="row">
              <span className={entry.installReady ? 'sticker sticker-pass' : entry.status === 'rejected' ? 'sticker sticker-fail' : 'sticker sticker-wait'}>
                {entry.installReady ? 'install-ready' : entry.status}
              </span>
              <span className="sticker">v{entry.version} · r{entry.revision}</span>
              {entry.approvalHash ? (
                <span className="sticker mono" title={`Approval content hash ${entry.approvalHash}`}>
                  {entry.approvalHash.slice(0, 8)}
                </span>
              ) : null}
            </div>
            <h2 className="subhead">
              <Link to={`/studio/skills/${entry.skillId}`} className="link-quiet" data-testid="library-card-open">{entry.name}</Link>
            </h2>
            <p style={{ margin: 0 }}>{entry.purpose.slice(0, 160)}</p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <span className="sticker sticker-blue">{entry.nodeCount} steps</span>
              <span className="sticker sticker-lavender">{entry.evaluationCount} checks</span>
              <span className="sticker" title="Saved in">{entry.workspaceName}</span>
              {entry.targets.slice(0, 3).map((target) => (
                <span key={target} className="sticker">{target}</span>
              ))}
            </div>
            {entry.installReady ? (
              <div className="row" style={{ gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                <Link className="btn btn-sm" to={buildRoutineDraftUrl(entry.workspaceId, entry.skillId)}>Use in routine</Link>
                <a className="btn btn-sm" href={buildConnectUrl(entry.targets)}>Send to agent</a>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
