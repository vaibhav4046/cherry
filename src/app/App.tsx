import { Suspense, useEffect } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { RouteMeta } from './RouteMeta.tsx';
import { onPresentRequest } from '../cherry/webmcp/present-path.ts';
import { lazyRoute } from './lazy-route.ts';
import { Landing } from '../pages/Landing.tsx';
import { StudioLayout } from '../pages/studio/StudioLayout.tsx';
import NotFound from '../pages/NotFound.tsx';

const CommandCenter = lazyRoute(() => import('../pages/studio/CommandCenter.tsx'));
const MissionControl = lazyRoute(() => import('../pages/studio/MissionControl.tsx'));
const MissionControlDetail = lazyRoute(() => import('../pages/studio/MissionControlDetail.tsx'));
const Connect = lazyRoute(() => import('../pages/Connect.tsx'));
const Showcase = lazyRoute(() => import('../pages/Showcase.tsx').then((module) => ({ default: module.Showcase })));
const Compatibility = lazyRoute(() =>
  import('../pages/Compatibility.tsx').then((module) => ({ default: module.Compatibility })),
);
const Onboarding = lazyRoute(() => import('../pages/studio/Onboarding.tsx'));
const MissionNew = lazyRoute(() => import('../pages/studio/MissionNew.tsx'));
const MissionDetail = lazyRoute(() => import('../pages/studio/MissionDetail.tsx'));
const Watch = lazyRoute(() => import('../pages/studio/Watch.tsx'));
const MemoryVault = lazyRoute(() => import('../pages/studio/MemoryVault.tsx'));
const Skills = lazyRoute(() => import('../pages/studio/Skills.tsx'));
const SkillDetail = lazyRoute(() => import('../pages/studio/SkillDetail.tsx'));
const Artifacts = lazyRoute(() => import('../pages/studio/Artifacts.tsx'));
const Runs = lazyRoute(() => import('../pages/studio/Runs.tsx'));
const Proof = lazyRoute(() => import('../pages/studio/Proof.tsx'));
const Connections = lazyRoute(() => import('../pages/studio/Connections.tsx'));
const AgentView = lazyRoute(() => import('../pages/studio/AgentView.tsx'));
const QuickSkill = lazyRoute(() => import('../pages/studio/QuickSkill.tsx'));
const Sources = lazyRoute(() => import('../pages/studio/Sources.tsx'));
const Creators = lazyRoute(() => import('../pages/studio/Creators.tsx'));
const WorkInbox = lazyRoute(() => import('../pages/studio/WorkInbox.tsx'));
const WorkThread = lazyRoute(() => import('../pages/studio/WorkThread.tsx'));
const CrewPage = lazyRoute(() => import('../pages/studio/CrewPage.tsx'));
const RoutinesPage = lazyRoute(() => import('../pages/studio/RoutinesPage.tsx'));
const RoutineDetail = lazyRoute(() => import('../pages/studio/RoutineDetail.tsx'));

function Loading() {
  return (
    <div className="empty-state" role="status" aria-live="polite">
      <span className="sticker sticker-cherry">Loading</span>
    </div>
  );
}

/**
 * Lets a tool put one of Cherry's own screens in front of the person: an agent
 * that just requested approval can show the decision instead of describing it.
 * It navigates and nothing else, and it only ever navigates inside Cherry.
 */
function AgentPresenter() {
  const navigate = useNavigate();
  useEffect(() => onPresentRequest((path) => navigate(path)), [navigate]);
  return null;
}

export function App() {
  return (
    <Suspense fallback={<Loading />}>
      <RouteMeta />
      <AgentPresenter />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/showcase" element={<Showcase />} />
        <Route path="/compatibility" element={<Compatibility />} />
        <Route path="/connect" element={<Connect />} />
        <Route path="/ingest" element={<StudioLayout />}>
          <Route index element={<Sources />} />
        </Route>
        <Route path="/studio" element={<StudioLayout />}>
          <Route index element={<CommandCenter />} />
          <Route path="control" element={<MissionControl />} />
          <Route path="control/:missionId" element={<MissionControlDetail />} />
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="quick" element={<QuickSkill />} />
          <Route path="sources" element={<Sources />} />
          <Route path="creators" element={<Creators />} />
          <Route path="inbox" element={<WorkInbox />} />
          <Route path="work/:workItemId" element={<WorkThread />} />
          <Route path="crew" element={<CrewPage />} />
          <Route path="routines" element={<RoutinesPage />} />
          <Route path="routines/:routineId" element={<RoutineDetail />} />
          <Route path="missions/new" element={<MissionNew />} />
          <Route path="missions/:missionId" element={<MissionDetail />} />
          <Route path="watch/:lessonId" element={<Watch />} />
          <Route path="memory" element={<MemoryVault />} />
          <Route path="skills" element={<Skills />} />
          <Route path="skills/:skillId" element={<SkillDetail />} />
          <Route path="artifacts/:artifactSetId" element={<Artifacts />} />
          <Route path="runs" element={<Runs />} />
          <Route path="proof/:receiptId" element={<Proof />} />
          <Route path="proof" element={<Proof />} />
          <Route path="agent" element={<AgentView />} />
          <Route path="settings/connections" element={<Connections />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
