import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { buildConnectUrl, buildRoutineDraftUrl } from '../../cherry/library/library-links.ts';
import { useAppState } from '../../app/AppState.tsx';
import { createMission, createWorkspace, transitionMission, updateMission } from '../../cherry/mission/mission-service.ts';
import { getLesson, listTranscript, updateLesson } from '../../cherry/watch/lesson-service.ts';
import { embedUrl, isYouTubeFamilyHost } from '../../cherry/watch/youtube-url.ts';
import { previewQuickSkill, generateSkillFromLesson } from '../../cherry/skillgraph/quick-skill.ts';
import { requestSkillGraphApproval, decideSkillGraphApproval } from '../../cherry/skillgraph/skillgraph-service.ts';
import { runVerification } from '../../cherry/verify/verification-service.ts';
import { compileSkillBundle } from '../../cherry/compiler/archive-builder.ts';
import { createProofReceipt } from '../../cherry/proof/proof-service.ts';
import { startTabAudioCapture, transcribeMediaFile, transcribePcm, decodeToMono16k, type TabCapture, type TranscribeProgress } from '../../cherry/transcribe/local-whisper.ts';
import { createArtifactSet, writeArtifactFile } from '../../cherry/artifacts/artifact-service.ts';
import { getMission } from '../../cherry/mission/mission-service.ts';
import {
  buildBriefingDoc,
  buildFaq,
  buildStudyGuide,
  digestSegments,
  suggestedChecks,
  summarizeText,
  type SourceDigest,
  type SourceInfo,
} from '../../cherry/notebook/digest.ts';
import type { Lesson } from '../../cherry/watch/watch-model.ts';
import type { SkillGraph } from '../../cherry/skillgraph/skillgraph-model.ts';
import type { DerivedSkillDraft } from '../../cherry/skillgraph/auto-draft.ts';
import { CherryMascot } from '../../components/CherryMascot.tsx';
import { Icons } from '../../components/Icons.tsx';
import { completeSourceFetch, createSource, failSourceFetch, getSource, importSourceTranscript, interpretSourceFetchOutcome, requestSourceFetch } from '../../cherry/source/source-service.ts';
import type { HumanTranscriptSource, SourceFetchFailure } from '../../cherry/source/source-service.ts';
import { pollRunnerJob, runnerStatus, submitRunnerJob } from '../../cherry/runner-client/runner-api.ts';
import type { SourceRecord } from '../../cherry/source/source-model.ts';
import { SourceMaterialChoices } from './SourceMaterialChoices.tsx';
import { loadExampleWorkspace } from '../../cherry/persistence/example-workspace-loader.ts';
import { AddToCherry } from './AddToCherry.tsx';

type Stage = 'source' | 'transcript' | 'review' | 'ready';

function plainQuickError(message: string): string {
  return message
    .replace(/\bskill\s*graph\b/gi, (word) => (word[0] === word[0]?.toUpperCase() ? 'Skill' : 'skill'))
    .replace(/\brevision binding\b/gi, 'approved version')
    .replace(/\brevisions?\b/gi, (word) => (word.toLowerCase() === 'revision' ? 'version' : 'versions'))
    .replace(/\bworkspaces?\b/gi, (word) => (word.toLowerCase() === 'workspace' ? 'space' : 'spaces'))
    .replace(/\blessons?\b/gi, (word) => (word.toLowerCase() === 'lesson' ? 'source' : 'sources'))
    .replace(/\bnodes?\b/gi, (word) => (word.toLowerCase() === 'node' ? 'step' : 'steps'));
}

export function classifyQuickSkillMaterial(material: string): 'raw' | 'youtube' | 'article' {
  try {
    const url = new URL(material.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'raw';
    return isYouTubeFamilyHost(url.hostname) ? 'youtube' : 'article';
  } catch {
    return 'raw';
  }
}

export function transcriptImportMode(hasPersistedTranscript: boolean, batchIndex: number): 'replace' | 'append' {
  return hasPersistedTranscript || batchIndex > 0 ? 'append' : 'replace';
}

/**
 * Quick Skill: paste a YouTube link (or skip the video), paste the transcript,
 * and Cherry deterministically drafts the skill. You review the steps,
 * approve, and download an installable bundle — one screen, real records at
 * every stage, same domain services as the manual flow.
 */
export default function QuickSkill() {
  const { activeWorkspace, refresh } = useAppState();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sourceId = searchParams.get('sourceId');
  const requestedSourceChoice = searchParams.get('method') === 'paste' || searchParams.get('method') === 'transcribe'
    ? searchParams.get('method') as 'paste' | 'transcribe'
    : null;
  const requestedAdd = ['youtube', 'article', 'text'].includes(searchParams.get('add') ?? '')
    ? searchParams.get('add')
    : null;
  const [stage, setStage] = useState<Stage>('source');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [skillName, setSkillName] = useState('');
  const [draft, setDraft] = useState<DerivedSkillDraft | null>(null);
  const [kept, setKept] = useState<Set<number>>(new Set());
  const [graph, setGraph] = useState<SkillGraph | null>(null);
  const [verifyNote, setVerifyNote] = useState<string | null>(null);
  const [bundleNote, setBundleNote] = useState<string | null>(null);
  const [sourceCount, setSourceCount] = useState(0);
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [digest, setDigest] = useState<SourceDigest | null>(null);
  const [outputNote, setOutputNote] = useState<string | null>(null);
  const [addingSource, setAddingSource] = useState(false);
  const wizardPlayerRef = useRef<HTMLIFrameElement | null>(null);
  const materialRef = useRef<HTMLTextAreaElement | null>(null);
  const transcriptRef = useRef<HTMLTextAreaElement | null>(null);
  const captureRef = useRef<TabCapture | null>(null);
  const [autoProgress, setAutoProgress] = useState<TranscribeProgress | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [activeSource, setActiveSource] = useState<SourceRecord | null>(null);
  const [sourceChoice, setSourceChoice] = useState<'paste' | 'transcribe' | null>(null);
  const [runnerReady, setRunnerReady] = useState(false);
  const [transcriptSource, setTranscriptSource] = useState<HumanTranscriptSource>('user_text');

  async function handleLoadStarterLibrary() {
    setBusy(true);
    setError(null);
    try {
      const result = await loadExampleWorkspace('starter-library');
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await refresh();
      navigate('/studio/skills');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The starter library could not be loaded. Try again.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void runnerStatus().then((status) => setRunnerReady(status.paired && status.scraplingReady === true));
  }, []);

  useEffect(() => {
    if (stage !== 'source' || !requestedAdd) return;
    const frame = window.requestAnimationFrame(() => materialRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [requestedAdd, stage]);

  useEffect(() => {
    if (!sourceId || !activeWorkspace) return;
    let cancelled = false;
    void (async () => {
      setBusy(true); setError(null);
      try {
        const source = await getSource(sourceId);
        if (!source || source.workspaceId !== activeWorkspace.id) throw new Error('That source is not available in your current space');
        let loaded = await getLesson(source.lessonId);
        if (!loaded) throw new Error('The source could not be found');
        let mission = loaded.missionId ? await getMission(loaded.missionId) : null;
        if (!mission) {
          const created = await createMission({ workspaceId: activeWorkspace.id, title: source.title, objective: `Turn ${source.title} into an approved, portable skill.`, definitionOfDone: ['Each step links back to the source', 'You approve the exact skill version', 'Checks pass'] });
          if (!created.ok) throw new Error(created.error.message);
          mission = created.value;
          const linked = await updateMission(mission.id, { lessonId: source.lessonId });
          if (!linked.ok) throw new Error(linked.error.message);
          const lessonLinked = await updateLesson(source.lessonId, { missionId: mission.id });
          if (!lessonLinked.ok) throw new Error(lessonLinked.error.message);
          loaded = lessonLinked.value;
          await transitionMission(mission.id, 'LEARNING');
        } else if (mission.state === 'DRAFT') {
          await transitionMission(mission.id, 'LEARNING');
        }
        const segments = await listTranscript(loaded.id);
        if (cancelled) return;
        setLesson(loaded); setActiveSource(source); setSkillName(source.title); setSourceCount(segments.length > 0 ? 1 : 0);
        if (segments.length > 0) {
          const preview = await previewQuickSkill(loaded.id);
          if (!preview.ok) throw new Error(preview.error.message);
          setDraft(preview.value); setKept(new Set(preview.value.steps.map((_, index) => index))); setDigest(digestSegments(segments)); setStage('review');
        } else {
          setSourceChoice(source.kind === 'youtube' ? requestedSourceChoice : requestedSourceChoice === 'paste' ? 'paste' : null);
          setStage('transcript');
        }
        await refresh();
      } catch (thrown) { if (!cancelled) setError(plainQuickError((thrown as Error).message)); }
      finally { if (!cancelled) setBusy(false); }
    })();
    return () => { cancelled = true; };
  }, [activeWorkspace?.id, refresh, requestedSourceChoice, sourceId]);

  async function withBusy<T>(work: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await work();
    } catch (thrown) {
      setError(plainQuickError((thrown as Error).message));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function handleSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const material = String(data.get('material') ?? '').trim();
    if (!material) { setError('Paste a link or text to continue.'); return; }
    await withBusy(async () => {
      let workspaceId = activeWorkspace?.id;
      if (!workspaceId) {
        const created = await createWorkspace({ name: 'My skills' });
        if (!created.ok) throw new Error(created.error.message);
        workspaceId = created.value.id;
      }
      const materialKind = classifyQuickSkillMaterial(material);
      const url = materialKind === 'raw' ? null : new URL(material);
      const isUrl = materialKind !== 'raw';
      const isYouTube = materialKind === 'youtube';
      const source = await createSource({
        workspaceId,
        kind: isUrl ? (isYouTube ? 'youtube' : 'article') : 'note',
        title: isYouTube ? 'YouTube video' : isUrl ? `Article from ${url!.hostname.replace(/^www\./, '')}` : 'Pasted notes',
        ...(isUrl ? { url: material, permissionAcknowledged: true } : { content: material, contentFormat: 'plain' as const }),
      });
      if (!source.ok) throw new Error(source.error.message);
      const mission = await createMission({
        workspaceId,
        title: source.value.title,
        objective: 'Turn this material into an approved, portable skill.',
        definitionOfDone: ['Skill approved at the exact version you reviewed', 'Checks pass'],
      });
      if (!mission.ok) throw new Error(mission.error.message);
      const linkedMission = await updateMission(mission.value.id, { lessonId: source.value.lessonId });
      if (!linkedMission.ok) throw new Error(linkedMission.error.message);
      const loaded = await updateLesson(source.value.lessonId, { missionId: mission.value.id });
      if (!loaded.ok) throw new Error(loaded.error.message);
      await transitionMission(mission.value.id, 'LEARNING');
      setActiveSource(source.value);
      setSkillName('');
      setLesson(loaded.value);
      if (!isUrl) {
        const preview = await previewQuickSkill(loaded.value.id);
        if (!preview.ok) throw new Error(preview.error.message);
        setDraft(preview.value);
        setKept(new Set(preview.value.steps.map((_, index) => index)));
        setDigest(digestSegments(await listTranscript(loaded.value.id)));
        setSourceCount(1);
        setSources([{ title: source.value.title, summary: summarizeText(material), segmentCount: (await listTranscript(loaded.value.id)).length, kind: 'paste' }]);
        setStage('review');
      } else {
        setSourceChoice(null);
        setStage('transcript');
      }
      await refresh();
    });
  }

  async function importText(text: string, source: HumanTranscriptSource, fileName?: string, requestedMode?: 'replace' | 'append') {
    await withBusy(async () => {
      if (!activeSource || !lesson) throw new Error('Choose a source before importing a transcript.');
      const mode = requestedMode ?? transcriptImportMode((await listTranscript(lesson.id)).length > 0, 0);
      const imported = await importSourceTranscript(activeSource.id, text, source, fileName, 'human', mode);
      if (!imported.ok) throw new Error(imported.error.message);
      setSourceCount((count) => count + 1);
      setSources((current) => [
        ...current,
        {
          title: fileName ?? `Pasted text ${current.length + 1}`,
          summary: summarizeText(text),
          segmentCount: imported.value.segmentCount,
          kind: fileName ? 'file' : 'paste',
        },
      ]);
      const preview = await previewQuickSkill(lesson!.id);
      if (!preview.ok) throw new Error(preview.error.message);
      setDraft(preview.value);
      setKept(new Set(preview.value.steps.map((_, index) => index)));
      setDigest(digestSegments(await listTranscript(lesson!.id)));
      setAddingSource(false);
      setStage('review');
      setActiveSource(imported.value.source);
    });
  }

  async function importFiles(files: FileList) {
    if (!lesson) { setError('Choose a source before importing transcript files.'); return; }
    // Re-read persisted state after each attempt. A malformed first file must
    // not force the next valid file into append mode against an empty lesson.
    for (const file of Array.from(files)) {
      const text = await file.text();
      const hasPersistedTranscript = (await listTranscript(lesson.id)).length > 0;
      await importText(text, 'user_upload', file.name, transcriptImportMode(hasPersistedTranscript, 0));
    }
  }

  async function handleRunnerFetch() {
    await withBusy(async () => {
      if (!activeSource?.url) throw new Error('Start with an article first.');
      if (activeSource.kind !== 'article') throw new Error('Only public articles can be fetched by the runner.');
      const queued = await requestSourceFetch(activeSource.id);
      if (!queued.ok) throw new Error(queued.error.message);
      setActiveSource(queued.value);
      let terminalFailure: SourceFetchFailure | null = null;
      let fetchCompleted = false;
      try {
        if (!lesson?.missionId) throw new Error('This article is not linked to a project. Start again.');
        const domain = new URL(queued.value.url!).hostname;
        const job = await submitRunnerJob({
        workspaceId: queued.value.workspaceId,
        missionId: lesson.missionId,
        adapter: 'scrapling-fetch',
        input: { url: queued.value.url, allowedDomains: [domain], maxBytes: 262144, respectRobots: true },
        idempotencyKey: `source-fetch:${queued.value.id}:${Date.now()}`,
        });
        if (!job.ok) throw new Error(job.error.message);
        for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        const status = await pollRunnerJob(job.value.jobId);
        if (!status.ok) throw new Error(status.error.message);
        const outcome = await interpretSourceFetchOutcome(status.value);
        if (outcome.kind === 'pending') continue;
        if (outcome.kind === 'failure') {
          terminalFailure = { status: outcome.status, reason: outcome.reason };
          throw new Error(outcome.reason);
        }
        const completed = await completeSourceFetch(queued.value.id, { markdown: outcome.markdown, contentHash: outcome.contentHash });
        if (!completed.ok) throw new Error(completed.error.message);
        fetchCompleted = true;
        const loaded = await getLesson(completed.value.lessonId);
        if (!loaded) throw new Error('The saved material is unavailable.');
        setActiveSource(completed.value);
        setLesson(loaded);
        const preview = await previewQuickSkill(loaded.id);
        if (!preview.ok) throw new Error(preview.error.message);
        setDraft(preview.value);
        setKept(new Set(preview.value.steps.map((_, index) => index)));
        setDigest(digestSegments(await listTranscript(loaded.id)));
        setSourceCount(1);
        setStage('review');
        return;
        }
        const timeout = await interpretSourceFetchOutcome({ status: 'timed_out' });
        if (timeout.kind !== 'failure') throw new Error('The local fetch timed out after 30 seconds.');
        terminalFailure = { status: timeout.status, reason: timeout.reason };
        throw new Error(timeout.reason);
      } catch (thrown) {
        const message = (thrown as Error).message || 'The local fetch failed.';
        if (!fetchCompleted) await failSourceFetch(queued.value.id, terminalFailure ?? { status: 'failed', reason: message });
        throw thrown;
      }
    });
  }

  function fillTranscript(text: string, source: HumanTranscriptSource = 'user_text') {
    setTranscriptSource(source);
    if (transcriptRef.current) {
      transcriptRef.current.value = text;
      transcriptRef.current.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  async function handleAutoFile(file: File) {
    setError(null);
    try {
      const text = await transcribeMediaFile(file, setAutoProgress);
      fillTranscript(text, 'local_transcription');
    } catch (thrown) {
      setAutoProgress(null);
      setError(`On-device transcription failed: ${(thrown as Error).message}`);
    }
  }

  async function handleCaptureToggle() {
    setError(null);
    if (capturing && captureRef.current) {
      captureRef.current.stop();
      return;
    }
    try {
      const capture = await startTabAudioCapture();
      captureRef.current = capture;
      setCapturing(true);
      setAutoProgress({ phase: 'transcribing', fraction: null, detail: 'Recording this tab. Play the video (1x keeps timestamps aligned), then press Stop.' });
      const blob = await capture.result;
      setCapturing(false);
      captureRef.current = null;
      const pcm = await decodeToMono16k(await blob.arrayBuffer());
      const text = await transcribePcm(pcm, setAutoProgress);
      fillTranscript(text, 'local_transcription');
    } catch (thrown) {
      setCapturing(false);
      captureRef.current = null;
      setAutoProgress(null);
      setError(`Tab capture failed: ${(thrown as Error).message}`);
    }
  }

  async function handleGenerate() {
    await withBusy(async () => {
      const generated = await generateSkillFromLesson({
        lessonId: lesson!.id,
        ...(skillName.trim() ? { name: skillName } : {}),
        keepStepIndices: [...kept],
      });
      if (!generated.ok) throw new Error(generated.error.message);

      // Human approval: you just reviewed the exact steps on this screen.
      const request = await requestSkillGraphApproval(generated.value.graph.id, 'Reviewed in Quick Skill', 'user', 'human');
      if (!request.ok) throw new Error(request.error.message);
      const decided = await decideSkillGraphApproval(request.value.approval.id, 'approved', 'user');
      if (!decided.ok) throw new Error(decided.error.message);
      setGraph(decided.value.graph);

      // Deterministic verification + receipt on the real mission.
      if (lesson!.missionId) {
        await transitionMission(lesson!.missionId, 'PLANNING', 'system');
        await transitionMission(lesson!.missionId, 'AWAITING_APPROVAL', 'system');
        await transitionMission(lesson!.missionId, 'EXECUTING', 'system');
        await transitionMission(lesson!.missionId, 'VERIFYING', 'system');
        const verified = await runVerification({ missionId: lesson!.missionId });
        if (verified.ok) {
          setVerifyNote(
            `${verified.value.status} · ${verified.value.totalAssertions - verified.value.blockingFailures}/${verified.value.totalAssertions} assertions`,
          );
          if (verified.value.status === 'passed') {
            await transitionMission(lesson!.missionId, 'COMPLETE', 'system');
            await createProofReceipt(lesson!.missionId);
          }
        }
      }
      setStage('ready');
      await refresh();
    });
  }

  async function handleStudioOutput(kind: 'briefing' | 'study-guide' | 'faq') {
    await withBusy(async () => {
      if (!draft || !digest || !lesson) throw new Error('Add a source first');
      const builders = { briefing: buildBriefingDoc, 'study-guide': buildStudyGuide, faq: buildFaq } as const;
      const markdown = builders[kind](lesson.title, sources, digest, draft);

      // Real artifact: written into the mission's file workspace, then downloaded.
      let note = 'downloaded';
      if (lesson.missionId) {
        const mission = await getMission(lesson.missionId);
        if (mission) {
          let artifactSetId = mission.artifactSetId ?? null;
          if (!artifactSetId) {
            const created = await createArtifactSet(mission.workspaceId, mission.id, `${mission.title} outputs`);
            if (created.ok) {
              artifactSetId = created.value.id;
              const { updateMission } = await import('../../cherry/mission/mission-service.ts');
              await updateMission(mission.id, { artifactSetId });
            }
          }
          if (artifactSetId) {
            const written = await writeArtifactFile(artifactSetId, `${kind}.md`, markdown, 'system', `Generated ${kind} from sources`);
            if (written.ok) note = `saved to the project files (r${written.value.revision}) and downloaded`;
          }
        }
      }
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${kind}.md`;
      anchor.click();
      URL.revokeObjectURL(url);
      setOutputNote(`${kind}.md ${note}.`);
    });
  }

  async function handleDownload() {
    await withBusy(async () => {
      const bundle = await compileSkillBundle(graph!.id);
      if (!bundle.ok) throw new Error(bundle.error.message);
      const url = URL.createObjectURL(bundle.value.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = bundle.value.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      setBundleNote(`${bundle.value.fileName} · ${bundle.value.fileList.length} files · sha256 ${bundle.value.sha256.slice(0, 12)}…`);
    });
  }

  function teachAnother() {
    captureRef.current?.stop();
    setStage('source'); setError(null); setLesson(null); setActiveSource(null); setDraft(null); setKept(new Set()); setGraph(null); setVerifyNote(null); setBundleNote(null); setSourceCount(0); setSources([]); setDigest(null); setOutputNote(null); setAddingSource(false); setSourceChoice(null); setTranscriptSource('user_text'); setAutoProgress(null); setCapturing(false);
    navigate('/studio/quick');
  }

  const stageIndex = ['source', 'transcript', 'review', 'ready'].indexOf(stage);

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)', maxWidth: 900 }}>
      <header className="stack" style={{ gap: 'var(--sp-2)' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <div className="stack" style={{ gap: 'var(--sp-2)' }}>
            <h1 className="display-sm">Quick Skill</h1>
            <p className="subhead">
              Turn material you chose into a method you can read, approve, and use.
            </p>
          </div>
          {stage === 'source' ? <AddToCherry /> : null}
        </div>
        <div className="row" data-testid="quick-stages">
          {['Source', 'Transcript', 'Review & approve', 'Install'].map((label, index) => (
            <span key={label} className={index === stageIndex ? 'sticker sticker-cherry' : index < stageIndex ? 'sticker sticker-pass' : 'sticker'}>
              {index < stageIndex ? <>{Icons.check(14)} </> : null}{index + 1} · {label}
            </span>
          ))}
        </div>
      </header>

      {error ? <p className="field-error" role="alert">{error}</p> : null}

      {stage === 'source' ? (
        <form onSubmit={handleSource} className="card stack" style={{ gap: 'var(--sp-4)' }}>
          <label className="field">
            <span>Paste a YouTube link, an article link, or raw text.</span>
            <textarea ref={materialRef} className="textarea" name="material" autoFocus required style={{ minHeight: 160 }} />
          </label>
          <p className="label" style={{ margin: 0 }}>By continuing, you confirm you may use this material. Cherry records this acknowledgement; it does not verify ownership.</p>
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ alignSelf: 'flex-start' }} data-testid="quick-source-next">
            {busy ? 'Preparing…' : 'Create a skill'}
          </button>
        </form>
      ) : null}

      {stage === 'transcript' && lesson ? (
        <div className="stack" style={{ gap: 'var(--sp-4)' }}>
          {sourceChoice === null && activeSource ? (
            <div className="card stack">
              {activeSource.kind === 'youtube' && lesson.videoId ? (
                <iframe
                  title={`YouTube player: ${activeSource.title}`}
                  src={embedUrl(lesson.videoId, window.location.origin)}
                  style={{ width: '100%', aspectRatio: '16 / 9', border: 'none', display: 'block' }}
                  allow="accelerometer; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              ) : null}
              <h2 className="subhead">Choose how to add the material</h2>
              <SourceMaterialChoices
                onPasteTranscript={() => setSourceChoice('paste')}
                {...(activeSource.kind === 'youtube' ? { onTranscribeWhilePlaying: () => setSourceChoice('transcribe') } : {})}
                {...(activeSource.kind === 'article' && runnerReady ? { onRunnerFetch: () => void handleRunnerFetch() } : {})}
                busy={busy}
              />
            </div>
          ) : null}
          {sourceChoice !== null ? <>
          {lesson.kind === 'youtube' && lesson.videoId ? (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <iframe
                ref={wizardPlayerRef}
                title={`YouTube player: ${lesson.title}`}
                src={embedUrl(lesson.videoId, window.location.origin)}
                style={{ width: '100%', aspectRatio: '16 / 9', border: 'none', display: 'block' }}
                allow="accelerometer; encrypted-media; picture-in-picture"
                allowFullScreen
              />
              <div className="row" style={{ padding: 'var(--sp-2) var(--sp-3)' }} aria-label="Playback speed">
                <span className="label">Watch faster</span>
                {[1, 1.5, 2, 3].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      wizardPlayerRef.current?.contentWindow?.postMessage(
                        JSON.stringify({ event: 'command', func: 'setPlaybackRate', args: [rate] }),
                        '*',
                      )
                    }
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {sourceChoice === 'transcribe' ? <div className="card card-wash-lavender stack" data-testid="auto-transcribe">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 className="subhead">Auto-transcribe on this device</h2>
              <span className="sticker">no key · audio never leaves this machine</span>
            </div>
            <p style={{ fontSize: 14, margin: 0 }}>
              Whisper (tiny) runs in your browser — WebGPU when available. It downloads once (~40 MB),
              then works offline. The result is a <strong>draft</strong>: small models mishear, so review
              the text before creating the skill. Pasting the official transcript preserves its original wording.
            </p>
            <div className="row">
              <button type="button" className={capturing ? 'btn btn-danger' : 'btn'} onClick={() => void handleCaptureToggle()} data-testid="capture-tab-audio">
                {capturing ? 'Stop and transcribe' : 'Capture tab audio'}
              </button>
              <label className="btn">
                Transcribe file
                <input
                  type="file"
                  accept="audio/*,video/*"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void handleAutoFile(file);
                  }}
                />
              </label>
            </div>
            {autoProgress ? (
              <p className="sticker sticker-wait" role="status" style={{ whiteSpace: 'normal' }}>
                {autoProgress.detail}
              </p>
            ) : null}
            <p className="label" style={{ margin: 0 }}>
              Capture flow: press capture, choose this tab and tick "share tab audio", play the video, stop.
              Cherry never touches YouTube data — it transcribes your own playback, locally.
            </p>
          </div> : null}

          <div className="card card-wash-sky stack">
            <h2 className="subhead">Paste the transcript or captions</h2>
            <p style={{ fontSize: 14, margin: 0 }}>
              On YouTube: open the video → description → <strong>Show transcript</strong> → click the
              ⋮ menu → toggle timestamps if you like → select all → copy. Paste it here. Plain notes
              work too — Cherry parses .txt/.srt/.vtt and timestamped lines.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const text = String(new FormData(event.currentTarget).get('transcript') ?? '');
                void importText(text, transcriptSource);
              }}
              className="stack"
            >
              <label className="field"><span>Transcript or captions</span><textarea ref={transcriptRef} className="textarea" name="transcript" required style={{ minHeight: 180 }} placeholder={'0:05 Create a new frame for the hero section\n0:40 Always keep the heading a real h1\n1:10 Add the navigation bar…'} data-testid="quick-transcript" /></label>
              <div className="row">
                <button type="submit" className="btn btn-primary" disabled={busy} data-testid="quick-transcript-next">
                  {busy ? 'Preparing…' : 'Review the method'}
                </button>
                <label className="btn">
                  Upload files
                  <input
                    type="file"
                    accept=".txt,.srt,.vtt,text/plain"
                    multiple
                    className="sr-only"
                    data-testid="quick-files"
                    onChange={(event) => {
                      const files = event.currentTarget.files;
                      if (files && files.length > 0) void importFiles(files);
                    }}
                  />
                </label>
              </div>
            </form>
          </div>
          </> : null}
        </div>
      ) : null}

      {stage === 'review' && draft ? (
        <div className="notebook-grid" data-testid="notebook">
          {/* ---- Sources pane ---- */}
          <section className="card card-wash-sky stack" aria-labelledby="sources-heading" style={{ alignSelf: 'start', gap: 'var(--sp-3)' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 id="sources-heading" className="kicker" style={{ fontSize: 14 }}>Sources</h2>
              <span className="sticker">{sources.length}</span>
            </div>
            {addingSource ? (
              <form
                className="stack"
                style={{ gap: 'var(--sp-2)' }}
                onSubmit={(event) => {
                  event.preventDefault();
                  const text = String(new FormData(event.currentTarget).get('transcript') ?? '');
                  void importText(text, 'user_text');
                }}
              >
                <label className="field">
                  <span>Another transcript, note, or document</span>
                  <textarea
                    className="textarea"
                    name="transcript"
                    required
                    style={{ minHeight: 120 }}
                    placeholder="Paste another transcript, note, or document"
                    data-testid="quick-transcript"
                  />
                </label>
                <div className="row">
                  <button type="submit" className="btn btn-sm" disabled={busy} data-testid="quick-transcript-next">
                    {busy ? 'Adding…' : 'Add to notebook'}
                  </button>
                  <label className="btn btn-sm">
                    Upload files
                    <input
                      type="file"
                      accept=".txt,.srt,.vtt,text/plain"
                      multiple
                      className="sr-only"
                      onChange={(event) => {
                        const files = event.currentTarget.files;
                        if (files && files.length > 0) void importFiles(files);
                      }}
                    />
                  </label>
                  <button type="button" className="btn btn-sm" onClick={() => setAddingSource(false)}>Cancel</button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setAddingSource(true)}
                data-testid="quick-add-source"
                style={{ justifyContent: 'center' }}
              >
                + Add source
              </button>
            )}
            {sources.map((source, index) => (
              <div key={index} className="card stack" style={{ padding: 'var(--sp-3)', gap: 4 }} data-testid="source-card">
                <strong style={{ fontSize: 14, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  {source.kind === 'file' ? Icons.download(14) : Icons.copy(14)} {source.title}
                </strong>
                <span style={{ fontSize: 13, color: 'var(--color-ink-soft)' }}>{source.summary}</span>
                <span className="label">{source.segmentCount} segments</span>
              </div>
            ))}
            <p className="label" style={{ margin: 0 }}>
              Outside content stays untrusted until you review it.
            </p>
          </section>

          {/* ---- Overview pane ---- */}
          <div className="stack" style={{ gap: 'var(--sp-4)', minWidth: 0 }}>
            <section className="card stack" style={{ gap: 4, padding: 'var(--sp-4)' }}>
              <p className="kicker" style={{ fontSize: 12 }}>Notebook</p>
              <h2 className="subhead" style={{ fontSize: 22, margin: 0 }}>{skillName.trim() || lesson?.title || 'Untitled notebook'}</h2>
              <span className="label" style={{ textTransform: 'none', letterSpacing: 0 }}>
                {sources.length} {sources.length === 1 ? 'source' : 'sources'} · {digest?.wordCount ?? 0} words added · named for you
              </span>
            </section>
            {digest ? (
              <section className="card stack" aria-labelledby="overview-heading" data-testid="notebook-overview">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h2 id="overview-heading" className="subhead" style={{ fontSize: 20 }}>Overview</h2>
                  <span className="sticker sticker-pass">instant · no model · no key</span>
                </div>
                {digest.summary.map((sentence, index) => (
                  <p key={index} style={{ margin: 0, fontSize: 15 }}>{sentence}</p>
                ))}
                <div className="row" data-testid="notebook-topics">
                  {digest.topics.map((topic) => (
                    <span key={topic} className="sticker sticker-lavender">{topic}</span>
                  ))}
                </div>
                {suggestedChecks(draft, digest).length > 0 ? (
                  <details>
                    <summary className="label">Things to check ({suggestedChecks(draft, digest).length})</summary>
                    <ul style={{ marginTop: 8 }}>
                      {suggestedChecks(draft, digest).map((check, index) => (
                        <li key={index} style={{ fontSize: 14 }}>{check}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                <p className="label" style={{ margin: 0 }}>
                  Every sentence above is copied from your sources and links back to where it came from.
                </p>
              </section>
            ) : null}

            <section className="card stack" aria-labelledby="steps-heading">
              <h2 id="steps-heading" className="subhead" style={{ fontSize: 20 }}>
                Review the method ({kept.size} of {draft.steps.length} steps kept{sourceCount > 1 ? ` · ${sourceCount} sources` : ''})
              </h2>
              <ol className="stack" style={{ margin: 0, paddingLeft: 'var(--sp-5)' }} data-testid="quick-steps">
                {draft.steps.map((step, index) => (
                  <li key={index}>
                    <label className="row" style={{ alignItems: 'flex-start' }}>
                      <input
                        type="checkbox"
                        checked={kept.has(index)}
                        onChange={(event) => {
                          const next = new Set(kept);
                          if (event.currentTarget.checked) next.add(index);
                          else next.delete(index);
                          setKept(next);
                        }}
                        style={{ width: 20, height: 20, marginTop: 2 }}
                      />
                      <span>
                        <strong>{step.title}</strong>{' '}
                        <span className="sticker" style={{ padding: '1px 8px' }}>{step.kind} · {Math.floor(step.timestampSeconds / 60)}:{String(Math.floor(step.timestampSeconds % 60)).padStart(2, '0')}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ol>
              <div className="row">
                <button type="button" className="btn btn-primary" onClick={() => void handleGenerate()} disabled={busy || kept.size === 0} data-testid="quick-generate">
                  {Icons.approve(16)} {busy ? 'Approving…' : 'Approve this version'}
                </button>
                <span className="label">This records the exact version you reviewed. Agents can ask, not act.</span>
              </div>
            </section>
          </div>

          {/* ---- Studio pane ---- */}
          <section className="card card-wash-lavender stack" aria-labelledby="studio-heading" style={{ alignSelf: 'start' }}>
            <h2 id="studio-heading" className="subhead" style={{ fontSize: 20 }}>Studio</h2>
            <p style={{ fontSize: 13, margin: 0 }}>
              One-click documents built from your sources. Saved as real files and downloaded.
            </p>
            <button type="button" className="studio-card" onClick={() => void handleStudioOutput('briefing')} disabled={busy} data-testid="studio-briefing">
              <span className="studio-card-title">{Icons.proof(15)} Briefing doc</span>
              <span className="studio-card-sub">The source as a story, linked to timestamps</span>
            </button>
            <button type="button" className="studio-card" onClick={() => void handleStudioOutput('study-guide')} disabled={busy} data-testid="studio-guide">
              <span className="studio-card-title">{Icons.memory(15)} Study guide</span>
              <span className="studio-card-sub">Practice checklist + review questions</span>
            </button>
            <button type="button" className="studio-card" onClick={() => void handleStudioOutput('faq')} disabled={busy} data-testid="studio-faq">
              <span className="studio-card-title">{Icons.skills(15)} FAQ</span>
              <span className="studio-card-sub">Answers pulled straight from your sources</span>
            </button>
            {outputNote ? <p className="sticker sticker-pass" role="status" style={{ whiteSpace: 'normal' }}>{outputNote}</p> : null}
          </section>
        </div>
      ) : null}

      {stage === 'ready' && graph ? (
        <div className="card card-wash-mint stack" style={{ gap: 'var(--sp-4)' }} data-testid="quick-ready">
          <div className="row">
            <CherryMascot pose="stamp" size={110} />
            <div className="stack" style={{ gap: 'var(--sp-2)', flex: 1, minWidth: 220 }}>
              <h2 className="subhead">{graph.name} — approved & ready</h2>
              <div className="row">
                <span className="sticker sticker-pass stamp-in">approved r{graph.approvedRevision} by you</span>
                {verifyNote ? <span className="sticker sticker-pass verify-pop">Checks: {verifyNote}</span> : null}
                <span className="sticker">{graph.nodes.length} steps</span>
              </div>
            </div>
          </div>
          <div className="stack" style={{ alignItems: 'flex-start' }}>
            <Link to={`/studio/skills/${graph.id}`} className="btn btn-primary">Open Library</Link>
            <div className="row" style={{ gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
              <Link to={buildRoutineDraftUrl(graph.workspaceId, graph.id)} className="btn">Use in routine</Link>
              <a href={buildConnectUrl(graph.targets)} className="btn">Send to agent</a>
            </div>
            <button type="button" className="btn" onClick={teachAnother}>Teach another</button>
            <button type="button" className="btn" onClick={() => void handleLoadStarterLibrary()} disabled={busy} data-testid="quick-load-starter-library">
              Load sample library
            </button>
            <p className="label" style={{ margin: 0 }}>
              Labelled reference data. Its approval state is not your decision.
            </p>
            <div className="row">
              <button type="button" className="btn btn-sm" onClick={() => void handleDownload()} disabled={busy} data-testid="quick-download">
                {Icons.download(16)} Download bundle
              </button>
              <button type="button" className="btn btn-sm" onClick={() => navigate('/studio/proof')}>See proof</button>
            </div>
          </div>
          {bundleNote ? <p className="sticker sticker-pass" role="status">{bundleNote}</p> : null}
          <div className="stack" style={{ gap: 'var(--sp-2)' }}>
            <h3 className="label">Install it</h3>
            <p style={{ fontSize: 14, margin: 0 }}>Use the Library to download or connect this approved skill where you need it.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
