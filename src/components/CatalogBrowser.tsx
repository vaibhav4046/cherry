import { useEffect, useMemo, useState } from 'react';
import { useAppState } from '../app/AppState.tsx';
import {
  loadCatalogIndex,
  loadCatalogManifest,
  rankCatalog,
  type CatalogIndexEntry,
  type CatalogManifest,
} from '../cherry/library/skill-catalog.ts';
import { installCatalogSkill } from '../cherry/library/catalog-install.ts';

/**
 * The human-facing view of the preloaded catalog.
 *
 * The catalog was reachable only through agent tool calls, which meant the
 * shelf a person is told about was invisible to the person. This renders the
 * same index the tools rank, with the same honesty: every row names its
 * upstream repo and license, nothing here is installed or approved, and
 * installing produces a draft the human still has to approve.
 */
export function CatalogBrowser({ onInstalled }: { onInstalled?: () => void }) {
  const { activeWorkspace } = useAppState();
  const [index, setIndex] = useState<CatalogIndexEntry[]>([]);
  const [manifest, setManifest] = useState<CatalogManifest | null>(null);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [entries, meta] = await Promise.all([loadCatalogIndex(), loadCatalogManifest()]);
      if (cancelled) return;
      setIndex(entries);
      setManifest(meta);
    })();
    return () => { cancelled = true; };
  }, []);

  // An empty query shows a stable sample rather than nothing, so the shelf is
  // visibly a shelf before anyone types.
  const results = useMemo(
    () => (query.trim().length > 1 ? rankCatalog(index, query, 12) : index.slice(0, 8).map((entry) => ({ ...entry, score: 0, matchedOn: [] }))),
    [index, query],
  );

  if (index.length === 0) return null;

  async function install(entry: CatalogIndexEntry) {
    if (!activeWorkspace) {
      setFailed(true);
      // "space", not "workspace": the studio's plain-language vocabulary, which
      // e2e/cherry/plain-language.spec.ts pins for every other surface.
      setMessage('Open or create a space first — an imported draft has to live somewhere.');
      return;
    }
    setBusyId(entry.id);
    setMessage(null);
    setFailed(false);
    const result = await installCatalogSkill(activeWorkspace.id, entry.id, { actorType: 'human' });
    setBusyId(null);
    if (!result.ok) {
      setFailed(true);
      setMessage(`Could not import ${entry.name}: ${result.error.message}`);
      return;
    }
    setFailed(false);
    setMessage(
      `Imported ${result.value.source.name} from ${result.value.source.repo} as a draft with ${result.value.graph.nodes.length} step(s). Nobody has approved it yet — review it before use.`,
    );
    onInstalled?.();
  }

  return (
    <section className="stack" style={{ gap: 'var(--sp-3)' }} aria-labelledby="catalog-heading" data-testid="catalog-browser">
      <div className="stack" style={{ gap: 'var(--sp-1)' }}>
        <h2 id="catalog-heading" style={{ margin: 0 }}>Skill catalog</h2>
        <p className="subhead" style={{ margin: 0, maxWidth: 620 }}>
          {manifest ? `${manifest.totalSkills.toLocaleString()} published Agent Skills` : `${index.length} published Agent Skills`}
          {manifest ? ` from ${manifest.collections.length} open-source collections` : ''}, preloaded for reference.
          These are other people&rsquo;s skills under their own licenses — not installed, not approved, and not
          Cherry&rsquo;s work. Importing one derives a draft that cites the original file.
        </p>
      </div>

      <label className="field" style={{ minWidth: 240 }}>
        <span>Search the catalog</span>
        <input
          type="search"
          className="input"
          data-testid="catalog-search"
          placeholder="e.g. phishing headers, kubernetes, screen reader"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {message ? (
        <p className={failed ? 'sticker sticker-fail' : 'sticker sticker-pass'} role="status" data-testid="catalog-message">
          {message}
        </p>
      ) : null}

      {results.length === 0 ? (
        <p className="subhead" style={{ margin: 0 }} data-testid="catalog-empty">
          Nothing in the catalog matches those words. That is a real miss, not a loading state.
        </p>
      ) : (
        <ul className="stack" style={{ gap: 'var(--sp-2)', listStyle: 'none', padding: 0, margin: 0 }} data-testid="catalog-results">
          {results.map((entry) => (
            <li key={entry.id} className="card" style={{ padding: 'var(--sp-3)' }}>
              <div className="row" style={{ gap: 'var(--sp-3)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div className="stack" style={{ gap: 4, flex: '1 1 320px', minWidth: 0 }}>
                  <strong>{entry.name}</strong>
                  <span className="subhead" style={{ margin: 0 }}>{entry.description}</span>
                  <span className="meta">{entry.collection}</span>
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={busyId !== null}
                  onClick={() => void install(entry)}
                  data-testid={`catalog-install-${entry.id}`}
                >
                  {busyId === entry.id ? 'Importing…' : 'Import as draft'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
