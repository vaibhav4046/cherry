/** Approval-bound YouTube channel-watch definition and routine envelope. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalize, computeActionHash, sha256Hex } from './canonical.mjs';
import { validateSchedule } from './schedule.mjs';
import { saveJsonAtomic } from './store.mjs';
import { validateYouTubeChannelId } from './youtube-rss-watch.mjs';

export const SOURCE_WATCH_NAMESPACE = 'source-watch';
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const ACTION_HASH_PATTERN = /^[a-f0-9]{64}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const WATCH_INTERVAL_MINUTES = 1440;

/** The exact cross-layer payload approved by the user. Do not add fields. */
export function sourceWatchApprovalPayload(input) {
  return {
    channelId: input?.channelId,
    revision: input?.revision,
    schedule: input?.schedule && typeof input.schedule === 'object'
      ? {
          kind: input.schedule.kind,
          everyMinutes: input.schedule.everyMinutes,
          startAt: input.schedule.startAt,
        }
      : input?.schedule,
    sourceId: input?.sourceId,
    workspaceId: input?.workspaceId,
  };
}

export function computeSourceWatchActionHash(input) {
  return sha256Hex(canonicalize(sourceWatchApprovalPayload(input)));
}

export function validateSourceWatchDefinition(input) {
  if (!input || typeof input !== 'object') return ['watch definition must be an object'];
  const problems = [];
  if (!validateYouTubeChannelId(input.channelId)) {
    problems.push('channelId must be exactly UC followed by 22 URL-safe characters');
  }
  if (!Number.isSafeInteger(input.revision) || input.revision < 1) problems.push('revision must be a positive integer');
  for (const field of ['sourceId', 'workspaceId']) {
    if (typeof input[field] !== 'string' || !IDENTIFIER_PATTERN.test(input[field])) {
      problems.push(`${field} must be a bounded identifier`);
    }
  }
  const scheduleProblems = validateSchedule(input.schedule);
  problems.push(...scheduleProblems);
  if (input.schedule && typeof input.schedule === 'object') {
    if (input.schedule.kind !== 'interval' || input.schedule.everyMinutes !== WATCH_INTERVAL_MINUTES) {
      problems.push(`source watches must use a ${WATCH_INTERVAL_MINUTES}-minute interval`);
    }
    if (typeof input.schedule.startAt !== 'string' || !ISO_TIMESTAMP_PATTERN.test(input.schedule.startAt)) {
      problems.push('source watch startAt must be a canonical ISO timestamp');
    }
    const keys = Object.keys(input.schedule).sort();
    if (canonicalize(keys) !== canonicalize(['everyMinutes', 'kind', 'startAt'])) {
      problems.push('source watch schedule has unexpected fields');
    }
  }
  if (!ACTION_HASH_PATTERN.test(input.actionHash ?? '')) {
    problems.push('actionHash must be a lowercase SHA-256 hex value');
  } else {
    try {
      if (computeSourceWatchActionHash(input) !== input.actionHash) {
        problems.push('actionHash does not match the canonical watch definition');
      }
    } catch (error) {
      problems.push(`watch definition is not canonicalizable: ${error.message}`);
    }
  }
  return problems;
}

export function sourceWatchRoutineId(sourceId) {
  if (typeof sourceId !== 'string' || !IDENTIFIER_PATTERN.test(sourceId)) throw new Error('sourceId must be a bounded identifier');
  return `rss-watch:${sourceId}`;
}

export function createSourceWatchRoutine(input) {
  const problems = validateSourceWatchDefinition(input);
  if (problems.length > 0) throw new Error(problems.join('; '));
  const definition = { ...sourceWatchApprovalPayload(input), actionHash: input.actionHash };
  const id = sourceWatchRoutineId(definition.sourceId);
  return {
    id,
    namespace: SOURCE_WATCH_NAMESPACE,
    schedule: definition.schedule,
    missedRunPolicy: 'run_once_on_reconnect',
    enabled: true,
    watch: definition,
    envelope: {
      schemaVersion: 1,
      workspaceId: definition.workspaceId,
      workItemId: id,
      workItemRevision: definition.revision,
      routineId: id,
      routineRevision: definition.revision,
      executionHostId: 'local-runner',
      adapter: 'youtube-rss-watch',
      workingDirectory: null,
      boundedPrompt: canonicalize({
        actionHash: definition.actionHash,
        channelId: definition.channelId,
        sourceId: definition.sourceId,
        workspaceId: definition.workspaceId,
      }),
      contextRefs: [],
      requiredCapabilities: ['network:https://www.youtube.com'],
      allowedExecutables: [],
      allowedOrigins: ['https://www.youtube.com'],
      sideEffects: ['source-watch-result'],
      dataEgress: ['channelId'],
      verificationPlan: [],
      approvalIntentId: null,
    },
  };
}

/** Reject persisted source-watch routines whose derived fields were edited. */
export function validateSourceWatchRoutine(routine) {
  if (!routine || routine.namespace !== SOURCE_WATCH_NAMESPACE) return ['routine is not a source watch'];
  const problems = validateSourceWatchDefinition(routine.watch);
  if (problems.length > 0) return problems;
  try {
    const expected = createSourceWatchRoutine(routine.watch);
    if (canonicalize(expected) !== canonicalize(routine)) {
      problems.push('persisted source-watch routine does not match its approved definition');
    }
  } catch (error) {
    problems.push(error.message);
  }
  return problems;
}

/** Match the three immutable values a caller must present for every watch route. */
export function sourceWatchBindingMatches(routine, binding) {
  return Boolean(
    routine
    && validateSourceWatchRoutine(routine).length === 0
    && binding
    && typeof binding.workspaceId === 'string'
    && Number.isSafeInteger(binding.revision)
    && typeof binding.actionHash === 'string'
    && routine.watch.workspaceId === binding.workspaceId
    && routine.watch.revision === binding.revision
    && routine.watch.actionHash === binding.actionHash,
  );
}

/** A queued job belongs to one exact approved revision, not merely its source id. */
export function sourceWatchJobMatchesRoutine(job, routine) {
  if (!job || !sourceWatchBindingMatches(routine, routine?.watch)) return false;
  const envelope = job.envelope;
  const expected = routine.envelope;
  return Boolean(
    envelope
    && envelope.adapter === 'youtube-rss-watch'
    && envelope.workspaceId === expected.workspaceId
    && envelope.workItemId === expected.workItemId
    && envelope.workItemRevision === expected.workItemRevision
    && envelope.routineId === expected.routineId
    && envelope.routineRevision === expected.routineRevision
    && envelope.boundedPrompt === expected.boundedPrompt
    && ACTION_HASH_PATTERN.test(envelope.actionHash ?? '')
    && computeActionHash(envelope) === envelope.actionHash,
  );
}

function validateTombstone(tombstone) {
  return Boolean(
    tombstone
    && typeof tombstone === 'object'
    && typeof tombstone.sourceId === 'string'
    && IDENTIFIER_PATTERN.test(tombstone.sourceId)
    && typeof tombstone.workspaceId === 'string'
    && IDENTIFIER_PATTERN.test(tombstone.workspaceId)
    && Number.isSafeInteger(tombstone.revision)
    && tombstone.revision >= 1
    && ACTION_HASH_PATTERN.test(tombstone.actionHash ?? '')
    && typeof tombstone.deletedAt === 'string'
    && ISO_TIMESTAMP_PATTERN.test(tombstone.deletedAt),
  );
}

/**
 * Durable deletion floor. A deleted approval cannot be replayed after a runner
 * restart; only a strictly newer human-approved revision may replace it.
 */
export class SourceWatchTombstoneStore {
  constructor({ dataDir, now = () => Date.now() }) {
    if (!dataDir) throw new Error('SourceWatchTombstoneStore requires a dataDir');
    this.file = join(dataDir, 'source-watch-tombstones.json');
    this.now = now;
    this.tombstones = {};
    if (existsSync(this.file)) {
      let stored;
      try {
        stored = JSON.parse(readFileSync(this.file, 'utf8'));
      } catch {
        throw new Error('source-watch tombstones are unreadable');
      }
      if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
        throw new Error('source-watch tombstones are invalid');
      }
      for (const [sourceId, tombstone] of Object.entries(stored)) {
        if (sourceId !== tombstone?.sourceId || !validateTombstone(tombstone)) {
          throw new Error('source-watch tombstones are invalid');
        }
      }
      this.tombstones = stored;
    }
  }

  get(sourceId) {
    return this.tombstones[sourceId] ?? null;
  }

  conflict(definition) {
    const tombstone = this.get(definition?.sourceId);
    if (!tombstone) return null;
    if (definition.workspaceId !== tombstone.workspaceId) {
      return 'sourceId belongs to a different workspace';
    }
    if (definition.revision <= tombstone.revision) {
      return `revision must be greater than deleted revision ${tombstone.revision}`;
    }
    return null;
  }

  record(routine) {
    const problems = validateSourceWatchRoutine(routine);
    if (problems.length > 0) throw new Error(`cannot tombstone invalid source watch: ${problems.join('; ')}`);
    const previous = this.get(routine.watch.sourceId);
    if (previous && previous.workspaceId !== routine.watch.workspaceId) {
      throw new Error('sourceId belongs to a different workspace');
    }
    if (previous && previous.revision > routine.watch.revision) {
      throw new Error(`cannot lower source-watch tombstone below revision ${previous.revision}`);
    }
    const tombstone = {
      sourceId: routine.watch.sourceId,
      workspaceId: routine.watch.workspaceId,
      revision: routine.watch.revision,
      actionHash: routine.watch.actionHash,
      deletedAt: new Date(this.now()).toISOString(),
    };
    this.tombstones[tombstone.sourceId] = tombstone;
    saveJsonAtomic(this.file, this.tombstones);
    return tombstone;
  }

  hides(routine) {
    const tombstone = this.get(routine?.watch?.sourceId);
    return Boolean(
      tombstone
      && routine.watch.workspaceId === tombstone.workspaceId
      && routine.watch.revision <= tombstone.revision,
    );
  }
}
