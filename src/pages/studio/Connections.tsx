import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { clearPairToken, getStoredPairToken, pairRunner, runnerStatus, type RunnerStatus } from '../../cherry/runner-client/runner-api.ts';
import { deleteWorkspace } from '../../cherry/mission/mission-service.ts';
import { CopyButton } from '../../components/Icons.tsx';
import { AccountPanel } from '../../components/AccountPanel.tsx';
import {
  getArtifactHistoryStorage,
  purgeArtifactVersionContents,
  type ArtifactHistoryStorage,
} from '../../cherry/artifacts/artifact-service.ts';

function formatStorageBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024).toLocaleString('en-US')} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export default function Connections() {
  const { activeWorkspace, webmcp, refresh } = useAppState();
  const [runner, setRunner] = useState<RunnerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [artifactHistory, setArtifactHistory] = useState<ArtifactHistoryStorage | null>(null);

  useEffect(() => {
    void runnerStatus().then(setRunner);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!activeWorkspace) {
      setArtifactHistory(null);
      return;
    }
    void getArtifactHistoryStorage(activeWorkspace.id).then((storage) => {
      if (!cancelled) setArtifactHistory(storage);
    });
    return () => { cancelled = true; };
  }, [activeWorkspace]);

  async function handlePair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const token = String(new FormData(event.currentTarget).get('token') ?? '').trim();
    const result = await pairRunner(token);
    if (!result.ok) {
      setError(result.error.message);
    } else {
      setNotice('Runner connected for this session.');
    }
    setRunner(await runnerStatus());
  }

  async function handleDeleteWorkspace() {
    if (!activeWorkspace) return;
    const confirmed = window.confirm(
      `Delete space "${activeWorkspace.name}" and all of its projects, sources, evidence, skills, memories, files, and proof? This cannot be undone. Export it first if you want a copy.`,
    );
    if (!confirmed) return;
    const result = await deleteWorkspace(activeWorkspace.id);
    if (!result.ok) setError(result.error.message);
    await refresh();
  }

  async function handlePurgeArtifactHistory() {
    if (!activeWorkspace || !artifactHistory?.versionsWithContent) return;
    const confirmed = window.confirm(
      `Remove the stored contents of ${artifactHistory.versionsWithContent} file versions? Current files stay unchanged, and version hashes and proof remain. Old and deleted file contents cannot be restored. Export first if you need those bodies.`,
    );
    if (!confirmed) return;
    setError(null);
    setNotice(null);
    const result = await purgeArtifactVersionContents(activeWorkspace.id, 'human');
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setNotice(`Removed ${result.value.purgedVersions} stored file-version bodies. Current files and proof remain.`);
    setArtifactHistory(await getArtifactHistoryStorage(activeWorkspace.id));
  }

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <h1 className="display-sm">Connections & privacy</h1>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      {notice ? <p className="sticker sticker-pass" role="status">{notice}</p> : null}

      <div className="grid-cards">
        <section className="card stack" aria-labelledby="webmcp-heading">
          <h2 id="webmcp-heading" className="subhead">Agent connection</h2>
          {webmcp.supported ? (
            <>
              <p className="sticker sticker-pass">Connected · {webmcp.registered.length} tools available in this space</p>
              <details>
                <summary className="label">Connection details</summary>
                <ul className="stack" style={{ marginTop: 'var(--sp-2)' }}>
                  {webmcp.registered.map((tool) => (
                    <li key={tool.name} className="mono">
                      {tool.name} {tool.readOnly ? '[read]' : '[write]'} {tool.untrustedContent ? '[untrusted-content]' : ''}
                    </li>
                  ))}
                </ul>
              </details>
              <p style={{ fontSize: 14 }}>
                The connected agent can use these tools only while this page is open. Changes appear in this
                space, so you can review them here.
              </p>
            </>
          ) : (
            <>
              <p className="sticker sticker-wait">No agent connected</p>
              <p style={{ fontSize: 14 }}>
                Open Cherry in a compatible agent browser to connect an agent. You can still use every
                feature yourself.
              </p>
            </>
          )}
        </section>

        <section className="card stack" aria-labelledby="runner-heading">
          <h2 id="runner-heading" className="subhead">Local runner</h2>
          {runner === null ? (
            <p>Checking…</p>
          ) : runner.reachable ? (
            <p className={runner.paired ? 'sticker sticker-pass' : 'sticker sticker-wait'}>
              {runner.paired ? `Connected · providers: ${(runner.adapters ?? []).join(', ')}` : 'Runner found — enter the pairing code shown in its window'}
            </p>
          ) : (
            <div className="stack">
              <p className="sticker sticker-wait">Not running</p>
              <p style={{ fontSize: 14 }}>
                Optional. Run Cherry's local helper on this computer, then enter the one-time pairing code
                it shows.
              </p>
              <details>
                <summary className="label">Start command</summary>
                <code className="mono">node runner/server.mjs</code>
              </details>
            </div>
          )}
          <form onSubmit={handlePair} className="row">
            <label className="field" style={{ flex: 1, minWidth: 160 }}>
              <span>Pairing code</span>
              <input className="input" name="token" placeholder="Enter the code from the runner" autoComplete="off" />
            </label>
            <button type="submit" className="btn" style={{ alignSelf: 'flex-end' }}>Connect</button>
            {getStoredPairToken() ? (
              <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-end' }} onClick={() => { clearPairToken(); setNotice('Runner disconnected.'); void runnerStatus().then(setRunner); }}>
                Disconnect
              </button>
            ) : null}
          </form>
        </section>

        <AccountPanel />

        <section className="card stack" aria-labelledby="privacy-heading">
          <h2 id="privacy-heading" className="subhead">Privacy</h2>
          <ul style={{ margin: 0, paddingLeft: 'var(--sp-5)' }}>
            <li>All data for this space stays in this browser's storage. No account, telemetry, or cloud service is required.</li>
            <li>Core Cherry needs no API key. Optional provider connections read credentials only from your own computer — never from this page.</li>
            <li>Exports are plain JSON you control. The proof hash lets anyone detect modification.</li>
            <li>Never paste passwords, API keys, or tokens into chat with any agent.</li>
          </ul>
          <Link to="/studio/onboarding" className="btn btn-sm" style={{ alignSelf: 'flex-start' }}>Run capability check</Link>
        </section>

        <section className="card stack" aria-labelledby="storage-heading">
          <h2 id="storage-heading" className="subhead">Storage & portability</h2>
          {!activeWorkspace ? (
            <p>Select a space to review its file history.</p>
          ) : artifactHistory === null ? (
            <p>Checking stored file history.</p>
          ) : (
            <>
              <p style={{ fontSize: 14, margin: 0 }}>
                {artifactHistory.versionCount} file versions keep {formatStorageBytes(artifactHistory.contentBytes)} of old contents. Current files are counted separately.
              </p>
              <p className="label" style={{ margin: 0 }}>
                If a portable export reaches its 64 MiB limit, remove old version contents here. Paths, revisions, hashes, and proof stay.
              </p>
              <button
                type="button"
                className="btn btn-danger"
                disabled={artifactHistory.versionsWithContent === 0}
                onClick={() => void handlePurgeArtifactHistory()}
                style={{ alignSelf: 'flex-start' }}
              >
                Remove old contents
              </button>
              {artifactHistory.versionsWithContent === 0 ? <p className="label" style={{ margin: 0 }}>No stored version bodies remain.</p> : null}
            </>
          )}
        </section>

        <section className="card stack" aria-labelledby="cli-heading">
          <h2 id="cli-heading" className="subhead">Connect Claude Code or Codex CLI</h2>
          <p style={{ fontSize: 14, margin: 0 }}>
            Export your space from the Command Center, then give a compatible command-line agent read and
            verification access through Cherry's included local bridge.
          </p>
          <div className="row">
            <code className="mono" style={{ background: 'var(--color-paper-white)', border: 'var(--border)', borderRadius: 8, padding: '6px 10px', overflowX: 'auto', flex: 1, minWidth: 200 }}>
              claude mcp add cherry -- node runner/mcp/server.mjs --workspace ./cherry-workspace.json
            </code>
            <CopyButton text="claude mcp add cherry -- node runner/mcp/server.mjs --workspace ./cherry-workspace.json" />
          </div>
          <p style={{ fontSize: 14, margin: 0 }}>
            Compiled skill bundles install into Claude Code by unzipping into <code className="mono">~/.claude/skills/</code>.
            Start the optional local runner with:
          </p>
          <div className="row">
            <code className="mono" style={{ background: 'var(--color-paper-white)', border: 'var(--border)', borderRadius: 8, padding: '6px 10px', overflowX: 'auto', flex: 1, minWidth: 200 }}>
              node runner/server.mjs --root .
            </code>
            <CopyButton text="node runner/server.mjs --root ." />
          </div>
        </section>

        <section className="card stack" aria-labelledby="danger-heading">
          <h2 id="danger-heading" className="subhead">Danger zone</h2>
          {activeWorkspace ? (
            <>
              <p style={{ fontSize: 14 }}>
                Deleting a space removes every record it owns from this browser. Export first if in doubt.
              </p>
              <button type="button" className="btn btn-danger" onClick={() => void handleDeleteWorkspace()}>
                Delete space "{activeWorkspace.name}"
              </button>
            </>
          ) : (
            <p>No space selected.</p>
          )}
        </section>
      </div>
    </div>
  );
}
