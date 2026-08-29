import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { freshDb } from '../setup.ts';
import { createMission, createWorkspace, updateMission } from '../../src/cherry/mission/mission-service.ts';
import { importTranscript, loadLesson } from '../../src/cherry/watch/lesson-service.ts';
import { generateSkillFromLesson } from '../../src/cherry/skillgraph/quick-skill.ts';
import { requestSkillGraphApproval, decideSkillGraphApproval } from '../../src/cherry/skillgraph/skillgraph-service.ts';
import { compileSkillBundle } from '../../src/cherry/compiler/archive-builder.ts';
import { unwrap } from '../../src/cherry/core/result.ts';

/**
 * Writes a REAL compiled bundle to disk for host-installation validation:
 *   GENERATE_BUNDLE=1 npx vitest run tests/cherry/bundle-writer.gen.test.ts
 * Output: docs/release/sample-bundle.zip
 */
describe('bundle writer', () => {
  it.skipIf(!process.env.GENERATE_BUNDLE)('compiles a real quick-skill bundle to docs/release/sample-bundle.zip', async () => {
    freshDb();
    const workspace = unwrap(await createWorkspace({ name: 'Bundle export workspace' }));
    const mission = unwrap(
      await createMission({
        workspaceId: workspace.id,
        title: 'Host validation mission',
        objective: 'Produce a bundle to install into a live Claude Code host',
        definitionOfDone: ['Bundle installs and verifies'],
      }),
    );
    const lesson = unwrap(
      await loadLesson({ workspaceId: workspace.id, missionId: mission.id, title: 'Accessible hero sections', kind: 'manual' }),
    );
    unwrap(await updateMission(mission.id, { lessonId: lesson.id }));
    unwrap(
      await importTranscript(
        lesson.id,
        [
          '0:05 Create a semantic hero section with a real h1 heading',
          '0:40 Wrap the visible content in a main landmark',
          '1:10 Add pill-shaped call-to-action buttons with visible focus states',
          '1:50 Check color contrast against WCAG AA before shipping',
        ].join('\n'),
        'user_text',
      ),
    );
    const generated = unwrap(await generateSkillFromLesson({ lessonId: lesson.id }));
    const request = unwrap(await requestSkillGraphApproval(generated.graph.id, 'Host validation', 'user'));
    unwrap(await decideSkillGraphApproval(request.approval.id, 'approved', 'user'));
    const bundle = unwrap(await compileSkillBundle(generated.graph.id));

    mkdirSync('docs/release', { recursive: true });
    // jsdom's Blob lacks arrayBuffer(); FileReader works in both environments.
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(bundle.blob);
    });
    writeFileSync('docs/release/sample-bundle.zip', bytes);
    writeFileSync(
      'docs/release/sample-bundle.meta.json',
      JSON.stringify({ fileName: bundle.fileName, sha256: bundle.sha256, files: bundle.fileList, skillName: generated.graph.name }, null, 2),
    );
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
