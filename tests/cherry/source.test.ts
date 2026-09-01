import { beforeEach, describe, expect, it, vi } from 'vitest';
import { freshDb } from '../setup.ts';
import { createWorkspace } from '../../src/cherry/mission/mission-service.ts';
import { listProofEvents } from '../../src/cherry/persistence/transactions.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import {
  completeSourceFetch,
  failSourceFetch,
  interpretSourceFetchOutcome,
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
    const createUnsafe = createSource as unknown as (input: Omit<Parameters<typeof createSource>[0], 'fetchMethod'> & { fetchMethod: 'scrapling_fetch' }) => ReturnType<typeof createSource>;
    const result = await createUnsafe({
      workspaceId: workspace.id, kind: 'article', title: 'Unverified fetch', url: 'https://example.com/page',
      fetchMethod: 'scrapling_fetch', permissionAcknowledged: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('verified');
    const forged = await createUnsafe({
      workspaceId: workspace.id, kind: 'article', title: 'Forged fetch', url: 'https://example.com/forged',
      content: '# Forged\n\nCreate fake runner provenance.', contentFormat: 'markdown', fetchMethod: 'scrapling_fetch', permissionAcknowledged: true,
    });
    expect(forged.ok).toBe(false);
    expect(await listSources(workspace.id)).toEqual([]);
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
    expect((await listProofEvents(workspace.id)).slice(-2).map((event) => event.type)).toEqual([
      'lesson.transcript_imported',
      'source.fetch_completed',
    ]);
  });

  it('rolls back runner transcript, lesson, source, and proof when the source write fails', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Atomic runner fetch' }));
    const source = unwrap(await createSource({
      workspaceId: workspace.id, kind: 'article', title: 'Atomic guide', url: 'https://example.com/atomic', permissionAcknowledged: true,
    }));
    const queued = unwrap(await requestSourceFetch(source.id));
    const lessonBefore = await getDb().lessons.get(source.lessonId);
    const proofBefore = await listProofEvents(workspace.id);
    const markdown = '# Atomic guide\n\nCreate the first step.\n\nCheck the result.';
    const sourceWrite = vi.spyOn(getDb().sourceRecords, 'put').mockRejectedValueOnce(new Error('injected source write failure'));

    try {
      await expect(completeSourceFetch(source.id, { markdown, contentHash: await sha256Text(markdown) })).rejects.toThrow('injected source write failure');
    } finally {
      sourceWrite.mockRestore();
    }

    expect(await listTranscript(source.lessonId)).toEqual([]);
    expect(await getDb().lessons.get(source.lessonId)).toEqual(lessonBefore);
    expect(await getDb().sourceRecords.get(source.id)).toEqual(queued);
    expect(await listProofEvents(workspace.id)).toEqual(proofBefore);
  });

  it('preserves blocked runner outcomes and maps every other terminal failure to failed', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Terminal fetch states' }));
    const queuedSource = async (suffix: string) => {
      const source = unwrap(await createSource({
        workspaceId: workspace.id, kind: 'article', title: `Terminal ${suffix}`, url: `https://example.com/${suffix}`, permissionAcknowledged: true,
      }));
      return unwrap(await requestSourceFetch(source.id));
    };
    const blockedSource = await queuedSource('blocked');
    const blocked = await failSourceFetch(blockedSource.id, { status: 'blocked', reason: 'robots policy denied access' });
    expect(blocked?.ok ? blocked.value.fetchStatus : null).toBe('blocked');

    for (const [index, reason] of ['runner failed', 'runner cancelled', 'malformed worker JSON', 'content hash mismatch', 'runner timed out'].entries()) {
      const source = await queuedSource(`failed-${index}`);
      const failed = await failSourceFetch(source.id, { status: 'failed', reason });
      expect(failed?.ok ? failed.value.fetchStatus : null).toBe('failed');
    }
  });

  it('does not downgrade an already fetched source when a late failure arrives', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Late terminal state' }));
    const source = unwrap(await createSource({
      workspaceId: workspace.id, kind: 'article', title: 'Fetched once', url: 'https://example.com/fetched-once', permissionAcknowledged: true,
    }));
    unwrap(await requestSourceFetch(source.id));
    const markdown = '# Complete\n\nCreate the completed method.';
    const fetched = unwrap(await completeSourceFetch(source.id, { markdown, contentHash: await sha256Text(markdown) }));

    const late = await failSourceFetch(source.id, { status: 'failed', reason: 'late poll error' });
    expect(late.ok).toBe(false);
    expect(await getDb().sourceRecords.get(source.id)).toEqual(fetched);
  });

  it('interprets blocked, failed, cancelled, malformed, hash-mismatched, and timed-out runner results', async () => {
    const markdown = '# Verified\n\nCreate the verified step.';

    expect(await interpretSourceFetchOutcome({ status: 'succeeded', result: { stdout: JSON.stringify({ status: 'blocked', reason: 'robots policy denied access' }) } })).toEqual({
      kind: 'failure', status: 'blocked', reason: 'robots policy denied access',
    });
    expect(await interpretSourceFetchOutcome({ status: 'failed', result: { stderr: 'adapter crashed' } })).toEqual({ kind: 'failure', status: 'failed', reason: 'adapter crashed' });
    expect(await interpretSourceFetchOutcome({ status: 'cancelled' })).toEqual({ kind: 'failure', status: 'failed', reason: 'The local fetch was cancelled.' });
    expect(await interpretSourceFetchOutcome({ status: 'succeeded', result: { stdout: '{not-json' } })).toEqual({ kind: 'failure', status: 'failed', reason: 'The local fetch returned malformed JSON.' });
    expect(await interpretSourceFetchOutcome({ status: 'succeeded', result: { stdout: JSON.stringify({ status: 'fetched', markdown, contentHash: '0'.repeat(64) }) } })).toEqual({
      kind: 'failure', status: 'failed', reason: 'The local fetch content hash did not match its Markdown.',
    });
    expect(await interpretSourceFetchOutcome({ status: 'timed_out' })).toEqual({ kind: 'failure', status: 'failed', reason: 'The local fetch timed out after 30 seconds.' });
    expect(await interpretSourceFetchOutcome({ status: 'succeeded', result: { stdout: JSON.stringify({ status: 'fetched', markdown, contentHash: await sha256Text(markdown) }) } })).toEqual({
      kind: 'fetched', markdown, contentHash: await sha256Text(markdown),
    });
  });

  it('attaches a human-supplied URL transcript hash and format atomically with import', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Transcript metadata' }));
    const source = unwrap(await createSource({
      workspaceId: workspace.id, kind: 'article', title: 'Article', url: 'https://example.com/article', permissionAcknowledged: true,
    }));
    const content = '0:05 Create a concise, readable method.';
    const updated = unwrap(await importSourceTranscript(source.id, content, 'user_text')).source;
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

  it('accepts local transcription on source creation with matching schema and provenance', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Local creation' }));
    const created = await createSource({
      workspaceId: workspace.id,
      kind: 'note',
      title: 'Local recording',
      content: '0:05 Create the locally transcribed method.',
      fetchMethod: 'local_transcription',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.fetchMethod).toBe('local_transcription');
    expect((await listTranscript(created.value.lessonId))[0]?.source).toBe('local_transcription');
  });

  it('rolls back a content-bearing source when transcript persistence fails', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Atomic source creation' }));
    const proofBefore = await listProofEvents(workspace.id);
    const segmentWrite = vi.spyOn(getDb().transcriptSegments, 'bulkAdd').mockRejectedValueOnce(new Error('injected transcript write failure'));

    try {
      await expect(createSource({
        workspaceId: workspace.id,
        kind: 'note',
        title: 'Atomic note',
        content: '0:05 Create the atomic source method.',
        contentFormat: 'plain',
      })).rejects.toThrow('injected transcript write failure');
    } finally {
      segmentWrite.mockRestore();
    }

    expect(await getDb().sourceRecords.where('workspaceId').equals(workspace.id).toArray()).toEqual([]);
    expect(await getDb().lessons.where('workspaceId').equals(workspace.id).toArray()).toEqual([]);
    expect(await getDb().transcriptSegments.where('workspaceId').equals(workspace.id).toArray()).toEqual([]);
    expect(await listProofEvents(workspace.id)).toEqual(proofBefore);
  });

  it('rejects runner and unknown transcript sources from the human transcript import boundary', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Human import boundary' }));
    const source = unwrap(await createSource({ workspaceId: workspace.id, kind: 'note', title: 'Human note' }));
    const importUnsafe = importSourceTranscript as unknown as (
      sourceId: string,
      content: string,
      transcriptSource: 'runner_fetch' | 'unknown',
    ) => ReturnType<typeof importSourceTranscript>;

    const results = await Promise.all([
      importUnsafe(source.id, '0:05 Create a runner method.', 'runner_fetch'),
      importUnsafe(source.id, '0:10 Create an unknown method.', 'unknown'),
    ]);
    expect(results.map((result) => result.ok)).toEqual([false, false]);
    expect(await listTranscript(source.lessonId)).toEqual([]);
  });

  it('preserves anchor source metadata and records appended acquisition metadata', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Append metadata' }));
    const source = unwrap(await createSource({ workspaceId: workspace.id, kind: 'article', title: 'Article', url: 'https://example.com/article', permissionAcknowledged: true }));
    const initial = unwrap(await importSourceTranscript(source.id, '0:05 Create the first method.', 'user_text')).source;
    const appendedText = '0:40 Check the uploaded method.';
    const appended = unwrap(await importSourceTranscript(source.id, appendedText, 'user_upload', 'notes.txt', 'human', 'append'));
    expect(appended.source).toEqual(initial);
    const event = (await listProofEvents(workspace.id)).filter((item) => item.type === 'lesson.transcript_imported').at(-1);
    expect(event?.payload).toMatchObject({ sourceId: source.id, acquisition: 'user_upload', format: 'plain', contentHash: await sha256Text(appendedText), mode: 'append' });
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
