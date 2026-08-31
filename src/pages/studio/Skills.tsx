import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { filterLibraryEntries, listLibraryEntries, type LibraryEntry } from '../../cherry/library/library-service.ts';
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
          Every skill Cherry has learned, across all your workspaces. Approved skills install into
          Codex (AGENTS.md), Claude Code (SKILL.md), or any agent that reads Agent Skills bundles —
          and agents visiting this site can pull them live through <code>recommend_skills</code>.
        </p>
      </header>

      {entries.length > 0 ? (
        <div className="row" role="search" style={{ gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <input
            type="search"
            className="input"
            data-testid="library-search"
            placeholder="Search skills and workspaces"
            aria-label="Search the skill library"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ minWidth: 240, flex: '1 1 240px' }}
          />
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
            No skills yet. Teach Cherry from a real source — a lesson, a transcript, an article —
            approve the compiled skill, and it lands here ready to install into every agent you use.
          </p>
          <div className="row">
            <Link to="/studio/missions/new" className="btn btn-primary">Start a mission</Link>
            <Link to="/showcase" className="btn">See the guided journey</Link>
          </div>
        </div>
      ) : null}

      {loaded && entries.length > 0 && visible.length === 0 ? (
        <div className="empty-state">
          <p className="subhead">Nothing matches that search.</p>
        </div>
      ) : null}

      <div className="grid-cards" data-testid="library-grid">
        {visible.map((entry) => (
          <Link
            key={entry.skillId}
            to={`/studio/skills/${entry.skillId}`}
            className="card stack"
            data-testid="library-card"
            style={{ textDecoration: 'none' }}
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
            <h2 className="subhead">{entry.name}</h2>
            <p style={{ margin: 0 }}>{entry.purpose.slice(0, 160)}</p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <span className="sticker sticker-blue">{entry.nodeCount} steps</span>
              <span className="sticker sticker-lavender">{entry.evaluationCount} checks</span>
              <span className="sticker" title="Workspace">{entry.workspaceName}</span>
              {entry.targets.slice(0, 3).map((target) => (
                <span key={target} className="sticker">{target}</span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
