export type SourceKind = 'youtube' | 'article' | 'note' | 'file';
export type SourceStatus = 'saved' | 'ready' | 'archived';
export type SourceContentFormat = 'plain' | 'markdown' | 'json' | 'srt' | 'vtt';
export type SourceFetchStatus = 'not_requested' | 'queued' | 'fetched' | 'blocked' | 'failed';
export type SourceFetchMethod = 'user_paste' | 'upload' | 'scrapling_fetch';

export interface SourceRecord {
  id: string;
  workspaceId: string;
  lessonId: string;
  kind: SourceKind;
  status: SourceStatus;
  title: string;
  creator: string | null;
  url: string | null;
  contentFormat: SourceContentFormat | null;
  contentHash: string | null;
  fetchStatus: SourceFetchStatus;
  fetchMethod: SourceFetchMethod | null;
  fetchedAt: string | null;
  fetchError: string | null;
  permissionAcknowledgedAt: string | null;
  permissionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

