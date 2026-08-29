import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { createMission } from '../../cherry/mission/mission-service.ts';

export default function MissionNew() {
  const { activeWorkspace, refresh, setActiveMission } = useAppState();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  if (!activeWorkspace) {
    return (
      <div className="empty-state">
        <p className="subhead">Create a workspace first from the Command Center.</p>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const definitionOfDone = String(form.get('definitionOfDone') ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const result = await createMission({
      workspaceId: activeWorkspace!.id,
      title: String(form.get('title') ?? ''),
      objective: String(form.get('objective') ?? ''),
      definitionOfDone,
      riskLevel: (form.get('riskLevel') as 'low' | 'medium' | 'high') ?? 'low',
    });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setActiveMission(result.value.id);
    await refresh();
    navigate(`/studio/missions/${result.value.id}`);
  }

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)', maxWidth: 720 }}>
      <h1 className="display-sm">New mission</h1>
      <p className="subhead">
        A mission is the durable plan an agent executes: objective, constraints, and a definition of done
        that verification can actually test.
      </p>
      <form onSubmit={handleSubmit} className="card stack" style={{ gap: 'var(--sp-4)' }}>
        <label className="field">
          <span>Title</span>
          <input className="input" name="title" required maxLength={160} placeholder="Build a landing snippet the lesson way" />
        </label>
        <label className="field">
          <span>Objective</span>
          <textarea className="textarea" name="objective" required maxLength={4000} placeholder="What should exist when this mission is done?" />
        </label>
        <label className="field">
          <span>Definition of done (one item per line)</span>
          <textarea className="textarea" name="definitionOfDone" required placeholder={'index.html exists with an h1\nVerification passes with zero blocking failures'} />
        </label>
        <label className="field">
          <span>Risk level</span>
          <select className="select" name="riskLevel" defaultValue="low">
            <option value="low">Low — no external side effects</option>
            <option value="medium">Medium — touches shared files</option>
            <option value="high">High — consequential actions likely</option>
          </select>
        </label>
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
          Create mission
        </button>
      </form>
    </div>
  );
}
