import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  deleteArtifactFile,
  getArtifactSet,
  listArtifactFiles,
  writeArtifactFile,
} from '../../cherry/artifacts/artifact-service.ts';
import type { ArtifactFile, ArtifactSet } from '../../cherry/artifacts/artifact-model.ts';
import { buildPreviewDocument, parsePreviewMessage, PREVIEW_SANDBOX, type PreviewMessage } from '../../cherry/artifacts/preview-protocol.ts';
import { appendProofEvents } from '../../cherry/persistence/transactions.ts';

export default function Artifacts() {
  const { artifactSetId } = useParams<{ artifactSetId: string }>();
  const [artifactSet, setArtifactSet] = useState<ArtifactSet | null>(null);
  const [files, setFiles] = useState<ArtifactFile[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[]>([]);
  const [previewNonce, setPreviewNonce] = useState(0);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);

  const load = useCallback(async () => {
    if (!artifactSetId) return;
    const loadedSet = await getArtifactSet(artifactSetId);
    setArtifactSet(loadedSet ?? null);
    if (loadedSet) {
      const loadedFiles = await listArtifactFiles(loadedSet.id);
      setFiles(loadedFiles);
      if (!selectedPath && loadedFiles.length > 0) {
        setSelectedPath(loadedFiles[0]!.path);
        setDraft(loadedFiles[0]!.content);
      }
    }
  }, [artifactSetId, selectedPath]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Only the sandboxed srcdoc preview may report here: opaque origin ('null')
      // and a source that is the preview iframe's own contentWindow.
      if (event.origin !== 'null') return;
      if (event.source !== previewFrameRef.current?.contentWindow) return;
      const message = parsePreviewMessage(event.data);
      if (!message) return;
      setPreviewMessages((current) => [...current.slice(-19), message]);
      if (message.kind === 'error' && artifactSet) {
        void appendProofEvents(artifactSet.workspaceId, [
          {
            type: 'artifact.preview_error',
            actorType: 'system',
            objectType: 'artifact-set',
            objectId: artifactSet.id,
            summary: `Preview error: ${message.message.slice(0, 160)}`,
          },
        ]);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [artifactSet]);

  const selectedFile = files.find((file) => file.path === selectedPath) ?? null;
  const entryFile = useMemo(
    () => files.find((file) => file.path === (artifactSet?.entryPath ?? 'index.html')) ?? files.find((file) => file.mediaType === 'text/html') ?? null,
    [files, artifactSet],
  );
  const previewDoc = useMemo(
    () => (entryFile ? buildPreviewDocument(entryFile, files) : null),
    // previewNonce forces a re-render of the iframe after saves.
    [entryFile, files, previewNonce],
  );

  if (!artifactSet) {
    return (
      <div className="empty-state">
        <p className="subhead">Artifact set not found.</p>
        <Link to="/studio" className="btn">Back to Command Center</Link>
      </div>
    );
  }

  async function handleSave() {
    if (!selectedPath) return;
    setError(null);
    const result = await writeArtifactFile(artifactSet!.id, selectedPath, draft, 'human', 'Edited in the file workspace');
    if (!result.ok) setError(result.error.message);
    setPreviewNonce((nonce) => nonce + 1);
    setPreviewMessages([]);
    await load();
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const path = String(new FormData(form).get('path') ?? '').trim();
    const result = await writeArtifactFile(artifactSet!.id, path, '', 'human', 'File created');
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    form.reset();
    setSelectedPath(result.value.path);
    setDraft('');
    await load();
  }

  async function handleDelete(path: string) {
    setError(null);
    const confirmed = window.confirm(`Delete ${path}? Its versions stay in history but the file is removed.`);
    if (!confirmed) return;
    const result = await deleteArtifactFile(artifactSet!.id, path);
    if (!result.ok) setError(result.error.message);
    if (selectedPath === path) {
      setSelectedPath(null);
      setDraft('');
    }
    await load();
  }

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <header className="row" style={{ justifyContent: 'space-between' }}>
        <div className="stack" style={{ gap: 4 }}><h1 className="display-sm">{artifactSet.name}</h1><p className="label" style={{ margin: 0 }}>Real files your mission produces — versioned, hashed, previewed in a sealed sandbox</p></div>
        <Link to={`/studio/missions/${artifactSet.missionId}`} className="btn">Back to mission</Link>
      </header>
      {error ? <p className="field-error" role="alert">{error}</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: '240px minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--sp-4)' }} className="artifact-grid">
        <section className="card stack" aria-labelledby="tree-heading">
          <h2 id="tree-heading" className="subhead">Files</h2>
          <form onSubmit={handleCreate} className="stack">
            <input className="input" name="path" placeholder="new/file.html" required />
            <button type="submit" className="btn btn-sm">Create file</button>
          </form>
          <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {files.map((file) => (
              <li key={file.id} className="row" style={{ justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ background: file.path === selectedPath ? 'var(--color-carbon)' : undefined, color: file.path === selectedPath ? '#fff' : undefined, textTransform: 'none', letterSpacing: 0 }}
                  onClick={() => {
                    setSelectedPath(file.path);
                    setDraft(file.content);
                  }}
                >
                  {file.path}
                </button>
                <button type="button" className="btn btn-sm" aria-label={`Delete ${file.path}`} onClick={() => void handleDelete(file.path)}>✕</button>
              </li>
            ))}
            {files.length === 0 ? <li>No files yet.</li> : null}
          </ul>
        </section>

        <section className="card stack" aria-labelledby="editor-heading">
          <h2 id="editor-heading" className="subhead">
            {selectedFile ? `${selectedFile.path} · r${selectedFile.revision}` : 'Editor'}
          </h2>
          {selectedFile ? (
            <>
              <label className="field">
                <span className="sr-only">File content</span>
                <textarea
                  className="code-editor"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  spellCheck={false}
                  data-testid="artifact-editor"
                />
              </label>
              <div className="row">
                <button type="button" className="btn btn-primary" onClick={() => void handleSave()} data-testid="save-artifact">
                  Save (r{selectedFile.revision + 1})
                </button>
                <span className="mono">sha256 {selectedFile.sha256.slice(0, 16)}… · {selectedFile.sizeBytes} bytes · by {selectedFile.updatedBy}</span>
              </div>
            </>
          ) : (
            <p>Select or create a file.</p>
          )}
        </section>

        <section className="card stack" aria-labelledby="preview-heading">
          <h2 id="preview-heading" className="subhead">Isolated preview</h2>
          {previewDoc ? (
            <>
              <iframe
                key={previewNonce}
                ref={previewFrameRef}
                title="Sandboxed artifact preview (network blocked)"
                sandbox={PREVIEW_SANDBOX}
                srcDoc={previewDoc}
                className="preview-frame"
                data-testid="artifact-preview"
              />
              <p className="label">Sandboxed · no network · no access to Cherry data</p>
              {previewMessages.length > 0 ? (
                <div className="stack" style={{ maxHeight: 140, overflowY: 'auto' }} aria-live="polite">
                  {previewMessages.map((message, index) => (
                    <div key={index} className={message.kind === 'error' ? 'field-error' : 'event-row'}>
                      <span className="mono">{message.kind}</span> {message.message}
                      {message.detail ? <span className="mono"> · {message.detail}</span> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p>No HTML entry file yet. Create {artifactSet.entryPath} to see the preview.</p>
          )}
        </section>
      </div>

      <style>{`@media (max-width: 1100px) { .artifact-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
