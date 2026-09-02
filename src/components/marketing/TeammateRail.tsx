import { useEffect, useState } from 'react';
import { listMissions, listWorkspaces } from '../../cherry/mission/mission-service.ts';
import { runnerStatus } from '../../cherry/runner-client/runner-api.ts';
import { TEAMMATE_EXAMPLE_ROWS } from './landing-content.ts';

interface LiveRow {
  name: string;
  line: string;
}

interface LiveState {
  workspaceName: string;
  rows: LiveRow[];
}

const MISSION_STATE_LINE: Record<string, string> = {
  DRAFT: 'Drafted. Waiting for a plan.',
  LEARNING: 'Learning from a source.',
  PLANNING: 'Plan drafted. Waiting for your approval or a start.',
  AWAITING_APPROVAL: 'Waiting for your approval.',
  EXECUTING: 'Workers are running on your paired runner.',
  VERIFYING: 'Cherry is checking the work.',
  COMPLETE: 'Verified and complete.',
  BLOCKED: 'Blocked. Needs you.',
  CANCELLED: 'Cancelled.',
};

/**
 * The hero rail. By default it shows a labelled example workspace. When a
 * local runner is paired in this browser and the active space has missions,
 * it switches to real rows read from persisted state, and says so.
 */
export function TeammateRail() {
  const [live, setLive] = useState<LiveState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const runner = await runnerStatus();
        if (!runner.reachable || !runner.paired) return;
        const workspaces = await listWorkspaces();
        const workspace = workspaces.find((candidate) => !candidate.isExample) ?? workspaces[0];
        if (!workspace) return;
        const missions = await listMissions(workspace.id);
        if (missions.length === 0) return;
        const rows = missions.slice(0, 6).map((mission) => ({
          name: mission.title,
          line: MISSION_STATE_LINE[mission.state] ?? mission.state,
        }));
        if (!cancelled) setLive({ workspaceName: workspace.name, rows });
      } catch {
        // Runner or storage unavailable: the labelled example stays.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows: LiveRow[] = live ? live.rows : TEAMMATE_EXAMPLE_ROWS.map((row) => ({ name: row.name, line: row.line }));

  return (
    <div className="card gm-rail" data-testid="teammate-rail" data-mode={live ? 'live' : 'example'}>
      <div className="row gm-rail-head">
        <span className="label">{live ? `Live · ${live.workspaceName}` : 'Teammates'}</span>
        <span className={live ? 'sticker sticker-pass' : 'sticker'}>{live ? 'Paired runner' : 'Example workspace'}</span>
      </div>
      <ul className="gm-rail-list">
        {rows.map((row) => (
          <li key={row.name} className="gm-rail-row">
            <span className="gm-rail-name">{row.name}</span>
            <span className="gm-rail-line">{row.line}</span>
          </li>
        ))}
      </ul>
      {live ? null : (
        <p className="gm-rail-note label">Example rows. Real rows appear here when a runner is paired and a mission exists.</p>
      )}
    </div>
  );
}
