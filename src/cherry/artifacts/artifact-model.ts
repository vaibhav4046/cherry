export const ARTIFACT_MEDIA_TYPES: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  ts: 'text/plain',
  tsx: 'text/plain',
  jsx: 'text/javascript',
  json: 'application/json',
  md: 'text/markdown',
  txt: 'text/plain',
  svg: 'image/svg+xml',
};

export const MAX_ARTIFACT_FILE_BYTES = 512 * 1024;
export const MAX_ARTIFACT_SET_BYTES = 8 * 1024 * 1024;
export const MAX_ARTIFACT_FILES = 200;

export interface ArtifactSet {
  id: string;
  workspaceId: string;
  missionId: string;
  name: string;
  entryPath: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactFile {
  id: string;
  workspaceId: string;
  artifactSetId: string;
  path: string;
  mediaType: string;
  content: string;
  sizeBytes: number;
  sha256: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: 'human' | 'agent' | 'runner' | 'system';
}

export interface ArtifactVersion {
  id: string;
  workspaceId: string;
  artifactFileId: string;
  artifactSetId: string;
  path: string;
  revision: number;
  content: string;
  sha256: string;
  sizeBytes: number;
  createdAt: string;
  changeSummary: string;
}

export interface PreviewRuntimeMessage {
  kind: 'error' | 'log' | 'ready' | 'assert';
  message: string;
  detail?: string;
  at: string;
}
