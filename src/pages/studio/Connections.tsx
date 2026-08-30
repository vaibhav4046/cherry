import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { clearPairToken, getStoredPairToken, pairRunner, runnerStatus, type RunnerStatus } from '../../cherry/runner-client/runner-api.ts';
import { deleteWorkspace } from '../../cherry/mission/mission-service.ts';
import { CopyButton } from '../../components/Icons.tsx';

export default function Connections() {
  const { activeWorkspace, webmcp, refresh } = useAppState();
  const [runner, setRunner] = useState<RunnerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void runnerStatus().then(setRunner);
  }, []);

  async function handlePair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const token = String(new FormData(event.currentTarget).get('token') ?? '').trim();
    const result = await pairRunner(token);
    if (!result.ok) {
      setError(result.error.message);
    } else {
      setNotice('Runner paired for this session.');
    }
    setRunner(await runnerStatus());
  }

  async function handleDeleteWorkspace() {
    if (!activeWorkspace) return;
    const confirmed = window.confirm(
      `Delete workspace "${activeWorkspace.name}" and ALL of its missions, lessons, evidence, skills, memories, artifacts, and proof? This cannot be undone. Export it first if you want a copy.`,
    );
    if (!confirmed) return;
    const result = await deleteWorkspace(activeWorkspace.id);
    if (!result.ok) setError(result.error.message);
    await refresh();
  }

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <h1 className="display-sm">Connections & privacy</h1>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      {notice ? <p className="sticker sticker-pass" role="status">{notice}</p> : null}

      <div className="grid-cards">
        <section className="card stack" aria-labelledby="webmcp-heading">
          <h2 id="webmcp-heading" className="subhead">WebMCP host</h2>
          {webmcp.supported ? (
            <>
              <p className="sticker sticker-pass">Supported · {webmcp.registered.length} tools registered for state "{webmcp.productState}"</p>
              <details>
                <summary className="label">Registered tools (diagnostic)</summary>
                <ul className="stack" style={{ marginTop: 'var(--sp-2)' }}>
                  {webmcp.registered.map((tool) => (
                    <li key={tool.name} className="mono">
                      {tool.name} {tool.readOnly ? '[read]' : '[write]'} {tool.untrustedContent ? '[untrusted-content]' : ''}
                    </li>
                  ))}
                </ul>
              </details>
              <p style={{ fontSize: 14 }}>
                Tools exist only while this page is open in a compatible client. They mutate the same state
                you see here — there is no separate agent world.
              </p>
            </>
          ) : (
            <>
              <p className="sticker sticker-wait">Not available in this browser</p>
              <p style={{ fontSize: 14 }}>
                Open Cherry inside a WebMCP-compatible ChatGPT/Codex client and its agent can operate this
                page through state-aware tools. Until then, every feature works manually — same product, no
                hidden extras.
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
              {runner.paired ? `Paired · adapters: ${(runner.adapters ?? []).join(', ')}` : 'Reachable on 127.0.0.1:47821 — enter the pairing token shown in the runner console'}
            </p>
          ) : (
            <div className="stack">
              <p className="sticker sticker-wait">Not running</p>
              <p style={{ fontSize: 14 }}>
                Optional. From the repository: <code className="mono">node runner/server.mjs</code> — it
                binds to 127.0.0.1 only and prints a one-time pairing token.
              </p>
            </div>
          )}
          <form onSubmit={handlePair} className="row">
            <input className="input" name="token" placeholder="Pairing token" style={{ flex: 1, minWidth: 160 }} autoComplete="off" />
            <button type="submit" className="btn">Pair</button>
            {getStoredPairToken() ? (
              <button type="button" className="btn btn-sm" onClick={() => { clearPairToken(); setNotice('Pairing cleared.'); void runnerStatus().then(setRunner); }}>
                Unpair
              </button>
            ) : null}
          </form>
        </section>

        <section className="card card-wash-sky stack" aria-labelledby="privacy-heading">
          <h2 id="privacy-heading" className="subhead">Privacy</h2>
          <ul style={{ margin: 0, paddingLeft: 'var(--sp-5)' }}>
            <li>All workspace data lives in this browser's IndexedDB. No account, no telemetry, no cloud.</li>
            <li>Core Cherry needs no API key. Optional provider adapters read credentials only from your own local environment — never from this page.</li>
            <li>Exports are plain JSON you control. The proof hash lets anyone detect modification.</li>
            <li>Never paste passwords, API keys, or tokens into chat with any agent.</li>
          </ul>
          <Link to="/studio/onboarding" className="btn btn-sm" style={{ alignSelf: 'flex-start' }}>Run capability check</Link>
        </section>

        <section className="card card-wash-lavender stack" aria-labelledby="cli-heading">
          <h2 id="cli-heading" className="subhead">Connect Claude Code / Codex CLI</h2>
          <p style={{ fontSize: 14, margin: 0 }}>
            Export your workspace (Command Center → Export), then give any MCP-capable CLI read/verify
            access to it through the bundled stdio bridge:
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
                Deleting a workspace removes every record it owns from this browser. Export first if in doubt.
              </p>
              <button type="button" className="btn btn-danger" onClick={() => void handleDeleteWorkspace()}>
                Delete workspace "{activeWorkspace.name}"
              </button>
            </>
          ) : (
            <p>No workspace selected.</p>
          )}
        </section>
      </div>
    </div>
  );
}
