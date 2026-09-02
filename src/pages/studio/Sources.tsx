import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { createWorkspace } from '../../cherry/mission/mission-service.ts';
import { bookmarkletHref, bookmarkletOrigin, ingestDraftFromSearch } from '../../cherry/source/ingest.ts';
import {
  MAX_WATCH_HISTORY_FILE_BYTES,
  parsePastedYouTubeUrls,
  parseTakeoutWatchHistory,
  rankWatchHistoryCandidates,
  type WatchHistoryCandidate,
  type WatchHistoryParse,
} from '../../cherry/source/watch-history.ts';
import {
  createChannelWatch,
  disableChannelWatch,
  listChannelWatches,
  reconcileChannelWatchRunnerOutcome,
} from '../../cherry/source/channel-watch-service.ts';
import type { ChannelWatch, ChannelWatchRunnerOutcome } from '../../cherry/source/channel-watch-model.ts';
import { archiveSource, completeSourceFetch, createSource, failSourceFetch, interpretSourceFetchOutcome, listSources, requestSourceFetch } from '../../cherry/source/source-service.ts';
import type { SourceFetchFailure } from '../../cherry/source/source-service.ts';
import type { SourceContentFormat, SourceKind, SourceRecord } from '../../cherry/source/source-model.ts';
import { fetchYouTubeTitle } from '../../cherry/source/youtube-metadata.ts';
import { decodeLocalTextBytes, inspectLocalTextContent, inspectLocalTextFile } from '../../cherry/source/local-text-file.ts';
import {
  checkRunnerChannelWatch,
  listRunnerChannelWatchJobs,
  pollRunnerJob,
  pollRunnerV2Job,
  registerRunnerChannelWatch,
  runnerStatus,
  submitRunnerJob,
  unregisterRunnerChannelWatch,
  type RunnerStatus,
  type RunnerV2Job,
} from '../../cherry/runner-client/runner-api.ts';
import { Icons } from '../../components/Icons.tsx';
import { SourceMaterialChoices } from './SourceMaterialChoices.tsx';
import { AddToCherry, isAddToCherryPath, type AddToCherryPath } from './AddToCherry.tsx';

type Filter = 'all' | 'needs' | 'ready' | 'archived';

function plainSourceError(message: string): string {
  return message
    .replace(/YouTube history provenance/gi, 'This YouTube history record')
    .replace(/\btranscriptless\b/gi, 'without a transcript')
    .replace(/\bYouTube lesson\b/gi, 'YouTube video')
    .replace(/\bworkspaces?\b/gi, (word) => (word.toLowerCase() === 'workspace' ? 'space' : 'spaces'))
    .replace(/\blessons?\b/gi, (word) => (word.toLowerCase() === 'lesson' ? 'source' : 'sources'));
}

const KIND_COPY: Record<SourceKind, { label: string; detail: string }> = {
  youtube: { label: 'YouTube video', detail: 'Official player plus a transcript you supply.' },
  article: { label: 'Article or post', detail: 'Paste the body or add a permitted text export.' },
  note: { label: 'Note', detail: 'A private note authored in Cherry.' },
  file: { label: 'Text file', detail: '.txt, .md, .srt, or .vtt imported locally.' },
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

function watchCheckLabel(watch: ChannelWatch): string {
  if (!watch.lastCheckedAt) return 'Never checked';
  return `Last checked ${new Date(watch.lastCheckedAt).toLocaleString()}`;
}

function watchRegistrationKey(watch: ChannelWatch): string {
  return `${watch.id}:${watch.revision}:${watch.actionHash}`;
}

function jobMatchesWatch(job: RunnerV2Job, watch: ChannelWatch): boolean {
  if (job.envelope?.workspaceId !== watch.workspaceId
    || job.envelope.workItemId !== `rss-watch:${watch.sourceId}`
    || job.envelope.workItemRevision !== watch.revision
    || job.envelope.adapter !== 'youtube-rss-watch') return false;
  try {
    const payload = JSON.parse(job.envelope.boundedPrompt ?? '') as Record<string, unknown>;
    return payload['workspaceId'] === watch.workspaceId
      && payload['sourceId'] === watch.sourceId
      && payload['channelId'] === watch.channelId
      && payload['actionHash'] === watch.actionHash;
  } catch {
    return false;
  }
}

function runnerOutcome(watch: ChannelWatch, job: RunnerV2Job): ChannelWatchRunnerOutcome | null {
  if (!jobMatchesWatch(job, watch)) return null;
  if (job.status === 'completed') {
    try {
      const payload = JSON.parse(job.result?.stdout ?? '');
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid result');
      return { ...(payload as Omit<ChannelWatchRunnerOutcome, 'status' | 'jobId'>), status: 'completed', jobId: job.id } as ChannelWatchRunnerOutcome;
    } catch {
      return {
        schemaVersion: 1,
        status: 'failed',
        jobId: job.id,
        watchId: watch.id,
        actionHash: watch.actionHash,
        channelId: watch.channelId,
        error: 'The local runner returned an unreadable channel result.',
      };
    }
  }
  if (job.status === 'failed' || job.status === 'cancelled') {
    return {
      schemaVersion: 1,
      status: 'failed',
      jobId: job.id,
      watchId: watch.id,
      actionHash: watch.actionHash,
      channelId: watch.channelId,
      error: 'The channel check failed and nothing was saved.',
    };
  }
  return null;
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
  const addIntent = useMemo<AddToCherryPath | null>(() => {
    if (isIngestRoute) return null;
    const value = new URLSearchParams(location.search).get('add');
    return isAddToCherryPath(value) ? value : null;
  }, [isIngestRoute, location.search]);
  const bookmarklet = useMemo(
    () => bookmarkletHref(bookmarkletOrigin(window.location.origin)),
    [],
  );
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [channelWatches, setChannelWatches] = useState<ChannelWatch[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState(Boolean(ingestDraft));
  const [kind, setKind] = useState<SourceKind>(ingestDraft?.kind ?? 'youtube');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [metadataBusy, setMetadataBusy] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataNotice, setMetadataNotice] = useState<string | null>(null);
  const [runner, setRunner] = useState<RunnerStatus | null>(null);
  const [watchSource, setWatchSource] = useState<SourceRecord | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [watchBusyId, setWatchBusyId] = useState<string | null>(null);
  const [registeredWatchKeys, setRegisteredWatchKeys] = useState<Set<string>>(() => new Set());
  const [watchFocusSourceId, setWatchFocusSourceId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCandidates, setHistoryCandidates] = useState<WatchHistoryCandidate[]>([]);
  const [historySummary, setHistorySummary] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyPermission, setHistoryPermission] = useState(false);
  const [savingCandidateId, setSavingCandidateId] = useState<string | null>(null);
  const [addContext, setAddContext] = useState<'channel' | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const sourceDialogRef = useRef<HTMLDialogElement | null>(null);
  const sourceReturnFocusRef = useRef<HTMLElement | null>(null);
  const saveErrorRef = useRef<HTMLParagraphElement | null>(null);
  const metadataRequestIdRef = useRef(0);
  const lastAutoFileNameRef = useRef<string | null>(null);
  const historyDialogRef = useRef<HTMLDialogElement | null>(null);
  const watchDialogRef = useRef<HTMLDialogElement | null>(null);
  const watchChannelIdRef = useRef<HTMLInputElement | null>(null);
  const watchReturnFocusRef = useRef<HTMLElement | null>(null);
  const watchErrorRef = useRef<HTMLParagraphElement | null>(null);
  const watchStateRefs = useRef(new Map<string, HTMLDivElement>());
  const historyFileRef = useRef<HTMLInputElement | null>(null);
  const historyPasteFormRef = useRef<HTMLFormElement | null>(null);
  const historyTriggerRef = useRef<HTMLButtonElement | null>(null);
  const historyReturnFocusRef = useRef<HTMLElement | null>(null);
  const permissionRef = useRef<HTMLInputElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const urlRef = useRef<HTMLInputElement | null>(null);
  const installBookmarklet = useCallback((node: HTMLAnchorElement | null) => {
    // React sanitizes javascript: values in JSX. Install the deterministic,
    // local-only value whenever the conditional link enters the DOM.
    if (node) node.setAttribute('href', bookmarklet);
  }, [bookmarklet]);

  async function reload(workspaceId = activeWorkspace?.id) {
    if (!workspaceId) { setSources([]); setChannelWatches([]); return; }
    const [nextSources, nextWatches] = await Promise.all([
      listSources(workspaceId, { includeArchived: true }),
      listChannelWatches(workspaceId),
    ]);
    setSources(nextSources);
    setChannelWatches(nextWatches);
  }

  useEffect(() => { void reload(); }, [activeWorkspace?.id]);
  useEffect(() => {
    if (isIngestRoute) return;
    void runnerStatus().then(setRunner);
  }, [isIngestRoute]);
  useEffect(() => {
    if (!ingestDraft) return;
    metadataRequestIdRef.current += 1;
    setMetadataBusy(false);
    setMetadataError(null);
    setMetadataNotice(null);
    setKind(ingestDraft.kind);
    setOpen(true);
  }, [ingestDraft]);
  useEffect(() => {
    if (!addIntent) return;
    const trigger = document.querySelector<HTMLElement>('[data-add-to-cherry-trigger]');
    setError(null);
    setNotice(null);
    setMetadataError(null);
    setMetadataNotice(null);

    if (addIntent === 'history') {
      historyReturnFocusRef.current = trigger;
      setHistoryCandidates([]);
      setHistorySummary(null);
      setHistoryError(null);
      setHistoryPermission(false);
      setSavingCandidateId(null);
      setOpen(false);
      setHistoryOpen(true);
    } else if (addIntent === 'bookmarklet') {
      window.requestAnimationFrame(() => {
        const target = document.getElementById('save-from-any-tab');
        target?.scrollIntoView({ block: 'start' });
        target?.focus();
      });
    } else {
      const kindForIntent: SourceKind = addIntent === 'article' ? 'article' : addIntent === 'text' ? 'note' : addIntent === 'file' ? 'file' : 'youtube';
      sourceReturnFocusRef.current = trigger;
      setKind(kindForIntent);
      setAddContext(addIntent === 'channel' ? 'channel' : null);
      setOpen(true);
    }

    navigate('/studio/sources', { replace: true });
  }, [addIntent, navigate]);
  useEffect(() => () => { metadataRequestIdRef.current += 1; }, []);
  useEffect(() => {
    const dialog = sourceDialogRef.current;
    if (!dialog) return;
    let frame: number | null = null;
    if (open) {
      if (!dialog.open) dialog.showModal();
      frame = window.requestAnimationFrame(() => {
        if (ingestDraft?.requiresPermission) permissionRef.current?.focus();
        else if (kind === 'file') fileRef.current?.focus();
        else titleRef.current?.focus();
      });
    } else if (dialog.open) {
      dialog.close();
    }
    return () => { if (frame !== null) window.cancelAnimationFrame(frame); };
  }, [ingestDraft?.requiresPermission, kind, open]);
  useEffect(() => {
    const dialog = historyDialogRef.current;
    if (!dialog) return;
    let frame: number | null = null;
    if (historyOpen) {
      if (!dialog.open) dialog.showModal();
      frame = window.requestAnimationFrame(() => historyFileRef.current?.focus());
    } else if (dialog.open) {
      dialog.close();
    }
    return () => { if (frame !== null) window.cancelAnimationFrame(frame); };
  }, [historyOpen]);
  useEffect(() => {
    const dialog = watchDialogRef.current;
    if (!dialog) return;
    let frame: number | null = null;
    if (watchSource) {
      if (!dialog.open) dialog.showModal();
      frame = window.requestAnimationFrame(() => watchChannelIdRef.current?.focus());
    } else if (dialog.open) {
      dialog.close();
    }
    return () => { if (frame !== null) window.cancelAnimationFrame(frame); };
  }, [watchSource]);
  useEffect(() => {
    if (!watchFocusSourceId) return;
    const target = watchStateRefs.current.get(watchFocusSourceId);
    if (!target) return;
    target.focus();
    setWatchFocusSourceId(null);
  }, [channelWatches, watchFocusSourceId]);
  const runnerReady = runner?.paired === true && runner.scraplingReady === true;
  const channelRunnerReady = runner?.paired === true && runner.v2Adapters?.includes('youtube-rss-watch') === true;
  const watchBySourceId = useMemo(
    () => new Map(channelWatches.map((watch) => [watch.sourceId, watch])),
    [channelWatches],
  );
  const watchByChannelId = useMemo(
    () => new Map(channelWatches.map((watch) => [watch.channelId, watch])),
    [channelWatches],
  );
  useEffect(() => {
    const workspaceId = activeWorkspace?.id;
    if (!workspaceId || !channelRunnerReady || isIngestRoute) return;
    let cancelled = false;
    const sync = () => { if (!cancelled) void syncChannelWatches(workspaceId); };
    sync();
    const timer = window.setInterval(sync, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [activeWorkspace?.id, channelRunnerReady, isIngestRoute]);
  const visible = useMemo(() => sources.filter((source) => {
    if (filter === 'archived') return source.status === 'archived';
    if (source.status === 'archived') return false;
    if (filter === 'needs') return source.status !== 'ready';
    if (filter === 'ready') return source.status === 'ready';
    return true;
  }), [filter, sources]);

  async function workspaceIdForSave(): Promise<string> {
    if (activeWorkspace?.id) return activeWorkspace.id;
    const workspace = await createWorkspace({ name: 'My skills' });
    if (!workspace.ok) throw new Error(workspace.error.message);
    return workspace.value.id;
  }

  function clearHistoryImport() {
    setHistoryCandidates([]);
    setHistorySummary(null);
    setHistoryError(null);
    setHistoryPermission(false);
    setSavingCandidateId(null);
    if (historyFileRef.current) historyFileRef.current.value = '';
    historyPasteFormRef.current?.reset();
  }

  function invalidateMetadataLookup() {
    metadataRequestIdRef.current += 1;
    setMetadataBusy(false);
    setMetadataError(null);
    setMetadataNotice(null);
  }

  function closeSourceDialog() {
    invalidateMetadataLookup();
    setError(null);
    setOpen(false);
    setAddContext(null);
    const returnTarget = sourceReturnFocusRef.current;
    sourceReturnFocusRef.current = null;
    if (returnTarget?.isConnected) window.requestAnimationFrame(() => returnTarget.focus());
  }

  function selectSourceKind(nextKind: SourceKind) {
    invalidateMetadataLookup();
    setKind(nextKind);
    if (nextKind !== 'youtube') setAddContext(null);
  }

  function selectLocalFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (titleRef.current) {
      const currentTitle = titleRef.current.value.trim();
      if (!currentTitle || currentTitle === lastAutoFileNameRef.current) titleRef.current.value = file.name;
    }
    lastAutoFileNameRef.current = file.name;
    setError(null);
  }

  function closeHistoryImport() {
    setHistoryOpen(false);
    clearHistoryImport();
    const returnTarget = historyReturnFocusRef.current ?? historyTriggerRef.current;
    historyReturnFocusRef.current = null;
    window.requestAnimationFrame(() => returnTarget?.focus());
  }

  function closeWatchDialog(restoreFocus = true) {
    setWatchSource(null);
    setWatchError(null);
    const returnTarget = watchReturnFocusRef.current;
    watchReturnFocusRef.current = null;
    if (restoreFocus && returnTarget?.isConnected) window.requestAnimationFrame(() => returnTarget.focus());
  }

  async function registerWatch(watch: ChannelWatch, reportError = true): Promise<boolean> {
    const registered = await registerRunnerChannelWatch({
      channelId: watch.channelId,
      revision: watch.revision,
      schedule: watch.schedule,
      sourceId: watch.sourceId,
      workspaceId: watch.workspaceId,
      actionHash: watch.actionHash,
    });
    if (!registered.ok) {
      setRegisteredWatchKeys((current) => {
        const next = new Set(current);
        next.delete(watchRegistrationKey(watch));
        return next;
      });
      if (reportError) setError('The runner did not confirm this daily check. Check the runner, then try again.');
      return false;
    }
    setRegisteredWatchKeys((current) => new Set(current).add(watchRegistrationKey(watch)));
    return true;
  }

  async function saveChannelWatch(source: SourceRecord, channelId?: string) {
    if (!channelRunnerReady) {
      setWatchError(runner?.paired
        ? 'This runner cannot check channels yet. Update the local runner and try again.'
        : 'pair the local runner to check channels');
      return;
    }
    setWatchBusyId(source.id); setWatchError(null); setError(null); setNotice(null);
    const created = await createChannelWatch({ sourceId: source.id, ...(channelId ? { channelId } : {}) });
    if (!created.ok) {
      const message = plainSourceError(created.error.message);
      if (watchSource) {
        setWatchError(message);
        window.requestAnimationFrame(() => watchErrorRef.current?.focus());
      } else setError(message);
      setWatchBusyId(null);
      return;
    }
    closeWatchDialog(false);
    await reload();
    const registered = await registerWatch(created.value);
    if (registered) setNotice('Watching from now. No older videos were added. The local runner will check daily.');
    setWatchFocusSourceId(source.id);
    setWatchBusyId(null);
  }

  async function beginChannelWatch(source: SourceRecord, trigger: HTMLElement) {
    watchReturnFocusRef.current = trigger;
    setWatchError(null);
    setWatchSource(source);
  }

  async function submitChannelWatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!watchSource) return;
    const channelId = String(new FormData(event.currentTarget).get('channelId') ?? '').trim();
    await saveChannelWatch(watchSource, channelId);
  }

  async function reconcileWatchJobs(watch: ChannelWatch): Promise<number> {
    const jobs = await listRunnerChannelWatchJobs(watch);
    if (!jobs.ok) return 0;
    let createdCount = 0;
    const ordered = [...jobs.value].sort((left, right) => (left.createdAt ?? left.id).localeCompare(right.createdAt ?? right.id));
    for (const job of ordered) {
      const outcome = runnerOutcome(watch, job);
      if (!outcome) continue;
      const reconciled = await reconcileChannelWatchRunnerOutcome(watch.id, outcome);
      if (!reconciled.ok) continue;
      createdCount += reconciled.value.createdSources.length;
    }
    return createdCount;
  }

  async function syncChannelWatches(workspaceId: string) {
    if (!channelRunnerReady) return;
    const watches = (await listChannelWatches(workspaceId)).filter((watch) => watch.enabled);
    let createdCount = 0;
    for (const watch of watches) {
      if (!await registerWatch(watch, false)) continue;
      createdCount += await reconcileWatchJobs(watch);
    }
    if (createdCount > 0) setNotice(`${createdCount} new ${createdCount === 1 ? 'source was' : 'sources were'} saved from channel watches.`);
    if (watches.length > 0) await reload(workspaceId);
  }

  async function checkChannelNow(watch: ChannelWatch) {
    setError(null); setNotice(null);
    if (!runner?.paired) { setNotice('pair the local runner to check channels'); return; }
    if (!channelRunnerReady) { setError('This runner cannot check channels yet. Update the local runner and try again.'); return; }
    setWatchBusyId(watch.id);
    if (!await registerWatch(watch)) { setWatchBusyId(null); return; }
    const queued = await checkRunnerChannelWatch(watch);
    if (!queued.ok) {
      setError('The channel check was not queued. Check the runner, then try again.');
      setWatchBusyId(null);
      return;
    }
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      const polled = await pollRunnerV2Job(queued.value.jobId);
      if (!polled.ok) {
        setError('The channel check could not be read. Check the runner, then try again.');
        setWatchBusyId(null);
        return;
      }
      const outcome = runnerOutcome(watch, polled.value);
      if (!outcome) continue;
      const reconciled = await reconcileChannelWatchRunnerOutcome(watch.id, outcome);
      if (!reconciled.ok) {
        setError('The channel result did not match this watch, so nothing was saved. Try again.');
      } else if (outcome.status === 'failed') {
        setError('The channel check failed and nothing was saved. Check the runner, then try again.');
      } else {
        const count = reconciled.value.createdSources.length;
        setNotice(count > 0 ? `${count} new ${count === 1 ? 'source' : 'sources'} saved.` : 'Channel checked. No new videos.');
      }
      await reload();
      setWatchBusyId(null);
      return;
    }
    setNotice('The check is still running on your computer. Cherry will sync it when it finishes.');
    setWatchBusyId(null);
  }

  async function connectChannelWatch(watch: ChannelWatch) {
    setWatchBusyId(watch.id); setError(null); setNotice(null);
    const registered = await registerWatch(watch);
    if (registered) setNotice('Daily channel check connected to this exact watch.');
    setWatchBusyId(null);
  }

  async function stopChannelWatch(watch: ChannelWatch): Promise<boolean> {
    if (!runner?.paired) { setError('Pair the local runner to stop this channel watch.'); return false; }
    if (!channelRunnerReady) { setError('This runner cannot stop the daily check yet. Update the local runner and try again.'); return false; }
    setWatchBusyId(watch.id); setError(null); setNotice(null);
    const removed = await unregisterRunnerChannelWatch(watch);
    if (!removed.ok && removed.error.code !== 'not_found') {
      setError('Watching was not stopped. Check the runner, then try again.');
      setWatchBusyId(null);
      return false;
    }
    if (removed.ok && !removed.value.removed) {
      setError('The runner did not confirm that watching stopped. Check the runner, then try again.');
      setWatchBusyId(null);
      return false;
    }
    const disabled = await disableChannelWatch(watch.id, 'human', watch);
    if (!disabled.ok) {
      setError(plainSourceError(disabled.error.message));
      setWatchBusyId(null);
      return false;
    }
    setRegisteredWatchKeys((current) => {
      const next = new Set(current);
      next.delete(watchRegistrationKey(watch));
      return next;
    });
    await reload();
    setNotice('Channel watch stopped. Saved sources remain available.');
    setWatchBusyId(null);
    return true;
  }

  function showHistoryCandidates(parsed: WatchHistoryParse) {
    const candidates = rankWatchHistoryCandidates(parsed.entries);
    setHistoryCandidates(candidates);
    setHistorySummary(`${parsed.entries.length} usable ${parsed.entries.length === 1 ? 'entry' : 'entries'} · ${parsed.skippedRows}${parsed.truncated ? '+' : ''} skipped`);
    setHistoryPermission(false);
    setHistoryError(candidates.length ? null : 'No usable YouTube entries were found. Choose a valid Takeout JSON file or paste official YouTube links.');
  }

  async function readHistoryFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    setHistoryCandidates([]); setHistorySummary(null); setHistoryPermission(false); setHistoryError(null);
    historyPasteFormRef.current?.reset();
    if (!file) return;
    if (file.size > MAX_WATCH_HISTORY_FILE_BYTES) {
      setHistoryError('The history file is larger than 16 MiB. Export a smaller date range and try again.');
      input.value = '';
      return;
    }
    try {
      const parsed = parseTakeoutWatchHistory(await file.text());
      input.value = '';
      if (!parsed.ok) { setHistoryError(`${plainSourceError(parsed.error.message)}. Choose a valid Takeout JSON file and try again.`); return; }
      showHistoryCandidates(parsed.value);
    } catch {
      input.value = '';
      setHistoryError('The history file could not be read. Choose the JSON file again.');
    }
  }

  function reviewPastedUrls(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = String(form.get('historyUrls') ?? '');
    if (!raw.trim()) { setHistoryCandidates([]); setHistorySummary(null); setHistoryError('Paste at least one official YouTube URL.'); return; }
    showHistoryCandidates(parsePastedYouTubeUrls(raw));
  }

  async function saveHistoryCandidate(candidate: WatchHistoryCandidate) {
    if (!historyPermission || savingCandidateId) return;
    setSavingCandidateId(candidate.id); setHistoryError(null); setError(null); setNotice(null);
    try {
      const workspaceId = await workspaceIdForSave();
      const created = await createSource({
        workspaceId,
        kind: 'youtube',
        title: candidate.representative.title,
        ...(candidate.representative.channel ? { creator: candidate.representative.channel } : {}),
        ...(candidate.representative.youtubeChannelId ? { youtubeChannelId: candidate.representative.youtubeChannelId } : {}),
        url: candidate.representative.canonicalUrl,
        sourceOrigin: 'takeout-import',
        permissionAcknowledged: true,
        permissionNote: 'Selected from local YouTube history.',
      });
      if (!created.ok) throw new Error(created.error.message);
      closeHistoryImport();
      setNotice('Source saved locally. Add a transcript when you are ready to create the skill.');
      await reload(workspaceId); await refresh();
    } catch (thrown) {
      const message = (thrown as Error).message;
      setHistoryError(message.includes('already exists') ? 'This source is already in your inbox. Choose another suggestion.' : plainSourceError(message));
      setSavingCandidateId(null);
    }
  }

  async function fetchTitle() {
    const requestId = metadataRequestIdRef.current + 1;
    metadataRequestIdRef.current = requestId;
    const requestedUrl = urlRef.current?.value ?? '';
    setMetadataBusy(true);
    setMetadataError(null);
    setMetadataNotice(null);
    const result = await fetchYouTubeTitle(requestedUrl);
    if (requestId !== metadataRequestIdRef.current) return;
    setMetadataBusy(false);
    if (!result.ok) {
      setMetadataError(result.error.message);
      return;
    }
    if (!titleRef.current || urlRef.current?.value !== requestedUrl) return;
    titleRef.current.value = result.value.title;
    setMetadataNotice(`Title fetched: ${result.value.title}`);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    invalidateMetadataLookup();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const title = String(form.get('title') ?? '').trim();
    const url = String(form.get('url') ?? '').trim();
    let content = String(form.get('content') ?? '');
    let contentFormat: SourceContentFormat = kind === 'article' ? 'markdown' : 'plain';
    const file = fileRef.current?.files?.[0];
    setBusy(true); setError(null); setNotice(null);
    try {
      if (kind === 'file') {
        if (!file) throw new Error('Choose a .txt, .md, .srt, or .vtt file.');
        const inspected = inspectLocalTextFile(file);
        if (!inspected.ok) throw new Error(inspected.error);
        const decoded = decodeLocalTextBytes(new Uint8Array(await file.arrayBuffer()));
        if (!decoded.ok) throw new Error(decoded.error);
        content = decoded.value;
        const contentInspection = inspectLocalTextContent(content);
        if (!contentInspection.ok) throw new Error(contentInspection.error);
        contentFormat = inspected.value.contentFormat;
      }
      const continueToChannelWatch = addContext === 'channel' && kind === 'youtube';
      const workspaceId = await workspaceIdForSave();
      const created = await createSource({
        workspaceId, kind, title: title || (file?.name ?? KIND_COPY[kind].label),
        ...(String(form.get('creator') ?? '').trim() ? { creator: String(form.get('creator')).trim() } : {}),
        ...(url ? { url } : {}),
        ...(content.trim() ? { content, contentFormat, fetchMethod: file ? 'upload' : 'user_paste' } : {}),
        permissionAcknowledged: form.get('permission') === 'on',
        permissionNote: String(form.get('permissionNote') ?? '').trim() || undefined,
      });
      if (!created.ok) throw new Error(created.error.message);
      closeSourceDialog();
      await reload(workspaceId); await refresh();
      formElement.reset();
      lastAutoFileNameRef.current = null;
      setKind(ingestDraft?.kind ?? 'youtube');
      if (continueToChannelWatch) {
        watchReturnFocusRef.current = document.querySelector<HTMLElement>('[data-add-to-cherry-trigger]');
        setWatchSource(created.value);
        setNotice('The video is saved. Add the channel ID and approve its daily check.');
      } else {
        setNotice('Source saved locally. Review it before turning it into a skill.');
      }
    } catch (thrown) {
      const message = (thrown as Error).message;
      setError(message.includes('already exists') ? 'This source is already in your inbox. Choose another source.' : plainSourceError(message));
      window.requestAnimationFrame(() => saveErrorRef.current?.focus());
    } finally { setBusy(false); }
  }

  async function fetchSource(source: SourceRecord) {
    setBusy(true); setError(null); setNotice(null);
    const domain = domainOf(source.url) ?? '';
    if (domain === 'linkedin.com' || domain.endsWith('.linkedin.com')) { setError('LinkedIn fetching is disabled; paste or upload the text instead.'); setBusy(false); return; }
    if (runnerReady !== true) {
      setNotice(
        runner?.paired && runner.scraplingConfigured
          ? `Local fetcher setup required. ${runner.scraplingReason ?? 'Install the pinned worker dependencies and restart the runner.'}`
          : 'Local fetcher not connected. Start and pair the optional Scrapling worker in Connections.',
      );
      setBusy(false);
      return;
    }
    const result = source.fetchStatus === 'queued' ? null : await requestSourceFetch(source.id);
    if (result && !result.ok) setError(plainSourceError(result.error.message));
    else {
      const persistTerminalFailure = async (failure: SourceFetchFailure) => {
        const failed = await failSourceFetch(source.id, failure);
        setNotice(null);
        setError(plainSourceError(failed.ok || failed.error.code === 'conflict' ? failure.reason : failed.error.message));
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
    const watch = watchBySourceId.get(source.id);
    if (watch?.enabled && !await stopChannelWatch(watch)) return;
    setBusy(true); const result = await archiveSource(source.id); if (!result.ok) setError(plainSourceError(result.error.message)); else setNotice('Source archived. It remains recoverable in the Archived filter.'); await reload(); setBusy(false);
  }

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <header className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--sp-4)' }}>
        <div className="stack" style={{ gap: 'var(--sp-2)' }}>
          <span className="label">Source inbox</span>
          <h1 className="display-sm" style={{ margin: 0 }}>Sources</h1>
          <p className="subhead" style={{ margin: 0, maxWidth: 720 }}>Save the material you want Cherry to turn into a method. Outside content stays untrusted until you review it.</p>
        </div>
        {!isIngestRoute ? <AddToCherry className="btn btn-primary" /> : null}
      </header>

      {error && !open ? <p className="field-error" role="alert">{error}</p> : null}
      {notice ? <p className="sticker sticker-pass" role="status">{notice}</p> : null}

      {!isIngestRoute ? (
        <section id="save-from-any-tab" tabIndex={-1} className="card stack" aria-labelledby="bookmarklet-heading">
          <div className="row" style={{ justifyContent: 'space-between', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <div className="stack" style={{ gap: 'var(--sp-2)' }}>
              <h2 id="bookmarklet-heading" className="subhead" style={{ margin: 0 }}>Save from any page</h2>
              <p style={{ margin: 0 }}>Works on any page you're viewing. Cherry only receives the address and title you send it.</p>
              <p className="label" style={{ margin: 0 }}>Drag this bookmark to your bookmarks bar.</p>
              <p className="label" style={{ margin: 0 }}>A browser extension is not part of this sprint.</p>
            </div>
            <a ref={installBookmarklet} className="btn" draggable>Save to Cherry</a>
          </div>
        </section>
      ) : null}

      {!isIngestRoute ? (
        <section className="card stack" aria-labelledby="history-heading">
          <div className="row" style={{ justifyContent: 'space-between', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <div className="stack" style={{ gap: 'var(--sp-2)' }}>
              <h2 id="history-heading" className="subhead" style={{ margin: 0 }}>Find patterns in your YouTube history</h2>
              <p style={{ margin: 0 }}>Choose your Takeout file locally. Cherry suggests source links, and you decide which one to save.</p>
            </div>
            <button ref={historyTriggerRef} type="button" className="btn" onClick={(event) => { historyReturnFocusRef.current = event.currentTarget; clearHistoryImport(); setOpen(false); setHistoryOpen(true); }}>Import YouTube history</button>
          </div>
        </section>
      ) : null}

      <section className="card stack" aria-labelledby="source-controls-heading">
        <div className="row" style={{ justifyContent: 'space-between', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <h2 id="source-controls-heading" className="subhead" style={{ margin: 0 }}>Your materials</h2>
          <div className="row" role="group" aria-label="Filter sources" style={{ gap: 6, flexWrap: 'wrap' }}>
            {([['all', 'All'], ['needs', 'Needs transcript'], ['ready', 'Ready for skill'], ['archived', 'Archived']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="btn btn-sm"
                style={filter === value ? { borderColor: 'var(--color-accent)', background: 'var(--color-accent-tint)', color: 'var(--color-accent-deep)' } : undefined}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {visible.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--sp-8) var(--sp-4)' }}>
            <SourceIcon kind="article" size={30} />
            <h3 className="subhead" style={{ margin: 0 }}>{sources.length === 0 ? 'Nothing here yet' : 'No sources match'}</h3>
            <p>{sources.length === 0 ? 'Choose a source, paste what you are permitted to use, and Cherry will preserve where it came from.' : 'No saved sources match this filter.'}</p>
            {sources.length === 0
              ? <p className="label" style={{ margin: 0 }}>Choose Add to Cherry above to start.</p>
              : <button type="button" className="btn" onClick={() => setFilter('all')}>Clear filter</button>}
          </div>
        ) : (
          <div className="source-grid">
            {visible.map((source) => {
              const status = statusLabel(source);
              const needsYouTubeTranscript = source.kind === 'youtube' && source.status !== 'ready' && source.status !== 'archived';
              const channelWatch = watchBySourceId.get(source.id);
              const channelAlreadyWatched = source.youtubeChannelId ? watchByChannelId.get(source.youtubeChannelId) : undefined;
              const watchIsRegistered = channelWatch?.enabled
                ? registeredWatchKeys.has(watchRegistrationKey(channelWatch))
                : false;
              const sourceHeadingId = `source-heading-${source.id}`;
              const watchSummaryId = `channel-watch-summary-${source.id}`;
              const canArchiveSource = !channelWatch?.enabled || Boolean(runner?.paired && channelRunnerReady);
              return (
                <article key={source.id} className="card source-card" data-testid="source-card" aria-labelledby={sourceHeadingId}>
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}><span className="source-kind-icon"><SourceIcon kind={source.kind} /></span><span className={status.className}>{status.text}</span></div>
                  <div className="stack" style={{ gap: 4 }}>
                    <h3 id={sourceHeadingId} style={{ margin: 0 }}>{source.title}</h3>
                    <p className="label" style={{ margin: 0 }}>{KIND_COPY[source.kind].label}{source.creator ? ` · ${source.creator}` : ''}</p>
                    {source.sourceOrigin === 'takeout-import' ? <p className="label" style={{ margin: 0 }}>From YouTube history</p> : null}
                    {source.sourceOrigin === 'rss-watch' ? <p className="label" style={{ margin: 0 }}>From channel watch</p> : null}
                    {source.url ? <a className="link-quiet" href={source.url} target="_blank" rel="noreferrer" style={{ overflowWrap: 'anywhere' }}>{domainOf(source.url)}</a> : <span className="label">Saved only here</span>}
                  </div>
                  <p className="source-card-meta">{source.contentHash ? 'Content hashed' : 'No content yet'} · updated {new Date(source.updatedAt).toLocaleDateString()}</p>
                  {source.kind === 'youtube' && source.status !== 'archived' ? (
                    <div
                      ref={(node) => {
                        if (node) watchStateRefs.current.set(source.id, node);
                        else watchStateRefs.current.delete(source.id);
                      }}
                      className="stack"
                      style={{ gap: 6 }}
                      data-testid="channel-watch-state"
                      tabIndex={-1}
                      aria-labelledby={sourceHeadingId}
                      aria-describedby={watchSummaryId}
                    >
                      <span id={watchSummaryId} className="sr-only">
                        {channelWatch?.enabled
                          ? `${watchIsRegistered ? 'Daily channel watch connected.' : 'Channel watch saved. Daily check not confirmed.'} ${watchCheckLabel(channelWatch)}.`
                          : 'Channel watch is not enabled.'}
                      </span>
                      {channelWatch?.enabled ? (
                        <>
                          <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <span className="sticker">{watchIsRegistered ? 'Channel watch · daily' : 'Watch saved · daily check not confirmed'}</span>
                            <span className="label">{watchCheckLabel(channelWatch)}</span>
                          </div>
                          {channelWatch.lastError ? <p className="field-error" style={{ margin: 0 }}>The last check failed and nothing was saved. Check the runner, then try again.</p> : null}
                          {runner === null ? (
                            <span className="label">Checking the local runner</span>
                          ) : runner.paired ? (
                            channelRunnerReady ? (
                              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                                {watchIsRegistered ? (
                                  <button type="button" className="btn btn-sm" aria-label={`Check ${source.title} channel now`} disabled={watchBusyId === channelWatch.id} onClick={() => void checkChannelNow(channelWatch)}>{watchBusyId === channelWatch.id ? 'Checking' : 'Check now'}</button>
                                ) : (
                                  <button type="button" className="btn btn-sm" aria-label={`Connect ${source.title} daily channel check`} disabled={watchBusyId === channelWatch.id} onClick={() => void connectChannelWatch(channelWatch)}>{watchBusyId === channelWatch.id ? 'Connecting' : 'Connect daily check'}</button>
                                )}
                                <button type="button" className="btn btn-sm" aria-label={`Stop watching ${source.title}`} disabled={watchBusyId === channelWatch.id} onClick={() => void stopChannelWatch(channelWatch)}>Stop watching</button>
                              </div>
                            ) : <p className="label" style={{ margin: 0 }}>This runner cannot check or stop channels yet. Update the local runner before archiving this source.</p>
                          ) : (
                            <div className="row" style={{ gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                              <span className="label">Pair the local runner to check or stop this channel before archiving it.</span>
                              <Link className="link-quiet" to="/studio/settings/connections">Pair runner</Link>
                            </div>
                          )}
                        </>
                      ) : channelAlreadyWatched && channelAlreadyWatched.sourceId !== source.id ? (
                        <span className="label">{channelAlreadyWatched.enabled ? 'This channel is already watched from another saved source.' : 'This channel was watched from another saved source. Restart it there.'}</span>
                      ) : runner === null ? (
                        <span className="label">Checking the local runner</span>
                      ) : !runner.paired ? (
                        <div className="row" style={{ gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <span className="label">pair the local runner to check channels</span>
                          <Link className="link-quiet" to="/studio/settings/connections">Pair runner</Link>
                        </div>
                      ) : !channelRunnerReady ? (
                        <span className="label">This runner cannot check channels yet. Update the local runner and try again.</span>
                      ) : (
                        <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} aria-label={`Watch ${source.title} channel`} disabled={watchBusyId === source.id} onClick={(event) => void beginChannelWatch(source, event.currentTarget)}>{watchBusyId === source.id ? 'Saving watch' : 'Watch this channel'}</button>
                      )}
                    </div>
                  ) : null}
                  {source.fetchError ? <p className="field-error" style={{ margin: 0 }}>{plainSourceError(source.fetchError)}</p> : null}
                  {needsYouTubeTranscript ? (
                    <SourceMaterialChoices
                      compact
                      onPasteTranscript={() => navigate(`/studio/quick?sourceId=${encodeURIComponent(source.id)}&method=paste`)}
                      onTranscribeWhilePlaying={() => navigate(`/studio/quick?sourceId=${encodeURIComponent(source.id)}&method=transcribe`)}
                    />
                  ) : null}
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {source.status !== 'archived' ? <>
                      <Link className="btn btn-sm" to={`/studio/watch/${source.lessonId}`}>Review source</Link>
                      {!needsYouTubeTranscript ? <button type="button" className="btn btn-sm" onClick={() => navigate(`/studio/quick?sourceId=${encodeURIComponent(source.id)}`)}>Create skill</button> : null}
                      {source.url && source.kind === 'article' ? <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void fetchSource(source)}>{source.fetchStatus === 'queued' ? 'Dispatch fetch' : 'Fetch selected page'}</button> : null}
                      {canArchiveSource ? <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void archive(source)}>Archive</button> : null}
                    </> : <span className="label">Recoverable archive</span>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="card source-boundary stack" aria-labelledby="boundary-heading"><h2 id="boundary-heading" className="subhead" style={{ margin: 0 }}>What Cherry will not do</h2><p style={{ margin: 0 }}>Cherry never watches every video, scrapes LinkedIn, downloads YouTube captions, or runs a background crawler. A saved address contains no page content until you choose a permitted fetch. Any fetched page still needs your review before it can become an approved skill.</p><div className="row" style={{ gap: 6, flexWrap: 'wrap' }}><Link className="btn btn-sm" to="/studio/settings/connections">Check local runner</Link><Link className="btn btn-sm" to="/studio/proof">View proof</Link></div></section>

      <dialog ref={historyDialogRef} className="sheet source-dialog" aria-labelledby="history-import-title" onCancel={(event) => { event.preventDefault(); closeHistoryImport(); }} onClick={(event) => { if (event.target === event.currentTarget) closeHistoryImport(); }}>
        <div className="stack" style={{ gap: 'var(--sp-4)' }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="stack" style={{ gap: 4 }}>
              <span className="label">Local suggestions</span>
              <h2 id="history-import-title" className="subhead" style={{ margin: 0 }}>Import your YouTube history</h2>
              <p style={{ margin: 0 }}>Nothing uploads anywhere.</p>
            </div>
            <button type="button" className="btn btn-sm" onClick={closeHistoryImport} aria-label="Close YouTube history import">{Icons.close(16)}</button>
          </div>
          <p style={{ margin: 0 }}>Choose the JSON file from Google Takeout. Cherry reads up to 16 MiB in this tab and keeps only the source you choose.</p>
          <label className="field"><span>YouTube Takeout JSON</span><input ref={historyFileRef} type="file" accept=".json,application/json" onChange={(event) => void readHistoryFile(event)} /></label>
          <div className="row" aria-hidden="true" style={{ gap: 'var(--sp-3)', alignItems: 'center' }}><span style={{ flex: 1, borderTop: '1px solid var(--color-pebble)' }} /><span className="label">or</span><span style={{ flex: 1, borderTop: '1px solid var(--color-pebble)' }} /></div>
          <form ref={historyPasteFormRef} className="stack" style={{ gap: 'var(--sp-3)' }} onSubmit={reviewPastedUrls}>
            <label className="field"><span>Or paste YouTube URLs</span><textarea className="textarea" name="historyUrls" rows={4} maxLength={MAX_WATCH_HISTORY_FILE_BYTES} placeholder="One official YouTube URL per line" /></label>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button type="submit" className="btn btn-sm">Review URLs</button></div>
          </form>
          {historyError ? <p className="field-error" role="alert">{historyError}</p> : null}
          {historySummary ? <p className="label" role="status" style={{ margin: 0 }}>{historySummary}</p> : null}
          {historyCandidates.length ? (
            <div className="stack" style={{ gap: 'var(--sp-3)' }}>
              <label className="check-row"><input type="checkbox" checked={historyPermission} onChange={(event) => setHistoryPermission(event.currentTarget.checked)} /><span>I have permission to save source links I choose. Cherry records this acknowledgement; it does not verify ownership.</span></label>
              {!historyPermission ? <p className="label" style={{ margin: 0 }}>Confirm permission before saving a source.</p> : null}
              <div className="stack" style={{ gap: 'var(--sp-3)', maxHeight: 'min(45vh, 520px)', overflowY: 'auto' }}>
                {historyCandidates.map((candidate) => (
                  <article key={candidate.id} className="card stack" data-testid="watch-history-candidate" style={{ gap: 'var(--sp-2)' }}>
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                      <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                        <span className="label">{candidate.kind === 'channel' ? 'Channel pattern' : candidate.kind === 'keyword' ? 'Topic pattern' : 'Source suggestion'}</span>
                        <h3 className="subhead" style={{ margin: 0, overflowWrap: 'anywhere' }}>{candidate.label}</h3>
                        <p style={{ margin: 0 }}>{candidate.reason}</p>
                        <p className="label" style={{ margin: 0, overflowWrap: 'anywhere' }}>Source: {candidate.representative.title}</p>
                      </div>
                      <button type="button" className="btn btn-sm" aria-label={`Save ${candidate.label} source`} disabled={!historyPermission || savingCandidateId !== null} onClick={() => void saveHistoryCandidate(candidate)}>{savingCandidateId === candidate.id ? 'Saving…' : 'Save source'}</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </dialog>

      <dialog ref={watchDialogRef} className="sheet source-dialog" aria-labelledby="watch-channel-title" aria-describedby="watch-channel-disclosure watch-channel-boundary" onCancel={(event) => { event.preventDefault(); closeWatchDialog(); }} onClick={(event) => { if (event.target === event.currentTarget) closeWatchDialog(); }}>
        <form key={watchSource?.id ?? 'channel-watch'} className="stack" style={{ gap: 'var(--sp-4)' }} onSubmit={(event) => void submitChannelWatch(event)} aria-describedby={watchError ? 'watch-channel-error' : undefined}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="stack" style={{ gap: 4 }}>
              <span className="label">Public YouTube feed</span>
              <h2 id="watch-channel-title" className="subhead" style={{ margin: 0 }}>Watch this channel</h2>
            </div>
            <button type="button" className="btn btn-sm" onClick={() => closeWatchDialog()} aria-label="Close channel watch dialog">{Icons.close(16)}</button>
          </div>
          <p id="watch-channel-disclosure" style={{ margin: 0 }}>Your paired local runner checks this channel's public YouTube feed daily. New videos are saved here without transcripts.</p>
          <p id="watch-channel-boundary" className="label" style={{ margin: 0 }}>Nothing is transcribed or approved automatically. Checks run only while your paired runner is on.</p>
          <div className="field">
            <label htmlFor="watch-channel-id">YouTube channel ID or official channel URL</label>
            <input
              id="watch-channel-id"
              ref={watchChannelIdRef}
              name="channelId"
              className="input"
              required
              maxLength={2048}
              autoComplete="off"
              defaultValue={watchSource?.youtubeChannelId ?? ''}
              readOnly={Boolean(watchSource?.youtubeChannelId)}
              aria-describedby="watch-channel-helper"
              placeholder="UC… or https://www.youtube.com/channel/UC…"
            />
            <small id="watch-channel-helper">Channel handles are not supported. Use the ID from the official channel URL. It starts with UC.</small>
          </div>
          {watchError ? <p ref={watchErrorRef} id="watch-channel-error" className="field-error" role="alert" tabIndex={-1} style={{ margin: 0 }}>{watchError}</p> : null}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={() => closeWatchDialog()}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={watchBusyId !== null}>{watchBusyId ? 'Saving watch' : 'Save watch'}</button>
          </div>
        </form>
      </dialog>

      <dialog ref={sourceDialogRef} className="sheet source-dialog" aria-labelledby="save-source-title" onCancel={(event) => { event.preventDefault(); closeSourceDialog(); }} onClick={(event) => { if (event.target === event.currentTarget) closeSourceDialog(); }} style={{ maxHeight: 'calc(100dvh - var(--sp-4) * 2)', overflowY: 'auto', overscrollBehavior: 'contain' }}>
        <form key={isIngestRoute ? location.search : 'manual-source'} method="dialog" className="stack" style={{ gap: 'var(--sp-4)' }} onSubmit={(event) => void save(event)} aria-describedby={error ? 'save-source-error' : undefined}>
          <div className="row" style={{ justifyContent: 'space-between' }}><div><span className="label">{addContext === 'channel' ? 'Step 1 of 2' : 'New material'}</span><h2 id="save-source-title" className="subhead" style={{ margin: 0 }}>{addContext === 'channel' ? 'Start a channel watch' : 'Save a source'}</h2></div><button type="button" className="btn btn-sm" onClick={closeSourceDialog} aria-label="Close save source dialog">{Icons.close(16)}</button></div>
          {addContext === 'channel' ? <p style={{ margin: 0 }}>Start with one official video from the channel. After you save it, Cherry asks for the channel ID and your approval for the paired runner's daily check.</p> : null}
          <fieldset className="source-kind-grid"><legend className="label">{addContext === 'channel' ? 'Channel source type' : 'Choose the source type'}</legend>{(addContext === 'channel' ? ['youtube'] as SourceKind[] : Object.keys(KIND_COPY) as SourceKind[]).map((candidate) => <button key={candidate} type="button" className={`source-kind-option ${kind === candidate ? 'is-selected' : ''}`} aria-pressed={kind === candidate} onClick={() => selectSourceKind(candidate)}><SourceIcon kind={candidate} size={24} /><strong>{KIND_COPY[candidate].label}</strong><span>{KIND_COPY[candidate].detail}</span></button>)}</fieldset>
          <label className="field"><span>Title</span><input ref={titleRef} name="title" className="input" required maxLength={300} defaultValue={ingestDraft?.title ?? ''} placeholder="What should your agents learn?" onInput={invalidateMetadataLookup} /></label>
          <div className="row" style={{ gap: 'var(--sp-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label className="field" style={{ flex: '1 1 220px' }}><span>Creator <small>(optional)</small></span><input name="creator" className="input" maxLength={200} placeholder="Name or publication" /></label>
            <div className="stack" style={{ flex: '2 1 320px', gap: 6 }}>
              <label htmlFor="source-url" className="field"><span>URL <small>(metadata only)</small></span></label>
              <div className="row" style={{ gap: 6, alignItems: 'stretch' }}>
                <input id="source-url" ref={urlRef} name="url" className="input" type="url" maxLength={2048} defaultValue={ingestDraft?.url ?? ''} placeholder={kind === 'youtube' ? 'https://youtube.com/watch?v=…' : 'https://example.com/article'} style={{ flex: 1, minWidth: 0 }} onInput={invalidateMetadataLookup} />
                {kind === 'youtube' ? <button type="button" className="btn btn-sm" disabled={metadataBusy} onClick={() => void fetchTitle()}>{metadataBusy ? 'Fetching title' : 'Fetch title'}</button> : null}
              </div>
            </div>
          </div>
          {metadataError ? <p className="field-error" role="alert" style={{ margin: 0 }}>{metadataError}</p> : null}
          {metadataNotice ? <p className="label" role="status" style={{ margin: 0 }}>{metadataNotice}</p> : null}
          {kind === 'file' ? <label className="field"><span>Text file</span><input ref={fileRef} name="file" type="file" required accept=".txt,.md,.srt,.vtt,text/plain,text/markdown,text/vtt,application/x-subrip" onChange={selectLocalFile} /></label> : <label className="field"><span>{kind === 'youtube' ? 'Transcript (optional)' : kind === 'note' ? 'Note' : 'Body or permitted export (optional)'}</span><textarea name="content" className="textarea" rows={6} maxLength={2 * 1024 * 1024} defaultValue={ingestDraft?.text ?? ''} placeholder={kind === 'youtube' ? 'Paste the transcript from the official player…' : 'Paste or write the material you are permitted to use…'} /></label>}
          {kind !== 'note' ? <label className="check-row"><input ref={permissionRef} type="checkbox" name="permission" required /><span>I have permission to use this material. Cherry records this acknowledgement; it does not verify ownership.</span></label> : null}
          {kind !== 'note' ? <label className="field"><span>Permission note <small>(optional)</small></span><input name="permissionNote" className="input" maxLength={1000} placeholder="e.g. my export, public license, or team permission" /></label> : null}
          {error ? <p ref={saveErrorRef} id="save-source-error" className="field-error" role="alert" tabIndex={-1} style={{ margin: 0 }}>{error}</p> : null}
          <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn" onClick={closeSourceDialog}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save locally'}</button></div>
        </form>
      </dialog>
    </div>
  );
}
