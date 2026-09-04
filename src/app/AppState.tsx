import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { listWorkspaces } from '../cherry/mission/mission-service.ts';
import { listMissions } from '../cherry/mission/mission-service.ts';
import type { Mission, WorkspaceRecord } from '../cherry/mission/mission-model.ts';
import { productStateFor, type ProductState } from '../cherry/mission/mission-state.ts';
import { getPlanForMission } from '../cherry/workforce/mission-plan-service.ts';
import { WebMcpRegistrationManager, type WebMcpStatus } from '../cherry/webmcp/registration-manager.ts';
import type { ToolSurface } from '../cherry/webmcp/workforce-tools.ts';

const ACTIVE_WORKSPACE_KEY = 'cherry.activeWorkspaceId';
const ACTIVE_MISSION_KEY = 'cherry.activeMissionId';

interface AppState {
  ready: boolean;
  workspaces: WorkspaceRecord[];
  activeWorkspace: WorkspaceRecord | null;
  missions: Mission[];
  activeMission: Mission | null;
  productState: ProductState;
  setToolSurface: (surface: ToolSurface) => void;
  webmcp: WebMcpStatus;
  setActiveWorkspace(id: string | null): void;
  setActiveMission(id: string | null): void;
  /** Re-read persisted state after any mutation. */
  refresh(): Promise<void>;
}

const AppStateContext = createContext<AppState | null>(null);

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable — selection lives only in memory.
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(() => readStored(ACTIVE_WORKSPACE_KEY));
  const [activeMissionId, setActiveMissionId] = useState<string | null>(() => readStored(ACTIVE_MISSION_KEY));
  const [activePlanStatus, setActivePlanStatus] = useState<Parameters<typeof productStateFor>[2]>(null);
  const [webmcpStatus, setWebmcpStatus] = useState<WebMcpStatus>({ supported: false, registered: [], productState: 'empty', recentlyRemoved: [], recentCalls: [], agent: { attached: false, name: null }, surface: 'default', diagnostics: [] });

  const workspaceRef = useRef<string | null>(activeWorkspaceId);
  const missionRef = useRef<string | null>(activeMissionId);
  workspaceRef.current = activeWorkspaceId;
  missionRef.current = activeMissionId;
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const manager = useMemo(
    () =>
      new WebMcpRegistrationManager({
        getActiveWorkspaceId: () => workspaceRef.current,
        getActiveMissionId: () => missionRef.current,
        // Agent-driven mutations switch selection and re-sync the aperture the
        // same way a human click would — no manual UI action required.
        setActiveIds: (ids) => {
          if (ids.workspaceId !== undefined) {
            workspaceRef.current = ids.workspaceId;
            setActiveWorkspaceId(ids.workspaceId);
            writeStored(ACTIVE_WORKSPACE_KEY, ids.workspaceId);
          }
          if (ids.missionId !== undefined) {
            missionRef.current = ids.missionId;
            setActiveMissionId(ids.missionId);
            writeStored(ACTIVE_MISSION_KEY, ids.missionId);
          }
        },
        onMutation: () => refreshRef.current(),
      }),
    [],
  );

  const refresh = useCallback(async () => {
    const loadedWorkspaces = await listWorkspaces();
    setWorkspaces(loadedWorkspaces);

    let workspaceId = workspaceRef.current;
    if (!workspaceId || !loadedWorkspaces.some((workspace) => workspace.id === workspaceId)) {
      workspaceId = loadedWorkspaces[0]?.id ?? null;
      workspaceRef.current = workspaceId;
      setActiveWorkspaceId(workspaceId);
      writeStored(ACTIVE_WORKSPACE_KEY, workspaceId);
    }

    if (workspaceId) {
      const loadedMissions = await listMissions(workspaceId);
      setMissions(loadedMissions);
      let missionId = missionRef.current;
      if (!missionId || !loadedMissions.some((mission) => mission.id === missionId)) {
        missionId = loadedMissions[0]?.id ?? null;
        missionRef.current = missionId;
        setActiveMissionId(missionId);
        writeStored(ACTIVE_MISSION_KEY, missionId);
      }
      const activeMission = loadedMissions.find((mission) => mission.id === missionRef.current) ?? null;
      // A plan-based run never transitions the Mission, so the aperture has to
      // read the plan too or it stays on onboarding tools while work executes.
      const plan = activeMission ? await getPlanForMission(workspaceId, activeMission.id) : null;
      const planStatus = plan?.status ?? null;
      setActivePlanStatus(planStatus);
      manager.syncState(productStateFor(activeMission?.state ?? null, true, planStatus));
    } else {
      setMissions([]);
      setActivePlanStatus(null);
      manager.syncState('empty');
    }
    setReady(true);
  }, [manager]);
  refreshRef.current = refresh;

  useEffect(() => {
    void refresh();
    const unsubscribe = manager.subscribe(setWebmcpStatus);
    return () => {
      unsubscribe();
      manager.dispose();
    };
  }, [manager, refresh]);

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const activeMission = missions.find((mission) => mission.id === activeMissionId) ?? null;
  const productState = productStateFor(activeMission?.state ?? null, activeWorkspace !== null, activePlanStatus);

  const value: AppState = {
    ready,
    workspaces,
    activeWorkspace,
    missions,
    activeMission,
    productState,
    setToolSurface: (surface) => manager.setSurface(surface),
    webmcp: webmcpStatus,
    setActiveWorkspace(id) {
      workspaceRef.current = id;
      setActiveWorkspaceId(id);
      writeStored(ACTIVE_WORKSPACE_KEY, id);
      missionRef.current = null;
      setActiveMissionId(null);
      writeStored(ACTIVE_MISSION_KEY, null);
      void refresh();
    },
    setActiveMission(id) {
      missionRef.current = id;
      setActiveMissionId(id);
      writeStored(ACTIVE_MISSION_KEY, id);
      void refresh();
    },
    refresh,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const context = useContext(AppStateContext);
  if (!context) throw new Error('useAppState must be used inside AppStateProvider');
  return context;
}
