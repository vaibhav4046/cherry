import { getDb } from '../persistence/cherry-db.ts';
import type { MemoryRecord, MemorySensitivity } from './memory-model.ts';

export async function selectMemoriesForContext(input: { workspaceId: string; missionId?: string | null; projectId?: string | null; sensitivity?: MemorySensitivity; now?: string }): Promise<MemoryRecord[]> {
  const now = Date.parse(input.now ?? new Date().toISOString());
  const maxSensitivity = input.sensitivity ?? 'private';
  const rank: Record<MemorySensitivity, number> = { public: 0, private: 1, sensitive: 2 };
  const records = await getDb().memories.where('workspaceId').equals(input.workspaceId).toArray();
  return records.filter((m) => {
    if (m.status !== 'approved' || (m.expiresAt && Date.parse(m.expiresAt) <= now)) return false;
    if (rank[m.sensitivity] > rank[maxSensitivity]) return false;
    if (m.scope === 'global' || m.scope === 'workspace') return true;
    if (m.scope === 'mission') return !!input.missionId && m.missionId === input.missionId;
    if (m.scope === 'project') return !!input.projectId && m.projectId === input.projectId;
    if (m.scope === 'run') return false;
    return false;
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
