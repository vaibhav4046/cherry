import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Landing } from '../pages/Landing.tsx';
import { StudioLayout } from '../pages/studio/StudioLayout.tsx';

const CommandCenter = lazy(() => import('../pages/studio/CommandCenter.tsx'));
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
        <Route path="/studio" element={<StudioLayout />}>
          <Route index element={<CommandCenter />} />
          <Route path="onboarding" element={<Onboarding />} />
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
          <Route path="settings/connections" element={<Connections />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
