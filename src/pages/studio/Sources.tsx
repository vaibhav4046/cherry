import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { createWorkspace } from '../../cherry/mission/mission-service.ts';
import { bookmarkletHref, bookmarkletOrigin, ingestDraftFromSearch } from '../../cherry/source/ingest.ts';
import { archiveSource, completeSourceFetch, createSource, failSourceFetch, interpretSourceFetchOutcome, listSources, requestSourceFetch } from '../../cherry/source/source-service.ts';
import type { SourceFetchFailure } from '../../cherry/source/source-service.ts';
import type { SourceKind, SourceRecord } from '../../cherry/source/source-model.ts';
import { pollRunnerJob, runnerStatus, submitRunnerJob } from '../../cherry/runner-client/runner-api.ts';
import { Icons } from '../../components/Icons.tsx';

type Filter = 'all' | 'needs' | 'ready' | 'archived';

const KIND_COPY: Record<SourceKind, { label: string; detail: string }> = {
  youtube: { label: 'YouTube lesson', detail: 'Official player plus a transcript you supply.' },
  article: { label: 'Article or post', detail: 'Paste the body or add a permitted text export.' },
  note: { label: 'Note', detail: 'A private note authored in Cherry.' },
  file: { label: 'Text file', detail: '.txt, .md, .json, .srt, or .vtt imported locally.' },
};

function SourceIcon({ kind, size = 22 }: { kind: SourceKind; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (kind === 'youtube') return <svg {...common} viewBox="0 0 24 24"><path fill="#ff0033" stroke="#ff0033" d="M21 8.2a2.7 2.7 0 0 0-1.9-1.9C17.4 5.8 12 5.8 12 5.8s-5.4 0-7.1.5A2.7 2.7 0 0 0 3 8.2 28 28 0 0 0 2.7 12 28 28 0 0 0 3 15.8a2.7 2.7 0 0 0 1.9 1.9c1.7.5 7.1.5 7.1.5s5.4 0 7.1-.5a2.7 2.7 0 0 0 1.9-1.9 28 28 0 0 0 .3-3.8 28 28 0 0 0-.3-3.8Z"/><path fill="#fff" stroke="none" d="m10 9 5 3-5 3V9Z"/></svg>;
  if (kind === 'article') return <svg {...common}><path d="M5 3.5h9l5 5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M14 3.5V9h5M8 13h8M8 17h6"/></svg>;
  if (kind === 'note') return <svg {...common}><path d="M5 19.5 6.2 15 16 5.2a2 2 0 0 1 2.8 2.8L9 17.8 5 19.5Z"/><path d="m14.5 6.7 2.8 2.8M5 19.5l4-1.7"/></svg>;
  return <svg {...common}><path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M14 3.5V8h4M8 12h6M8 16h6"/></svg>;
}

function statusLabel(source: SourceRecord): { text: string; className: string } {
  if (source.status === 'archived') return { text: 'Archived', className: 'sticker' };
  if (source.fetchStatus === 'queued') return { text: 'Fetch queued', className: 'sticker sticker-wait' };
  if (source.fetchStatus === 'blocked') return { text: 'Fetch blocked', className: 'sticker sticker-fail' };
  if (source.fetchStatus === 'failed') return { text: 'Fetch failed', className: 'sticker sticker-fail' };
  if (source.status === 'ready') return { text: 'Ready for skill', className: 'sticker sticker-pass' };
  return { text: source.kind === 'youtube' ? 'Needs transcript' : 'Saved', className: 'sticker sticker-wait' };
}

function domainOf(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

export default function Sources() {
  const { activeWorkspace, refresh } = useAppState();
  const location = useLocation();
  const navigate = useNavigate();
  const isIngestRoute = location.pathname === '/ingest';
  const ingestDraft = useMemo(
    () => ingestDraftFromSearch(isIngestRoute ? location.search : ''),
    [isIngestRoute, location.search],
  );
  const bookmarklet = useMemo(
    () => bookmarkletHref(bookmarkletOrigin(window.location.origin)),
    [],
  );
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState(Boolean(ingestDraft));
  const [kind, setKind] = useState<SourceKind>(ingestDraft?.kind ?? 'youtube');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runnerReady, setRunnerReady] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const permissionRef = useRef<HTMLInputElement | null>(null);
  const installBookmarklet = useCallback((node: HTMLAnchorElement | null) => {
    // React sanitizes javascript: values in JSX. Install the deterministic,
    // local-only value whenever the conditional link enters the DOM.
    if (node) node.setAttribute('href', bookmarklet);
  }, [bookmarklet]);

  async function reload(workspaceId = activeWorkspace?.id) {
    if (!workspaceId) { setSources([]); return; }
    setSources(await listSources(workspaceId, { includeArchived: true }));
  }

  useEffect(() => { void reload(); }, [activeWorkspace?.id]);
  useEffect(() => {
    if (isIngestRoute) return;
    void runnerStatus().then((status) => setRunnerReady(status.paired && status.scraplingReady === true));
  }, [isIngestRoute]);
  useEffect(() => {
    if (!ingestDraft) return;
    setKind(ingestDraft.kind);
    setOpen(true);
  }, [ingestDraft]);
  useEffect(() => {
    if (!open || !ingestDraft?.requiresPermission) return;
    const frame = window.requestAnimationFrame(() => permissionRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [ingestDraft, open]);
  const visible = useMemo(() => sources.filter((source) => {
    if (filter === 'archived') return source.status === 'archived';
    if (source.status === 'archived') return false;
    if (filter === 'needs') return source.status !== 'ready';
    if (filter === 'ready') return source.status === 'ready';
    return true;
  }), [filter, sources]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') ?? '').trim();
    const url = String(form.get('url') ?? '').trim();
    let content = String(form.get('content') ?? '');
    const file = fileRef.current?.files?.[0];
    if (file && kind === 'file') content = await file.text();
    setBusy(true); setError(null); setNotice(null);
    try {
      let workspaceId = activeWorkspace?.id;
      if (!workspaceId) {
        const workspace = await createWorkspace({ name: 'My skills' });
        if (!workspace.ok) throw new Error(workspace.error.message);
        workspaceId = workspace.value.id;
      }
      const created = await createSource({
        workspaceId, kind, title: title || (file?.name ?? KIND_COPY[kind].label),
        ...(String(form.get('creator') ?? '').trim() ? { creator: String(form.get('creator')).trim() } : {}),
        ...(url ? { url } : {}),
        ...(content.trim() ? { content, contentFormat: kind === 'file' ? (file?.name.endsWith('.srt') ? 'srt' : file?.name.endsWith('.vtt') ? 'vtt' : file?.name.endsWith('.json') ? 'json' : file?.name.endsWith('.md') ? 'markdown' : 'plain') : kind === 'article' ? 'markdown' : 'plain', fetchMethod: file ? 'upload' : 'user_paste' } : {}),
        permissionAcknowledged: form.get('permission') === 'on',
        permissionNote: String(form.get('permissionNote') ?? '').trim() || undefined,
      });
      if (!created.ok) throw new Error(created.error.message);
      setOpen(false); setNotice('Source saved locally. Review it before turning it into a skill.');
      await reload(workspaceId); await refresh();
      event.currentTarget.reset();
      setKind(ingestDraft?.kind ?? 'youtube');
    } catch (thrown) {
      const message = (thrown as Error).message;
      setError(message);
      if (message.includes('already exists')) setNotice('This source is already in your inbox.');
    } finally { setBusy(false); }
  }

  async function fetchSource(source: SourceRecord) {
    setBusy(true); setError(null); setNotice(null);
    const domain = domainOf(source.url) ?? '';
    if (domain === 'linkedin.com' || domain.endsWith('.linkedin.com')) { setError('LinkedIn fetching is disabled; paste or upload the text instead.'); setBusy(false); return; }
    if (runnerReady !== true) { setNotice('Local fetcher not connected. Start and pair the optional Scrapling worker in Connections.'); setBusy(false); return; }
    const result = await requestSourceFetch(source.id);
    if (!result.ok) setError(result.error.message);
    else {
      const persistTerminalFailure = async (failure: SourceFetchFailure) => {
        const failed = await failSourceFetch(source.id, failure);
        setNotice(null);
        setError(failed.ok || failed.error.code === 'conflict' ? failure.reason : failed.error.message);
        await reload();
      };
      const job = await submitRunnerJob({ workspaceId: source.workspaceId, missionId: source.lessonId, adapter: 'scrapling-fetch', input: { url: source.url, allowedDomains: domain ? [domain] : [], maxBytes: 262144, respectRobots: true }, idempotencyKey: `source-fetch:${source.id}:${Date.now()}` });
      if (!job.ok) await persistTerminalFailure({ status: 'failed', reason: job.error.message });
      else {
        setNotice('Fetch queued on your paired local runner. The page remains untrusted until you review it.');
        void (async () => {
          for (let attempt = 0; attempt < 60; attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 500));
            const polled = await pollRunnerJob(job.value.jobId);
            if (!polled.ok) { await persistTerminalFailure({ status: 'failed', reason: polled.error.message }); return; }
            const outcome = await interpretSourceFetchOutcome(polled.value);
            if (outcome.kind === 'pending') continue;
            if (outcome.kind === 'failure') { await persistTerminalFailure({ status: outcome.status, reason: outcome.reason }); return; }
            const completed = await completeSourceFetch(source.id, { markdown: outcome.markdown, contentHash: outcome.contentHash });
            if (!completed.ok) {
              await persistTerminalFailure({ status: 'failed', reason: completed.error.message }); return;
            }
            await reload();
            setError(null);
            setNotice('Fetched page is ready for review. Cherry has not promoted it to trusted instructions.');
            return;
          }
          const timeout = await interpretSourceFetchOutcome({ status: 'timed_out' });
          if (timeout.kind === 'failure') await persistTerminalFailure({ status: timeout.status, reason: timeout.reason });
        })();
      }
    }
    await reload(); setBusy(false);
  }

  async function archive(source: SourceRecord) {
    setBusy(true); const result = await archiveSource(source.id); if (!result.ok) setError(result.error.message); else setNotice('Source archived. It remains recoverable in the Archived filter.'); await reload(); setBusy(false);
  }

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <header className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--sp-4)' }}>
        <div className="stack" style={{ gap: 'var(--sp-2)' }}>
          <span className="label">Source inbox</span>
          <h1 className="display-sm" style={{ margin: 0 }}>Sources</h1>
          <p className="subhead" style={{ margin: 0, maxWidth: 720 }}>Save the material you want Cherry to turn into a method. Outside content stays untrusted until you review it.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => { setError(null); setNotice(null); setOpen(true); }}>Save a source</button>
      </header>

      {error ? <p className="field-error" role="alert">{error}</p> : null}
      {notice ? <p className="sticker sticker-pass" role="status">{notice}</p> : null}

      {!isIngestRoute ? (
        <section className="card stack" aria-labelledby="bookmarklet-heading">
          <div className="row" style={{ justifyContent: 'space-between', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <div className="stack" style={{ gap: 'var(--sp-2)' }}>
              <h2 id="bookmarklet-heading" className="subhead" style={{ margin: 0 }}>Save from any page</h2>
              <p style={{ margin: 0 }}>Works on any page you're viewing. Cherry only receives the address and title you send it.</p>
              <p className="label" style={{ margin: 0 }}>A browser extension is not part of this sprint.</p>
            </div>
            <a ref={installBookmarklet} className="btn" draggable>Save to Cherry</a>
          </div>
        </section>
      ) : null}

      <section className="card stack" aria-labelledby="source-controls-heading">
        <div className="row" style={{ justifyContent: 'space-between', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <h2 id="source-controls-heading" className="subhead" style={{ margin: 0 }}>Your materials</h2>
          <div className="row" role="group" aria-label="Filter sources" style={{ gap: 6, flexWrap: 'wrap' }}>
            {([['all', 'All'], ['needs', 'Needs transcript'], ['ready', 'Ready for skill'], ['archived', 'Archived']] as const).map(([value, label]) => <button key={value} type="button" className={`btn btn-sm ${filter === value ? 'btn-primary' : ''}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
          </div>
        </div>
        {visible.length === 0 ? <div className="empty-state" style={{ padding: 'var(--sp-8) var(--sp-4)' }}><SourceIcon kind="article" size={30} /><h3 className="subhead" style={{ margin: 0 }}>Nothing here yet</h3><p>Choose a source, paste what you are permitted to use, and Cherry will preserve its provenance.</p><div className="row"><button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>Save a source</button><Link to="/studio/quick" className="btn">Open Quick Skill</Link></div></div> : <div className="source-grid">{visible.map((source) => { const status = statusLabel(source); return <article key={source.id} className="card source-card" data-testid="source-card"><div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}><span className="source-kind-icon"><SourceIcon kind={source.kind} /></span><span className={status.className}>{status.text}</span></div><div className="stack" style={{ gap: 4 }}><h3 style={{ margin: 0 }}>{source.title}</h3><p className="label" style={{ margin: 0 }}>{KIND_COPY[source.kind].label}{source.creator ? ` · ${source.creator}` : ''}</p>{source.url ? <a className="link-quiet" href={source.url} target="_blank" rel="noreferrer" style={{ overflowWrap: 'anywhere' }}>{domainOf(source.url)}</a> : <span className="label">Private to this workspace</span>}</div><p className="source-card-meta">{source.contentHash ? 'Content hashed' : 'No content yet'} · updated {new Date(source.updatedAt).toLocaleDateString()}</p>{source.fetchError ? <p className="field-error" style={{ margin: 0 }}>{source.fetchError}</p> : null}<div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{source.status !== 'archived' ? <><Link className="btn btn-sm" to={`/studio/watch/${source.lessonId}`}>Open lesson</Link><button type="button" className="btn btn-sm btn-primary" onClick={() => navigate(`/studio/quick?sourceId=${encodeURIComponent(source.id)}`)}>Create skill</button>{source.url && source.kind !== 'youtube' ? <button type="button" className="btn btn-sm" disabled={busy || source.fetchStatus === 'queued'} onClick={() => void fetchSource(source)}>{source.fetchStatus === 'queued' ? 'Fetch queued' : 'Fetch selected page'}</button> : null}<button type="button" className="btn btn-sm" disabled={busy} onClick={() => void archive(source)}>Archive</button></> : <span className="label">Recoverable archive</span>}</div></article>; })}</div>}
      </section>

      <section className="card source-boundary stack" aria-labelledby="boundary-heading"><h2 id="boundary-heading" className="subhead" style={{ margin: 0 }}>A deliberate trust boundary</h2><p style={{ margin: 0 }}>Cherry never watches every video, scrapes LinkedIn, downloads YouTube captions, or runs a background crawler. A URL is metadata until you click a permitted fetch, and any fetched page still needs your review before it can become an approved skill.</p><div className="row" style={{ gap: 6, flexWrap: 'wrap' }}><Link className="btn btn-sm" to="/studio/settings/connections">Check local runner</Link><Link className="btn btn-sm" to="/studio/proof">View proof ledger</Link></div></section>

      <dialog open={open} className="sheet source-dialog" aria-labelledby="save-source-title" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
        <form key={isIngestRoute ? location.search : 'manual-source'} method="dialog" className="stack" style={{ gap: 'var(--sp-4)' }} onSubmit={(event) => void save(event)}>
          <div className="row" style={{ justifyContent: 'space-between' }}><div><span className="label">New material</span><h2 id="save-source-title" className="subhead" style={{ margin: 0 }}>Save a source</h2></div><button type="button" className="btn btn-sm" onClick={() => setOpen(false)} aria-label="Close save source dialog">{Icons.close(16)}</button></div>
          <fieldset className="source-kind-grid"><legend className="label">Choose the source type</legend>{(Object.keys(KIND_COPY) as SourceKind[]).map((candidate) => <button key={candidate} type="button" className={`source-kind-option ${kind === candidate ? 'is-selected' : ''}`} aria-pressed={kind === candidate} onClick={() => setKind(candidate)}><SourceIcon kind={candidate} size={24} /><strong>{KIND_COPY[candidate].label}</strong><span>{KIND_COPY[candidate].detail}</span></button>)}</fieldset>
          <label className="field"><span>Title</span><input name="title" className="input" required maxLength={300} defaultValue={ingestDraft?.title ?? ''} placeholder="What should your agents learn?" /></label>
          <div className="row" style={{ gap: 'var(--sp-3)' }}><label className="field" style={{ flex: 1 }}><span>Creator <small>(optional)</small></span><input name="creator" className="input" maxLength={200} placeholder="Name or publication" /></label><label className="field" style={{ flex: 1 }}><span>URL <small>(metadata only)</small></span><input name="url" className="input" type="url" maxLength={2048} defaultValue={ingestDraft?.url ?? ''} placeholder={kind === 'youtube' ? 'https://youtube.com/watch?v=…' : 'https://example.com/article'} /></label></div>
          {kind === 'file' ? <label className="field"><span>Text file</span><input ref={fileRef} name="file" type="file" accept=".txt,.md,.json,.srt,.vtt,text/plain,text/markdown,application/json" /></label> : <label className="field"><span>{kind === 'youtube' ? 'Transcript (optional)' : kind === 'note' ? 'Note' : 'Body or permitted export (optional)'}</span><textarea name="content" className="textarea" rows={6} maxLength={2 * 1024 * 1024} defaultValue={ingestDraft?.text ?? ''} placeholder={kind === 'youtube' ? 'Paste the transcript from the official player…' : 'Paste or write the material you are permitted to use…'} /></label>}
          {kind !== 'note' ? <label className="check-row"><input ref={permissionRef} type="checkbox" name="permission" required /><span>I have permission to use this material. Cherry records this acknowledgement; it does not verify ownership.</span></label> : null}
          {kind !== 'note' ? <label className="field"><span>Permission note <small>(optional)</small></span><input name="permissionNote" className="input" maxLength={1000} placeholder="e.g. my export, public license, or team permission" /></label> : null}
          <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save locally'}</button></div>
        </form>
      </dialog>
    </div>
  );
}
