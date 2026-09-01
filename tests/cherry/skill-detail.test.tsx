import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { freshDb } from '../setup.ts';
import { AppStateProvider } from '../../src/app/AppState.tsx';
import SkillDetail from '../../src/pages/studio/SkillDetail.tsx';
import { createMission, createWorkspace } from '../../src/cherry/mission/mission-service.ts';
import { addEvidence } from '../../src/cherry/evidence/evidence-service.ts';
import { draftSkillGraph, reviseSkillGraph } from '../../src/cherry/skillgraph/skillgraph-service.ts';
import { unwrap } from '../../src/cherry/core/result.ts';

describe('Skill detail provenance', () => {
  beforeEach(() => {
    freshDb();
    localStorage.clear();
  });

  it('shows where evidence came from with creator, linked title, URL, and timestamp', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Visible provenance' }));
    const mission = unwrap(
      await createMission({
        workspaceId: workspace.id,
        title: 'Learn the source',
        objective: 'Keep the source visible',
        definitionOfDone: ['The evidence is cited'],
      }),
    );
    const evidence = unwrap(
      await addEvidence({
        workspaceId: workspace.id,
        missionId: mission.id,
        sourceType: 'video',
        sourceCreator: 'Creator Lab',
        sourceTitle: 'The Thumbnail Hierarchy Method',
        sourceUri: 'https://www.youtube.com/watch?v=abc123xyz00',
        timestampSeconds: 75,
        claim: 'Choose one focal subject before adding supporting text.',
        provenanceMethod: 'user_typed',
      }),
    );
    const knowledgeEvidence = unwrap(
      await addEvidence({
        workspaceId: workspace.id,
        missionId: mission.id,
        sourceType: 'video',
        sourceCreator: 'Knowledge-only Creator',
        sourceTitle: 'A Referenced Knowledge Source',
        sourceUri: 'https://www.youtube.com/watch?v=knowledge000',
        timestampSeconds: 30,
        claim: 'This evidence is referenced through the skill knowledge list.',
        provenanceMethod: 'user_typed',
      }),
    );
    await addEvidence({
      workspaceId: workspace.id,
      missionId: mission.id,
      sourceType: 'video',
      sourceCreator: 'Unrelated Creator',
      sourceTitle: 'A Different Workflow',
      sourceUri: 'https://www.youtube.com/watch?v=unrelated00',
      timestampSeconds: 240,
      claim: 'This belongs to the project but is not referenced by this skill.',
      provenanceMethod: 'user_typed',
    });
    const graph = unwrap(
      await draftSkillGraph({
        workspaceId: workspace.id,
        missionId: mission.id,
        name: 'Thumbnail hierarchy',
        purpose: 'Build a thumbnail around one dominant focal subject',
        nodes: [{ kind: 'action', title: 'Choose the subject', goal: 'Establish the focal point', evidenceIds: [evidence.id] }],
      }),
    );
    unwrap(
      await reviseSkillGraph(
        graph.id,
        {
          knowledge: [{
            evidenceId: evidence.id,
            use: 'Support the focal-point step',
            trust: 'untrusted',
            timestampSeconds: 75,
          }, {
            evidenceId: knowledgeEvidence.id,
            use: 'Support the method context',
            trust: 'untrusted',
            timestampSeconds: 30,
          }],
        },
        'Attach knowledge evidence',
        'human',
        graph.revision,
      ),
    );

    render(
      <AppStateProvider>
        <MemoryRouter initialEntries={[`/studio/skills/${graph.id}`]}>
          <Routes>
            <Route path="/studio/skills/:skillId" element={<SkillDetail />} />
          </Routes>
        </MemoryRouter>
      </AppStateProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Where this came from' })).toBeTruthy();
    expect(await screen.findByText('Creator Lab')).toBeTruthy();
    const sourceLink = await screen.findByRole('link', { name: 'The Thumbnail Hierarchy Method' });
    expect(sourceLink.getAttribute('href')).toBe('https://www.youtube.com/watch?v=abc123xyz00');
    expect(await screen.findByText('1:15')).toBeTruthy();
    expect(await screen.findByText('Knowledge-only Creator')).toBeTruthy();
    expect(await screen.findByRole('link', { name: 'A Referenced Knowledge Source' })).toBeTruthy();
    expect(screen.queryByText('Unrelated Creator')).toBeNull();
    expect(screen.queryByText('A Different Workflow')).toBeNull();
    expect(screen.queryByText('This belongs to the project but is not referenced by this skill.')).toBeNull();
  });
});
