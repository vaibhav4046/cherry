import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import type { ChannelWatch } from '../../cherry/source/channel-watch-model.ts';
import { disableChannelWatch, listChannelWatches } from '../../cherry/source/channel-watch-service.ts';
import type { ProposalReadiness, SkillProposal } from '../../cherry/source/proposal-model.ts';
import { dismissProposal, syncProposals } from '../../cherry/source/proposal-service.ts';
import type { SourceRecord } from '../../cherry/source/source-model.ts';
import { listSources } from '../../cherry/source/source-service.ts';
import { runnerStatus, unregisterRunnerChannelWatch, type RunnerStatus } from '../../cherry/runner-client/runner-api.ts';

/** Verbatim boundary sentences for this surface (T26 copy rules). */
const FEED_SENTENCE = "Cherry checks the channel's public feed once a day on your paired runner.";
const DOWNLOAD_SENTENCE = 'Cherry never downloads the video. Add the transcript and Cherry drafts the steps.';
const PROPOSAL_SENTENCE = 'A proposal is a starting point. You approve the exact version you read.';

const READINESS_LABEL: Record<ProposalReadiness, { text: string; className: string }> = {
  'needs-transcript': { text: 'Needs transcript', className: 'sticker sticker-wait' },
  'draft-ready': { text: 'Ready to draft', className: 'sticker sticker-cherry' },
  drafted: { text: 'Draft saved', className: 'sticker' },
  approved: { text: 'Approved', className: 'sticker sticker-pass' },
  dismissed: { text: 'Set aside', className: 'sticker' },
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function plainCreatorsError(message: string): string {
  return message
    .replace(/\bworkspaces?\b/gi, (word) => (word.toLowerCase() === 'workspace' ? 'space' : 'spaces'))
    .replace(/\blessons?\b/gi, (word) => (word.toLowerCase() === 'lesson' ? 'source' : 'sources'));
}

export default function Creators() {
  const { activeWorkspace } = useAppState();
  const [proposals, setProposals] = useState<SkillProposal[]>([]);
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [watches, setWatches] = useState<ChannelWatch[]>([]);
  const [runner, setRunner] = useState<RunnerStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function reload(workspaceId: string) {
    const [nextProposals, nextSources, nextWatches] = await Promise.all([
      syncProposals(workspaceId),
      listSources(workspaceId),
      listChannelWatches(workspaceId),
    ]);
    setProposals(nextProposals);
    setSources(nextSources);
    setWatches(nextWatches.filter((watch) => watch.enabled));
  }

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    void (async () => {
      try {
        if (activeWorkspace) await reload(activeWorkspace.id);
        else { setProposals([]); setSources([]); setWatches([]); }
      } catch (thrown) {
        if (!cancelled) setError(plainCreatorsError((thrown as Error).message));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [activeWorkspace?.id]);

  useEffect(() => {
    void runnerStatus().then(setRunner);
  }, []);

  const channelRunnerReady = runner?.paired === true && runner.v2Adapters?.includes('youtube-rss-watch') === true;
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const visibleProposals = proposals.filter((proposal) => proposal.readiness !== 'dismissed');
  const setAsideCount = proposals.length - visibleProposals.length;
  const lastChecked = watches
    .map((watch) => watch.lastCheckedAt)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1) ?? null;

  function uploadsFor(watch: ChannelWatch): number {
    return sources.filter((source) => source.sourceOrigin === 'rss-watch' && source.youtubeChannelId === watch.channelId).length;
  }

  function creatorName(watch: ChannelWatch): string {
    return watch.channelName ?? sourceById.get(watch.sourceId)?.creator ?? watch.channelId;
  }

  async function stopWatching(watch: ChannelWatch) {
    setError(null); setNotice(null);
    if (!runner?.paired) { setError('Pair the local runner to stop this channel watch.'); return; }
    if (!channelRunnerReady) { setError('This runner cannot stop the daily check yet. Update the local runner and try again.'); return; }
    setBusyId(watch.id);
    const removed = await unregisterRunnerChannelWatch(watch);
    if ((!removed.ok && removed.error.code !== 'not_found') || (removed.ok && !removed.value.removed)) {
      setError('Watching was not stopped. Check the runner, then try again.');
      setBusyId(null);
      return;
    }
    const disabled = await disableChannelWatch(watch.id, 'human', watch);
    if (!disabled.ok) {
      setError(plainCreatorsError(disabled.error.message));
      setBusyId(null);
      return;
    }
    if (activeWorkspace) await reload(activeWorkspace.id);
    setNotice(`Stopped following ${creatorName(watch)}. Saved uploads stay in Sources.`);
    setBusyId(null);
  }

  async function setAside(proposal: SkillProposal) {
    setError(null); setNotice(null);
    setBusyId(proposal.id);
    const result = await dismissProposal(proposal.id, 'human');
    if (!result.ok) setError(plainCreatorsError(result.error.message));
    else if (activeWorkspace) {
      await reload(activeWorkspace.id);
      setNotice(`Set aside "${proposal.sourceTitle}". The source stays in Sources.`);
    }
    setBusyId(null);
  }

  if (!activeWorkspace) {
    return (
      <div className="stack" style={{ gap: 'var(--sp-4)', maxWidth: 720 }}>
        <span className="label">Creators</span>
        <h1 className="display-sm" style={{ margin: 0 }}>What's new from the creators you follow</h1>
        <p className="card" style={{ margin: 0 }}>No space is active. Open Studio to choose or create one.</p>
        <div className="row"><Link to="/studio" className="btn btn-primary">Open Studio</Link></div>
      </div>
    );
  }

  const followButton = (
    <Link to="/studio/sources?add=channel" className="btn btn-primary" data-testid="creators-follow">Follow a creator</Link>
  );

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <header className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--sp-4)' }}>
        <div className="stack" style={{ gap: 'var(--sp-2)', minWidth: 0 }}>
          <span className="label">Creators</span>
          <h1 className="display-sm" style={{ margin: 0 }}>What's new from the creators you follow</h1>
          <p className="subhead" style={{ margin: 0, maxWidth: 720 }}>{DOWNLOAD_SENTENCE}</p>
        </div>
        {followButton}
      </header>

      {error ? <p className="field-error" role="alert">{error}</p> : null}
      {notice ? <p className="sticker sticker-pass" role="status" style={{ whiteSpace: 'normal' }}>{notice}</p> : null}

      <section className="card stack" aria-labelledby="creators-runner-heading" data-testid="creators-runner">
        <h2 id="creators-runner-heading" className="subhead" style={{ margin: 0 }}>Daily check</h2>
        {runner === null ? (
          <p style={{ margin: 0 }}>Checking the local runner.</p>
        ) : channelRunnerReady ? (
          <p style={{ margin: 0 }}>
            Daily check runs on your paired runner. Last checked {lastChecked ? formatTime(lastChecked) : 'not yet'}.
          </p>
        ) : (
          <div className="row" style={{ gap: 'var(--sp-2)', alignItems: 'baseline', flexWrap: 'wrap' }}>
            <p style={{ margin: 0 }}>Pair the local runner to check channels automatically. You can still paste any video link now.</p>
            <Link className="link-quiet" to="/studio/settings/connections">Pair runner</Link>
          </div>
        )}
        <p className="label" style={{ margin: 0 }}>{FEED_SENTENCE}</p>
      </section>

      {watches.length === 0 && visibleProposals.length === 0 ? (
        <section className="card stack" aria-labelledby="creators-empty-heading" data-testid="creators-empty">
          <h2 id="creators-empty-heading" className="subhead" style={{ margin: 0 }}>Nothing followed yet</h2>
          <p style={{ margin: 0 }}>{FEED_SENTENCE}</p>
          <p style={{ margin: 0 }}>{DOWNLOAD_SENTENCE}</p>
          <p style={{ margin: 0 }}>{PROPOSAL_SENTENCE}</p>
          {setAsideCount > 0 ? <p className="label" style={{ margin: 0 }}>{setAsideCount} set aside.</p> : null}
        </section>
      ) : null}

      {watches.length > 0 ? (
        <section className="card stack" aria-labelledby="creators-followed-heading">
          <h2 id="creators-followed-heading" className="subhead" style={{ margin: 0 }}>Followed creators</h2>
          <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="creators-followed">
            {watches.map((watch) => (
              <li key={watch.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--sp-3)', borderTop: 'var(--border)', paddingTop: 'var(--sp-3)' }} data-testid="creator-row">
                <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                  <div className="row" style={{ gap: 'var(--sp-2)' }}>
                    <strong style={{ overflowWrap: 'anywhere' }}>{creatorName(watch)}</strong>
                    {activeWorkspace.isExample === true ? <span className="sticker sticker-wait">SAMPLE DATA</span> : null}
                  </div>
                  <span className="label mono" style={{ textTransform: 'none', overflowWrap: 'anywhere' }}>{watch.channelId}</span>
                  <span className="label" style={{ margin: 0 }}>
                    {watch.lastCheckedAt ? `Last checked ${formatTime(watch.lastCheckedAt)}` : 'Never checked'} · {uploadsFor(watch)} new {uploadsFor(watch) === 1 ? 'upload' : 'uploads'}
                  </span>
                </div>
                <button type="button" className="btn btn-sm" aria-label={`Stop following ${creatorName(watch)}`} disabled={busyId === watch.id} onClick={() => void stopWatching(watch)}>Stop</button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {visibleProposals.length > 0 ? (
        <section className="card stack" aria-labelledby="creators-new-heading">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <h2 id="creators-new-heading" className="subhead" style={{ margin: 0 }}>New from your creators</h2>
            <span className="label">{PROPOSAL_SENTENCE}</span>
          </div>
          <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="creators-proposals">
            {visibleProposals.map((proposal) => {
              const readiness = READINESS_LABEL[proposal.readiness];
              const sourceId = encodeURIComponent(proposal.sourceId);
              return (
                <li key={proposal.id} className="stack" style={{ gap: 'var(--sp-2)', borderTop: 'var(--border)', paddingTop: 'var(--sp-3)' }} data-testid="proposal-row" data-readiness={proposal.readiness}>
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                    <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                      <span className="label" style={{ margin: 0 }}>{proposal.creatorName ?? 'Unknown creator'} · published {formatDate(proposal.publishedAt)}</span>
                      <strong style={{ overflowWrap: 'anywhere' }}>{proposal.sourceTitle}</strong>
                      <span style={{ overflowWrap: 'anywhere' }}>Cherry proposes: {proposal.name}</span>
                      <span className="label" style={{ margin: 0, textTransform: 'none', letterSpacing: 0, overflowWrap: 'anywhere' }}>{proposal.teaches}</span>
                    </div>
                    <span className={readiness.className}>{readiness.text}</span>
                  </div>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {proposal.readiness === 'needs-transcript' ? (
                      <>
                        <Link className="btn btn-sm" to={`/studio/quick?sourceId=${sourceId}&method=paste`}>Add transcript</Link>
                        <Link className="btn btn-sm" to={`/studio/quick?sourceId=${sourceId}&method=transcribe`}>Transcribe on this device</Link>
                        <button type="button" className="btn btn-sm" disabled={busyId === proposal.id} onClick={() => void setAside(proposal)}>Not useful</button>
                      </>
                    ) : null}
                    {proposal.readiness === 'draft-ready' ? (
                      <>
                        <Link className="btn btn-sm" to={`/studio/quick?sourceId=${sourceId}`}>Draft the skill</Link>
                        <button type="button" className="btn btn-sm" disabled={busyId === proposal.id} onClick={() => void setAside(proposal)}>Not useful</button>
                      </>
                    ) : null}
                    {proposal.readiness === 'drafted' ? (
                      <Link className="btn btn-sm" to={`/studio/quick?sourceId=${sourceId}`}>Open draft</Link>
                    ) : null}
                    {proposal.readiness === 'approved' && proposal.skillGraphId ? (
                      <Link className="btn btn-sm" to={`/studio/skills/${encodeURIComponent(proposal.skillGraphId)}`}>Open in library</Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {setAsideCount > 0 ? <p className="label" style={{ margin: 0 }}>{setAsideCount} set aside.</p> : null}
        </section>
      ) : null}

      {!loaded ? <p className="label" role="status" style={{ margin: 0 }}>Loading creators.</p> : null}
    </div>
  );
}
