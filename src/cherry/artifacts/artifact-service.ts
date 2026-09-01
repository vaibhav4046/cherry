import { getDb } from '../persistence/cherry-db.ts';
import { withWorkspaceTx } from '../persistence/transactions.ts';
import { newId } from '../core/ids.ts';
import { isoNow } from '../core/clock.ts';
import { sha256Text } from '../core/hash.ts';
import { ok, type Result } from '../core/result.ts';
import { invalid, notFound } from '../core/errors.ts';
import { validateArtifactPath } from './artifact-path.ts';
import {
  MAX_ARTIFACT_FILE_BYTES,
  MAX_ARTIFACT_FILES,
  MAX_ARTIFACT_SET_BYTES,
  type ArtifactFile,
  type ArtifactSet,
  type ArtifactVersion,
} from './artifact-model.ts';

export async function createArtifactSet(
  workspaceId: string,
  missionId: string,
  name: string,
  entryPath = 'index.html',
): Promise<Result<ArtifactSet>> {
  if (!name.trim()) return invalid('Artifact set name is required');
  const workspace = await getDb().workspaces.get(workspaceId);
  if (!workspace) return notFound('Workspace', workspaceId);
  const mission = await getDb().missions.get(missionId);
  if (!mission) return notFound('Mission', missionId);

  const now = isoNow();
  const set: ArtifactSet = {
    id: newId('as'),
    workspaceId,
    missionId,
    name: name.trim(),
    entryPath,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().artifactSets.add(set);
  return ok(set);
}

export async function getArtifactSet(id: string): Promise<ArtifactSet | undefined> {
  return getDb().artifactSets.get(id);
}

export async function listArtifactSets(workspaceId: string): Promise<ArtifactSet[]> {
  return getDb().artifactSets.where('workspaceId').equals(workspaceId).toArray();
}

export async function listArtifactFiles(artifactSetId: string): Promise<ArtifactFile[]> {
  const files = await getDb().artifactFiles.where('artifactSetId').equals(artifactSetId).toArray();
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function getArtifactFileByPath(artifactSetId: string, path: string): Promise<ArtifactFile | undefined> {
  const files = await getDb().artifactFiles.where('artifactSetId').equals(artifactSetId).toArray();
  return files.find((file) => file.path === path);
}

/**
 * Create or update a file. Every write produces an ArtifactVersion and a
 * ProofEvent, so the receipt can show what changed and when.
 */
export async function writeArtifactFile(
  artifactSetId: string,
  path: string,
  content: string,
  updatedBy: ArtifactFile['updatedBy'],
  changeSummary = 'File written',
): Promise<Result<ArtifactFile>> {
  const pathCheck = validateArtifactPath(path);
  if (!pathCheck.ok) return pathCheck;

  const db = getDb();
  const set = await db.artifactSets.get(artifactSetId);
  if (!set) return notFound('Artifact set', artifactSetId);

  const sizeBytes = new TextEncoder().encode(content).length;
  if (sizeBytes > MAX_ARTIFACT_FILE_BYTES) {
    return invalid(`File is ${sizeBytes} bytes; the per-file limit is ${MAX_ARTIFACT_FILE_BYTES}`);
  }

  const files = await listArtifactFiles(artifactSetId);
  const existing = files.find((file) => file.path === pathCheck.value.path);
  if (!existing && files.length >= MAX_ARTIFACT_FILES) {
    return invalid(`The artifact set already has ${files.length} files (limit ${MAX_ARTIFACT_FILES})`);
  }
  const totalOther = files
    .filter((file) => file.path !== pathCheck.value.path)
    .reduce((sum, file) => sum + file.sizeBytes, 0);
  if (totalOther + sizeBytes > MAX_ARTIFACT_SET_BYTES) {
    return invalid('Artifact set size limit exceeded', { limit: MAX_ARTIFACT_SET_BYTES });
  }

  const sha256 = await sha256Text(content);
  const now = isoNow();
  const record: ArtifactFile = existing
    ? {
        ...existing,
        content,
        sizeBytes,
        sha256,
        mediaType: pathCheck.value.mediaType,
        revision: existing.revision + 1,
        updatedAt: now,
        updatedBy,
      }
    : {
        id: newId('af'),
        workspaceId: set.workspaceId,
        artifactSetId,
        path: pathCheck.value.path,
        mediaType: pathCheck.value.mediaType,
        content,
        sizeBytes,
        sha256,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        updatedBy,
      };

  const version: ArtifactVersion = {
    id: newId('af'),
    workspaceId: set.workspaceId,
    artifactFileId: record.id,
    artifactSetId,
    path: record.path,
    revision: record.revision,
    content,
    sha256,
    sizeBytes,
    createdAt: now,
    changeSummary,
  };

  await withWorkspaceTx(set.workspaceId, ['artifactFiles', 'artifactVersions', 'artifactSets'], async (ctx) => {
    await ctx.db.artifactFiles.put(record);
    await ctx.db.artifactVersions.add(version);
    await ctx.db.artifactSets.put({ ...set, revision: set.revision + 1, updatedAt: now });
    ctx.emit({
      type: 'artifact.file_written',
      actorType: updatedBy === 'human' ? 'human' : updatedBy === 'agent' ? 'agent' : 'system',
      objectType: 'artifact-file',
      objectId: record.id,
      summary: `${existing ? 'Updated' : 'Created'} ${record.path} (r${record.revision}, ${sizeBytes} bytes)`,
      payload: { path: record.path, revision: record.revision, sha256, sizeBytes },
    });
  });
  return ok(record);
}

export async function deleteArtifactFile(
  artifactSetId: string,
  path: string,
  actor: ArtifactFile['updatedBy'] = 'human',
): Promise<Result<{ deleted: string }>> {
  const db = getDb();
  const set = await db.artifactSets.get(artifactSetId);
  if (!set) return notFound('Artifact set', artifactSetId);
  const file = await getArtifactFileByPath(artifactSetId, path);
  if (!file) return notFound('Artifact file', path);

  await withWorkspaceTx(set.workspaceId, ['artifactFiles'], async (ctx) => {
    await ctx.db.artifactFiles.delete(file.id);
    ctx.emit({
      type: 'artifact.file_deleted',
      actorType: actor === 'human' ? 'human' : actor === 'agent' ? 'agent' : 'system',
      objectType: 'artifact-file',
      objectId: file.id,
      summary: `Deleted ${file.path}`,
      payload: { path: file.path },
    });
  });
  return ok({ deleted: file.path });
}

export async function renameArtifactFile(
  artifactSetId: string,
  fromPath: string,
  toPath: string,
): Promise<Result<ArtifactFile>> {
  const pathCheck = validateArtifactPath(toPath);
  if (!pathCheck.ok) return pathCheck;
  const file = await getArtifactFileByPath(artifactSetId, fromPath);
  if (!file) return notFound('Artifact file', fromPath);
  const clash = await getArtifactFileByPath(artifactSetId, pathCheck.value.path);
  if (clash) return invalid(`A file already exists at ${pathCheck.value.path}`);

  const next: ArtifactFile = {
    ...file,
    path: pathCheck.value.path,
    mediaType: pathCheck.value.mediaType,
    revision: file.revision + 1,
    updatedAt: isoNow(),
  };
  await getDb().artifactFiles.put(next);
  return ok(next);
}

export async function listArtifactVersions(artifactFileId: string): Promise<ArtifactVersion[]> {
  const versions = await getDb().artifactVersions.where('artifactFileId').equals(artifactFileId).toArray();
  return versions.sort((a, b) => a.revision - b.revision);
}

export interface ArtifactHistoryStorage {
  versionCount: number;
  versionsWithContent: number;
  contentBytes: number;
}

export async function getArtifactHistoryStorage(workspaceId: string): Promise<ArtifactHistoryStorage> {
  const workspace = await getDb().workspaces.get(workspaceId);
  if (!workspace) return { versionCount: 0, versionsWithContent: 0, contentBytes: 0 };
  const versions = await getDb().artifactVersions.where('workspaceId').equals(workspaceId).toArray();
  const bodies = versions.filter((version) => typeof version.content === 'string');
  return {
    versionCount: versions.length,
    versionsWithContent: bodies.length,
    contentBytes: bodies.reduce((sum, version) => sum + version.sizeBytes, 0),
  };
}

/**
 * Human-only recovery action for portable exports that have accumulated large
 * file histories. Current files are untouched. Version identifiers, hashes,
 * sizes, paths, summaries, and timestamps remain as tamper-evident evidence;
 * only the historical bodies become unrecoverable.
 */
export async function purgeArtifactVersionContents(
  workspaceId: string,
  actor: 'human',
): Promise<Result<{ purgedVersions: number; purgedBytes: number }>> {
  const workspace = await getDb().workspaces.get(workspaceId);
  if (!workspace) return notFound('Workspace', workspaceId);

  return withWorkspaceTx(workspaceId, ['artifactVersions'], async (ctx) => {
    const versions = await ctx.db.artifactVersions.where('workspaceId').equals(workspaceId).toArray();
    const withBodies = versions.filter((version) => typeof version.content === 'string');
    const purgedBytes = withBodies.reduce((sum, version) => sum + version.sizeBytes, 0);
    if (withBodies.length === 0) return ok({ purgedVersions: 0, purgedBytes: 0 });

    const contentPurgedAt = isoNow();
    await ctx.db.artifactVersions.bulkPut(withBodies.map((version) => ({
      ...version,
      content: null,
      contentPurgedAt,
    })));
    ctx.emit({
      type: 'artifact.history_purged',
      actorType: actor,
      objectType: 'workspace',
      objectId: workspaceId,
      summary: `Removed stored contents from ${withBodies.length} file versions (${purgedBytes} bytes); hashes and metadata remain`,
      payload: { purgedVersions: withBodies.length, purgedBytes },
    });
    return ok({ purgedVersions: withBodies.length, purgedBytes });
  });
}
