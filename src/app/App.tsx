import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Landing } from '../pages/Landing.tsx';
import { StudioLayout } from '../pages/studio/StudioLayout.tsx';
import { Compatibility } from '../pages/Compatibility.tsx';
import NotFound from '../pages/NotFound.tsx';

const CommandCenter = lazy(() => import('../pages/studio/CommandCenter.tsx'));
const Showcase = lazy(() => import('../pages/Showcase.tsx').then((module) => ({ default: module.Showcase })));
const Onboarding = lazy(() => import('../pages/studio/Onboarding.tsx'));
const MissionNew = lazy(() => import('../pages/studio/MissionNew.tsx'));
const MissionDetail = lazy(() => import('../pages/studio/MissionDetail.tsx'));
const Watch = lazy(() => import('../pages/studio/Watch.tsx'));
const MemoryVault = lazy(() => import('../pages/studio/MemoryVault.tsx'));
const Skills = lazy(() => import('../pages/studio/Skills.tsx'));
const SkillDetail = lazy(() => import('../pages/studio/SkillDetail.tsx'));
const Artifacts = lazy(() => import('../pages/studio/Artifacts.tsx'));
const Runs = lazy(() => import('../pages/studio/Runs.tsx'));
const Proof = lazy(() => import('../pages/studio/Proof.tsx'));
const Connections = lazy(() => import('../pages/studio/Connections.tsx'));
const AgentView = lazy(() => import('../pages/studio/AgentView.tsx'));
const QuickSkill = lazy(() => import('../pages/studio/QuickSkill.tsx'));
const Sources = lazy(() => import('../pages/studio/Sources.tsx'));
const WorkInbox = lazy(() => import('../pages/studio/WorkInbox.tsx'));
const WorkThread = lazy(() => import('../pages/studio/WorkThread.tsx'));
const CrewPage = lazy(() => import('../pages/studio/CrewPage.tsx'));
const RoutinesPage = lazy(() => import('../pages/studio/RoutinesPage.tsx'));
const RoutineDetail = lazy(() => import('../pages/studio/RoutineDetail.tsx'));

function Loading() {
  return (
    <div className="empty-state" role="status" aria-live="polite">
      <span className="sticker sticker-cherry">Loading</span>
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/showcase" element={<Showcase />} />
        <Route path="/compatibility" element={<Compatibility />} />
        <Route path="/studio" element={<StudioLayout />}>
          <Route index element={<CommandCenter />} />
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="quick" element={<QuickSkill />} />
          <Route path="sources" element={<Sources />} />
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
