import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { archiveAgentProfile, createAgentProfile, createStarterCrew, listAgentProfiles, listCrews } from '../../cherry/workforce/workforce-service.ts';
import type { AgentProfile, Crew } from '../../cherry/workforce/workforce-model.ts';

const STATUS_STICKER: Record<AgentProfile['status'], string> = {
  idle: 'sticker',
  working: 'sticker sticker-blue',
  waiting: 'sticker sticker-wait',
  offline: 'sticker',
  error: 'sticker sticker-fail',
  archived: 'sticker',
};

export default function CrewPage() {
  const { activeWorkspace } = useAppState();
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refreshCrew() {
    if (!activeWorkspace) return;
    setProfiles(await listAgentProfiles(activeWorkspace.id));
    setCrews(await listCrews(activeWorkspace.id));
  }

  useEffect(() => {
    void refreshCrew();
  }, [activeWorkspace]);

  async function handleStarterCrew() {
    if (!activeWorkspace) return;
    setBusy(true);
    setError(null);
    const created = await createStarterCrew(activeWorkspace.id);
    setBusy(false);
    if (!created.ok) setError(created.error.message);
    await refreshCrew();
  }

  async function handleAddAgent(name: string, role: string) {
    if (!activeWorkspace || !name.trim()) return;
    setError(null);
    const created = await createAgentProfile({ workspaceId: activeWorkspace.id, name, role });
    if (!created.ok) setError(created.error.message);
    await refreshCrew();
  }

  async function handleArchive(agentId: string) {
    if (!activeWorkspace) return;
    setError(null);
    const archived = await archiveAgentProfile(activeWorkspace.id, agentId);
    if (!archived.ok) setError(archived.error.message);
    await refreshCrew();
  }

  if (!activeWorkspace) {
    return (
      <div className="stack">
        <h1 className="display-sm title-3d">Crew</h1>
        <p className="subhead">Create a workspace first — your crew lives inside it.</p>
        <Link to="/studio" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Open Command Center</Link>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <header className="stack" style={{ gap: 'var(--sp-2)' }}>
        <h1 className="display-sm title-3d">Crew</h1>
        <p className="subhead" style={{ maxWidth: 680 }}>
          Profiles are configurations, not running models: an agent shows as working only when a real
          execution host holds a lease. Whoever attaches over WebMCP is auto-assigned.
        </p>
      </header>

      {error ? <p className="field-error" role="alert">{error}</p> : null}

      {profiles.length === 0 ? (
        <section className="card card-wash-lavender stack">
          <h2 className="subhead" style={{ fontSize: 20 }}>Start with the five-agent crew</h2>
          <p style={{ margin: 0 }}>Lead · Researcher · Designer · Builder · Verifier — all editable, all deletable.</p>
          <button type="button" className="btn btn-primary" onClick={() => void handleStarterCrew()} disabled={busy} style={{ alignSelf: 'flex-start' }} data-testid="create-starter-crew">
            {busy ? 'Creating…' : 'Create starter crew'}
          </button>
        </section>
      ) : (
        <>
          {crews.map((crew) => (
            <p key={crew.id} className="sticker sticker-lavender" style={{ alignSelf: 'flex-start' }}>
              {crew.name} · {crew.memberAgentIds.length} members · max {crew.maxConcurrentWorkItems} concurrent
            </p>
          ))}
          <div className="grid-cards" data-testid="crew-grid">
            {profiles.map((profile) => (
              <section key={profile.id} className="card stack" style={{ gap: 'var(--sp-2)' }} data-testid="agent-card">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h2 className="subhead" style={{ fontSize: 20 }}>{profile.name}</h2>
                  <span className={STATUS_STICKER[profile.status]}>{profile.status}</span>
                </div>
                <span className="label">{profile.role}</span>
                <p style={{ margin: 0, fontSize: 13 }}>{profile.objective}</p>
                <div className="row" style={{ gap: 6 }}>
                  {profile.allowedCapabilities.map((capability) => (
                    <span key={capability} className="sticker" style={{ padding: '1px 8px', fontSize: 10 }}>{capability.replace(/_/g, ' ')}</span>
                  ))}
                </div>
                <p className="label" style={{ margin: 0 }}>
                  Host: {profile.executionHostId ?? 'none yet — attach one in Connect'} · approval: {profile.approvalMode}
                </p>
                <button type="button" className="btn btn-sm" onClick={() => void handleArchive(profile.id)} style={{ alignSelf: 'flex-start' }}>
                  Archive
                </button>
              </section>
            ))}
          </div>
          <form
            className="row"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void handleAddAgent(String(form.get('name') ?? ''), String(form.get('role') ?? 'generalist'));
              (event.target as HTMLFormElement).reset();
            }}
          >
            <label className="field">
              <span>New agent name</span>
              <input className="input" name="name" required maxLength={60} placeholder="Reviewer" />
            </label>
            <label className="field">
              <span>Role</span>
              <input className="input" name="role" maxLength={40} placeholder="review" />
            </label>
            <button type="submit" className="btn" style={{ alignSelf: 'flex-end' }}>Add agent</button>
          </form>
        </>
      )}
    </div>
  );
}
