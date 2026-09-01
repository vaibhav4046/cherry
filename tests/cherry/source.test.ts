import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { createWorkspace } from '../../src/cherry/mission/mission-service.ts';
import { listProofEvents } from '../../src/cherry/persistence/transactions.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import {
  completeSourceFetch,
  attachSourceTranscript,
  importSourceTranscript,
  createSource,
  findDuplicateSource,
  listSources,
  requestSourceFetch,
} from '../../src/cherry/source/source-service.ts';
import { listTranscript } from '../../src/cherry/watch/lesson-service.ts';
import { exportWorkspace, importWorkspace } from '../../src/cherry/persistence/workspace-archive.ts';
import { getDb } from '../../src/cherry/persistence/cherry-db.ts';
import { sha256Text } from '../../src/cherry/core/hash.ts';

describe('source inbox domain', () => {
  beforeEach(() => freshDb());

  it('saves user-selected content as a linked lesson and metadata-only proof', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Sources' }));
    const body = 'PRIVATE SOURCE BODY that must not appear in proof';
    const source = unwrap(await createSource({
      workspaceId: workspace.id,
      kind: 'article',
      title: 'Calm interfaces',
      creator: 'Ada',
      url: 'https://Example.com/guide?utm_source=newsletter&chapter=one#section',
      content: body,
      contentFormat: 'markdown',
      permissionAcknowledged: true,
    }));

    expect(source.url).toBe('https://example.com/guide?chapter=one');
    expect(source.status).toBe('ready');
    expect((await listTranscript(source.lessonId))[0]?.text).toContain('PRIVATE SOURCE BODY');
    const events = await listProofEvents(workspace.id);
    const saved = events.find((event) => event.type === 'source.saved');
    expect(saved?.payload).toMatchObject({ urlDomain: 'example.com', kind: 'article', lessonId: source.lessonId });
    expect(JSON.stringify(saved)).not.toContain(body);
  });

  it('rejects duplicates after URL normalization and exposes the existing id', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Sources' }));
    const first = unwrap(await createSource({
      workspaceId: workspace.id, kind: 'article', title: 'One', url: 'https://example.com/post?utm_campaign=x',
      content: 'One permitted article body.', permissionAcknowledged: true,
    }));
    const duplicate = await createSource({
      workspaceId: workspace.id, kind: 'article', title: 'Two', url: 'https://EXAMPLE.com/post#top',
      content: 'Different text.', permissionAcknowledged: true,
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.details?.existingSourceId).toBe(first.id);
    expect((await findDuplicateSource(workspace.id, { url: 'https://example.com/post?fbclid=abc' }))?.id).toBe(first.id);
  });

  it('fails closed for unsafe URLs and protected fetch targets', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Sources' }));
    const credential = await createSource({ workspaceId: workspace.id, kind: 'article', title: 'Bad', url: 'https://me:secret@example.com/a', permissionAcknowledged: true });
    expect(credential.ok).toBe(false);
    const privatePage = unwrap(await createSource({ workspaceId: workspace.id, kind: 'article', title: 'Private page', url: 'http://192.168.0.10/page', permissionAcknowledged: true }));
    const privateFetch = await requestSourceFetch(privatePage.id);
    expect(privateFetch.ok).toBe(false);
    if (!privateFetch.ok) expect(privateFetch.error.message).toContain('Private');

    const linkedIn = unwrap(await createSource({
      workspaceId: workspace.id, kind: 'article', title: 'Exported post', url: 'https://www.linkedin.com/posts/example',
      content: 'Text the user exported and supplied.', permissionAcknowledged: true,
    }));
    const fetch = await requestSourceFetch(linkedIn.id);
    expect(fetch.ok).toBe(false);
    if (!fetch.ok) expect(fetch.error.message).toContain('LinkedIn');

    const nocookie = unwrap(await createSource({
      workspaceId: workspace.id, kind: 'article', title: 'YouTube privacy player', url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', permissionAcknowledged: true,
    }));
    const nocookieFetch = await requestSourceFetch(nocookie.id);
    expect(nocookieFetch.ok).toBe(false);
    if (!nocookieFetch.ok) expect(nocookieFetch.error.message).toContain('YouTube');
  });

  it('does not let an unverified Scrapling result masquerade as fetched content', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Sources' }));
    const result = await createSource({
      workspaceId: workspace.id, kind: 'article', title: 'Unverified fetch', url: 'https://example.com/page',
      fetchMethod: 'scrapling_fetch', permissionAcknowledged: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('verified');
  });

  it('queues only an explicit public-page fetch and completes into the same lesson', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Sources' }));
    const source = unwrap(await createSource({
      workspaceId: workspace.id, kind: 'article', title: 'Public guide', url: 'https://example.com/guide', permissionAcknowledged: true,
    }));
    expect(source.fetchStatus).toBe('not_requested');
    const queued = unwrap(await requestSourceFetch(source.id));
    expect(queued.fetchStatus).toBe('queued');
    const markdown = '# Guide\n\nUse clear evidence.';
    const fetched = unwrap(await completeSourceFetch(source.id, { markdown, contentHash: await sha256Text(markdown) }));
    expect(fetched.fetchStatus).toBe('fetched');
    expect(fetched.fetchMethod).toBe('scrapling_fetch');
    expect(fetched.status).toBe('ready');
    expect(await listTranscript(fetched.lessonId)).toHaveLength(2);
    expect(await listSources(workspace.id)).toHaveLength(1);
    expect((await listTranscript(fetched.lessonId))[0]?.source).toBe('runner_fetch');
  });

  it('attaches a human-supplied URL transcript hash and format to its source record', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Transcript metadata' }));
    const source = unwrap(await createSource({
      workspaceId: workspace.id, kind: 'article', title: 'Article', url: 'https://example.com/article', permissionAcknowledged: true,
    }));
    const content = '0:05 Create a concise, readable method.';
    const updated = unwrap(await attachSourceTranscript(source.id, content));
    expect(updated.status).toBe('ready');
    expect(updated.contentFormat).toBe('plain');
    expect(updated.fetchMethod).toBe('user_paste');
    expect(updated.contentHash).toBe(await sha256Text(content));
  });

  it('imports a URL transcript and source metadata through one source-domain operation', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Imported metadata' }));
    const source = unwrap(await createSource({
      workspaceId: workspace.id, kind: 'article', title: 'Article', url: 'https://example.com/article', permissionAcknowledged: true,
    }));
    const imported = unwrap(await importSourceTranscript(source.id, '0:05 Create a readable method.', 'user_text'));
    expect(imported.source.contentHash).toBeTruthy();
    expect(imported.source.contentFormat).toBe('plain');
    expect((await listTranscript(source.lessonId))[0]?.source).toBe('user_text');
  });

  it('stores uploaded and local-transcription acquisition methods honestly', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Honest acquisition' }));
    const uploaded = unwrap(await createSource({ workspaceId: workspace.id, kind: 'article', title: 'Upload', url: 'https://example.com/upload', permissionAcknowledged: true }));
    const local = unwrap(await createSource({ workspaceId: workspace.id, kind: 'article', title: 'Local', url: 'https://example.com/local', permissionAcknowledged: true }));
    expect(unwrap(await importSourceTranscript(uploaded.id, '0:05 Create the upload method.', 'user_upload', 'notes.txt')).source.fetchMethod).toBe('upload');
    expect(unwrap(await importSourceTranscript(local.id, '0:05 Create the local method.', 'local_transcription')).source.fetchMethod).toBe('local_transcription');
  });

  it('exports and imports source records with their lesson references remapped', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Portable sources' }));
    const original = unwrap(await createSource({
      workspaceId: workspace.id, kind: 'note', title: 'Private note', content: 'Use a short review loop.', contentFormat: 'plain',
    }));
    const exported = unwrap(await exportWorkspace(workspace.id));
    const imported = unwrap(await importWorkspace(JSON.stringify(exported)));
    const records = await listSources(imported.workspaceId);
    expect(records).toHaveLength(1);
    expect(records[0]?.id).not.toBe(original.id);
    expect(records[0]?.lessonId).not.toBe(original.lessonId);
    expect((await getDb().lessons.get(records[0]!.lessonId))?.workspaceId).toBe(imported.workspaceId);
  });
});
