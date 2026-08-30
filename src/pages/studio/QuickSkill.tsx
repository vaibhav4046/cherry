import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { createMission, createWorkspace, transitionMission, updateMission } from '../../cherry/mission/mission-service.ts';
import { importTranscript, listTranscript, loadLesson } from '../../cherry/watch/lesson-service.ts';
import { embedUrl } from '../../cherry/watch/youtube-url.ts';
import { previewQuickSkill, generateSkillFromLesson } from '../../cherry/skillgraph/quick-skill.ts';
import { requestSkillGraphApproval, decideSkillGraphApproval } from '../../cherry/skillgraph/skillgraph-service.ts';
import { runVerification } from '../../cherry/verify/verification-service.ts';
import { compileSkillBundle } from '../../cherry/compiler/archive-builder.ts';
import { createProofReceipt } from '../../cherry/proof/proof-service.ts';
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

type Stage = 'source' | 'transcript' | 'review' | 'ready';

/**
 * Quick Skill: paste a YouTube link (or skip the video), paste the transcript,
 * and Cherry deterministically drafts the SkillGraph. You review the steps,
 * approve, and download an installable bundle — one screen, real records at
 * every stage, same domain services as the manual flow.
 */
export default function QuickSkill() {
  const { activeWorkspace, refresh } = useAppState();
  const navigate = useNavigate();
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

  async function withBusy<T>(work: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await work();
    } catch (thrown) {
      setError((thrown as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function handleSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const url = String(data.get('url') ?? '').trim();
    const name = String(data.get('name') ?? '').trim();
    const permission = data.get('permission') === 'on';
    await withBusy(async () => {
      let workspaceId = activeWorkspace?.id;
      if (!workspaceId) {
        const created = await createWorkspace({ name: 'My skills' });
        if (!created.ok) throw new Error(created.error.message);
        workspaceId = created.value.id;
      }
      const mission = await createMission({
        workspaceId,
        title: name || 'Quick skill (auto-named on generate)',
        objective: `Turn ${url ? 'a permitted video lesson' : 'lesson material'} into an approved, portable skill.`,
        definitionOfDone: ['SkillGraph approved at its reviewed revision', 'Verification passes'],
      });
      if (!mission.ok) throw new Error(mission.error.message);
      const loaded = await loadLesson({
        workspaceId,
        missionId: mission.value.id,
        title: name || 'Quick lesson',
        kind: url ? 'youtube' : 'manual',
        ...(url ? { url } : {}),
        permissionAcknowledged: permission,
      });
      if (!loaded.ok) throw new Error(loaded.error.message);
      await updateMission(mission.value.id, { lessonId: loaded.value.id });
      await transitionMission(mission.value.id, 'LEARNING');
      setSkillName(name);
      setLesson(loaded.value);
      setStage('transcript');
      await refresh();
    });
  }

  async function importText(text: string, source: 'user_text' | 'user_upload', fileName?: string) {
    await withBusy(async () => {
      const mode = sourceCount === 0 ? 'replace' : 'append';
      const imported = await importTranscript(lesson!.id, text, source, fileName, 'human', mode);
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
    });
  }

  async function importFiles(files: FileList) {
    // NotebookLM-style: drop several sources at once; each one appends.
    for (const file of Array.from(files)) {
      const text = await file.text();
      await importText(text, 'user_upload', file.name);
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
      const request = await requestSkillGraphApproval(generated.value.graph.id, 'Reviewed in Quick Skill', 'user');
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
      if (!draft || !digest || !lesson) throw new Error('Ingest a source first');
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
            if (written.ok) note = `saved to the mission files (r${written.value.revision}) and downloaded`;
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

  const stageIndex = ['source', 'transcript', 'review', 'ready'].indexOf(stage);

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)', maxWidth: 900 }}>
      <header className="stack" style={{ gap: 'var(--sp-2)' }}>
        <h1 className="display-sm">Quick Skill</h1>
        <p className="subhead">
          Video link → transcript → skill. Cherry drafts the workflow deterministically from your
          transcript; you review, approve, and install. No API key involved.
        </p>
        <div className="row" data-testid="quick-stages">
          {['Source', 'Transcript', 'Review & approve', 'Install'].map((label, index) => (
            <span key={label} className={index === stageIndex ? 'sticker sticker-cherry' : index < stageIndex ? 'sticker sticker-pass' : 'sticker'}>
              {index < stageIndex ? '✓ ' : ''}{index + 1} · {label}
            </span>
          ))}
        </div>
      </header>

      {error ? <p className="field-error" role="alert">{error}</p> : null}

      {stage === 'source' ? (
        <form onSubmit={handleSource} className="card stack" style={{ gap: 'var(--sp-4)' }}>
          <label className="field">
            <span>YouTube link (leave blank for a manual lesson)</span>
            <input className="input" name="url" placeholder="https://youtu.be/…" inputMode="url" />
          </label>
          <label className="field">
            <span>Skill name</span>
            <input className="input" name="name" maxLength={120} placeholder="Leave blank — Cherry names it from the content" />
          </label>
          <label className="row" style={{ fontSize: 13 }}>
            <input type="checkbox" name="permission" style={{ width: 20, height: 20 }} />
            I am permitted to learn from this source, and I will not copy its branding or assets.
          </label>
          <p className="label">
            The video plays in the official YouTube player. Cherry never scrapes captions or media.
          </p>
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ alignSelf: 'flex-start' }} data-testid="quick-source-next">
            {Icons.quick(16)} {busy ? 'Setting up…' : 'Continue'}
          </button>
        </form>
      ) : null}

      {stage === 'transcript' && lesson ? (
        <div className="stack" style={{ gap: 'var(--sp-4)' }}>
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
          <div className="card card-wash-sky stack">
            <h2 className="subhead">Paste the transcript</h2>
            <p style={{ fontSize: 13, margin: 0 }}>
              On YouTube: open the video → description → <strong>Show transcript</strong> → click the
              ⋮ menu → toggle timestamps if you like → select all → copy. Paste it here. Plain notes
              work too — Cherry parses .txt/.srt/.vtt and timestamped lines.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const text = String(new FormData(event.currentTarget).get('transcript') ?? '');
                void importText(text, 'user_text');
              }}
              className="stack"
            >
              <textarea className="textarea" name="transcript" required style={{ minHeight: 180 }} placeholder={'0:05 Create a new frame for the hero section\n0:40 Always keep the heading a real h1\n1:10 Add the navigation bar…'} data-testid="quick-transcript" />
              <div className="row">
                <button type="submit" className="btn btn-primary" disabled={busy} data-testid="quick-transcript-next">
                  {busy ? 'Parsing…' : 'Derive the skill'}
                </button>
                <label className="btn">
                  Upload sources (.txt / .srt / .vtt — pick several)
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
        </div>
      ) : null}

      {stage === 'review' && draft ? (
        <div className="notebook-grid" data-testid="notebook">
          {/* ---- Sources pane ---- */}
          <section className="card card-wash-sky stack" aria-labelledby="sources-heading" style={{ alignSelf: 'start', gap: 'var(--sp-3)' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 id="sources-heading" className="kicker" style={{ fontSize: 13 }}>Sources</h2>
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
                <textarea
                  className="textarea"
                  name="transcript"
                  required
                  style={{ minHeight: 120 }}
                  placeholder="Paste another transcript, notes, or a doc…"
                  data-testid="quick-transcript"
                />
                <div className="row">
                  <button type="submit" className="btn btn-sm btn-primary" disabled={busy} data-testid="quick-transcript-next">
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
                className="btn btn-sm btn-primary"
                onClick={() => setAddingSource(true)}
                data-testid="quick-add-source"
                style={{ justifyContent: 'center' }}
              >
                + Add source
              </button>
            )}
            {sources.map((source, index) => (
              <div key={index} className="card stack" style={{ padding: 'var(--sp-3)', gap: 4 }} data-testid="source-card">
                <strong style={{ fontSize: 13, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  {source.kind === 'file' ? Icons.download(14) : Icons.copy(14)} {source.title}
                </strong>
                <span style={{ fontSize: 12, color: 'var(--color-ink-soft)' }}>{source.summary}</span>
                <span className="label">{source.segmentCount} segments</span>
              </div>
            ))}
            <p className="label" style={{ margin: 0 }}>
              Everything lands as untrusted, timestamped evidence.
            </p>
          </section>

          {/* ---- Overview pane ---- */}
          <div className="stack" style={{ gap: 'var(--sp-4)', minWidth: 0 }}>
            <section className="card stack" style={{ gap: 4, padding: 'var(--sp-4)' }}>
              <p className="kicker" style={{ fontSize: 11 }}>Notebook</p>
              <h2 className="subhead" style={{ fontSize: 22, margin: 0 }}>{skillName.trim() || lesson?.title || 'Untitled notebook'}</h2>
              <span className="label" style={{ textTransform: 'none', letterSpacing: 0 }}>
                {sources.length} {sources.length === 1 ? 'source' : 'sources'} · {digest?.wordCount ?? 0} words ingested · named for you
              </span>
            </section>
            {digest ? (
              <section className="card stack" aria-labelledby="overview-heading" data-testid="notebook-overview">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h2 id="overview-heading" className="subhead" style={{ fontSize: 20 }}>Overview</h2>
                  <span className="sticker sticker-pass">instant · no model · no key</span>
                </div>
                {digest.summary.map((sentence, index) => (
                  <p key={index} style={{ margin: 0, fontSize: 14 }}>{sentence}</p>
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
                        <li key={index} style={{ fontSize: 13 }}>{check}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                <p className="label" style={{ margin: 0 }}>
                  Every sentence above exists verbatim in your sources — extractive, deterministic, cited.
                </p>
              </section>
            ) : null}

            <section className="card stack" aria-labelledby="steps-heading">
              <h2 id="steps-heading" className="subhead" style={{ fontSize: 20 }}>
                Derived workflow ({kept.size} of {draft.steps.length} steps kept{sourceCount > 1 ? ` · ${sourceCount} sources` : ''})
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
                  {Icons.approve(16)} {busy ? 'Generating…' : `Generate & approve ${kept.size} steps`}
                </button>
                <span className="label">Approving records a real exact-revision approval by you.</span>
              </div>
            </section>
          </div>

          {/* ---- Studio pane ---- */}
          <section className="card card-wash-lavender stack" aria-labelledby="studio-heading" style={{ alignSelf: 'start' }}>
            <h2 id="studio-heading" className="subhead" style={{ fontSize: 20 }}>Studio</h2>
            <p style={{ fontSize: 12, margin: 0 }}>
              One-click documents built from your sources. Saved as real files in the mission workspace
              and downloaded.
            </p>
            <button type="button" className="studio-card" onClick={() => void handleStudioOutput('briefing')} disabled={busy} data-testid="studio-briefing">
              <span className="studio-card-title">{Icons.proof(15)} Briefing doc</span>
              <span className="studio-card-sub">The lesson as a story — cited, timestamped</span>
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
                <span className="sticker sticker-pass stamp-in">approved r{graph.approvedRevision} by user</span>
                {verifyNote ? <span className="sticker sticker-pass verify-pop">verify: {verifyNote}</span> : null}
                <span className="sticker">{graph.nodes.length} nodes</span>
              </div>
            </div>
          </div>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => void handleDownload()} disabled={busy} data-testid="quick-download">
              {Icons.download(16)} Download skill bundle (.zip)
            </button>
            <Link to={`/studio/skills/${graph.id}`} className="btn">Open in Skills</Link>
            <button type="button" className="btn" onClick={() => navigate('/studio/proof')}>See the receipt</button>
          </div>
          {bundleNote ? <p className="sticker sticker-pass" role="status">{bundleNote}</p> : null}
          <div className="stack" style={{ gap: 'var(--sp-2)' }}>
            <h3 className="label">Install it</h3>
            <p style={{ fontSize: 13, margin: 0 }}>
              <strong>Claude Code:</strong> unzip into <code className="mono">~/.claude/skills/</code> — the folder name
              is the skill name; Claude discovers SKILL.md automatically.{' '}
              <strong>Codex:</strong> follow <code className="mono">targets/codex/install.md</code> inside the bundle.{' '}
              <strong>ChatGPT (WebMCP):</strong> nothing to install — open this page in a compatible client and the
              tools attach live (see <Link to="/studio/agent">Agent View</Link>).
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
