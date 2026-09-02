const PRIVATE_MATERIAL = /(?:[a-z]:\\|\\users\\|\/users\/|\/home\/|\/tmp\/|appdata|\.cherry-sandboxes|stdouttail|stderrtail)/i;
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_COMMIT = /^[a-f0-9]{40}$/;
const REPLAY_STATES = [
  'idle',
  'planning',
  'parallel',
  'verifying',
  'needs_human',
  'complete',
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function record(value, label) {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value;
}

function array(value, label) {
  invariant(Array.isArray(value), `${label} must be an array`);
  return value;
}

function string(value, label) {
  invariant(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`);
  return value;
}

function timestamp(value, label) {
  const result = string(value, label);
  invariant(Number.isFinite(Date.parse(result)), `${label} must be an ISO timestamp`);
  return result;
}

function integer(value, label) {
  invariant(Number.isSafeInteger(value), `${label} must be an integer`);
  return value;
}

function safeText(value, label) {
  const result = string(value, label);
  invariant(!PRIVATE_MATERIAL.test(result), `${label} contains private material`);
  return result;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

async function sha256(value) {
  invariant(globalThis.crypto?.subtle, 'Web Crypto SHA-256 is unavailable');
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validateRawEvents(value, missionId) {
  const events = array(value, 'events');
  invariant(events.length > 0, 'events must not be empty');
  let previousSequence = -1;
  let previousTime = -Infinity;

  return events.map((candidate, index) => {
    const event = record(candidate, `events[${index}]`);
    const sequence = integer(event.seq, `events[${index}].seq`);
    const at = timestamp(event.at, `events[${index}].at`);
    const instant = Date.parse(at);
    invariant(sequence > previousSequence, `event order is invalid at sequence ${sequence}`);
    invariant(instant >= previousTime, `event order is invalid at sequence ${sequence}`);
    previousSequence = sequence;
    previousTime = instant;

    const jobId = safeText(event.jobId, `events[${index}].jobId`);
    invariant(jobId === missionId || jobId.startsWith(`${missionId}:`), `events[${index}] belongs to another mission`);
    return {
      sequence,
      jobId,
      type: safeText(event.type, `events[${index}].type`),
      at,
      chain: safeText(event.chain, `events[${index}].chain`),
    };
  });
}

function validatePublicEvents(value, missionId) {
  const events = array(value, 'events');
  invariant(events.length > 0, 'events must not be empty');
  let previousSequence = -1;
  let previousTime = -Infinity;
  for (const [index, candidate] of events.entries()) {
    const event = record(candidate, `events[${index}]`);
    const sequence = integer(event.sequence, `events[${index}].sequence`);
    const at = timestamp(event.at, `events[${index}].at`);
    invariant(sequence > previousSequence, `event order is invalid at sequence ${sequence}`);
    invariant(Date.parse(at) >= previousTime, `event order is invalid at sequence ${sequence}`);
    previousSequence = sequence;
    previousTime = Date.parse(at);
    const jobId = safeText(event.jobId, `events[${index}].jobId`);
    invariant(jobId === missionId || jobId.startsWith(`${missionId}:`), `events[${index}] belongs to another mission`);
    safeText(event.type, `events[${index}].type`);
    safeText(event.chain, `events[${index}].chain`);
  }
}

function publicWorkers(nodes) {
  const entries = Object.entries(record(nodes, 'mission.nodes'))
    .sort(([, left], [, right]) => Date.parse(left.startedAt) - Date.parse(right.startedAt));
  invariant(entries.length >= 2, 'mission must contain at least two workers');

  return entries.map(([id, candidate], index) => {
    const node = record(candidate, `mission.nodes.${id}`);
    const sandbox = record(node.sandbox, `mission.nodes.${id}.sandbox`);
    const host = record(node.host, `mission.nodes.${id}.host`);
    const evaluation = record(node.evaluation, `mission.nodes.${id}.evaluation`);
    const checks = array(evaluation.checks, `mission.nodes.${id}.evaluation.checks`).map((candidateCheck, checkIndex) => {
      const check = record(candidateCheck, `mission.nodes.${id}.evaluation.checks[${checkIndex}]`);
      return {
        id: safeText(check.id, `check ${id}.${checkIndex}.id`),
        name: safeText(check.name, `check ${id}.${checkIndex}.name`),
        status: safeText(check.status, `check ${id}.${checkIndex}.status`),
        detail: safeText(check.detail, `check ${id}.${checkIndex}.detail`),
      };
    });
    invariant(checks.length > 0, `worker ${id} must have verification checks`);

    return {
      id: safeText(id, `worker ${index}.id`),
      label: safeText(node.id, `worker ${id}.label`),
      workspaceLabel: `Isolated worktree ${index + 1}`,
      boundary: safeText(sandbox.boundary, `worker ${id}.boundary`),
      baseCommit: safeText(sandbox.baseCommit, `worker ${id}.baseCommit`),
      hostVersion: safeText(host.version, `worker ${id}.hostVersion`),
      status: safeText(node.status, `worker ${id}.status`),
      startedAt: timestamp(node.startedAt, `worker ${id}.startedAt`),
      finishedAt: timestamp(node.finishedAt, `worker ${id}.finishedAt`),
      verificationStartedAt: timestamp(evaluation.startedAt, `worker ${id}.verificationStartedAt`),
      checks,
    };
  });
}

function measuredOverlap(workers, maxConcurrentNodes) {
  let best = null;
  for (let left = 0; left < workers.length; left += 1) {
    for (let right = left + 1; right < workers.length; right += 1) {
      const start = Math.max(Date.parse(workers[left].startedAt), Date.parse(workers[right].startedAt));
      const finish = Math.min(Date.parse(workers[left].finishedAt), Date.parse(workers[right].finishedAt));
      const durationMs = finish - start;
      if (durationMs > 0 && (!best || durationMs > best.durationMs)) {
        best = { workerIds: [workers[left].id, workers[right].id].sort(), durationMs };
      }
    }
  }
  invariant(best, 'overlap claim has no overlapping worker intervals');
  return { ...best, maxConcurrentNodes: integer(maxConcurrentNodes, 'maxConcurrentNodes') };
}

function replayStates(capture, mission, plan, workers, overlap) {
  const firstWorker = workers.reduce((earliest, worker) =>
    Date.parse(worker.startedAt) < Date.parse(earliest.startedAt) ? worker : earliest);
  const firstVerification = workers.reduce((earliest, worker) =>
    Date.parse(worker.verificationStartedAt) < Date.parse(earliest.verificationStartedAt) ? worker : earliest);
  const lastWorker = workers.reduce((latest, worker) =>
    Date.parse(worker.finishedAt) > Date.parse(latest.finishedAt) ? worker : latest);
  return [
    {
      state: 'idle',
      at: timestamp(capture.startedAt, 'startedAt'),
      title: 'Outcome recorded',
      summary: safeText(plan.outcome, 'mission.plan.outcome'),
    },
    {
      state: 'planning',
      at: timestamp(plan.createdAt, 'mission.plan.createdAt'),
      title: 'Plan bounded',
      summary: `${workers.length} independent work items prepared with explicit checks.`,
    },
    {
      state: 'parallel',
      at: firstWorker.startedAt,
      title: 'Parallel work measured',
      summary: `${overlap.workerIds.join(' and ')} overlapped for ${overlap.durationMs.toLocaleString('en-US')} ms.`,
    },
    {
      state: 'verifying',
      at: firstVerification.verificationStartedAt,
      title: 'Checks run independently',
      summary: `${workers.reduce((total, worker) => total + worker.checks.length, 0)} required checks passed at the worker boundaries.`,
    },
    {
      state: 'needs_human',
      at: lastWorker.finishedAt,
      title: 'Human authority retained',
      summary: 'The recorded mission made no public release action; an agent cannot approve or publish on a human’s behalf.',
    },
    {
      state: 'complete',
      at: timestamp(mission.finishedAt, 'mission.finishedAt'),
      title: 'Bounded work complete',
      summary: 'The fix and review succeeded with evidence; release authority remained with the human operator.',
    },
  ];
}

function validatePublicReplay(candidate) {
  const replay = record(candidate, 'replay');
  invariant(replay.label === 'Recorded real Codex run', 'replay label is invalid');
  const source = record(replay.source, 'source');
  invariant(GIT_COMMIT.test(string(source.captureCommit, 'source.captureCommit')), 'source capture commit is invalid');
  invariant(SHA256.test(string(source.captureSha256, 'source.captureSha256')), 'source capture hash is invalid');
  const mission = record(replay.mission, 'mission');
  const missionId = safeText(mission.id, 'mission.id');
  safeText(mission.outcome, 'mission.outcome');
  invariant(mission.status === 'succeeded', 'mission status is not succeeded');

  const states = array(replay.states, 'states');
  invariant(states.length === REPLAY_STATES.length, 'replay states are incomplete');
  states.forEach((candidateState, index) => {
    const state = record(candidateState, `states[${index}]`);
    invariant(state.state === REPLAY_STATES[index], `replay state order is invalid at ${index}`);
    timestamp(state.at, `states[${index}].at`);
    safeText(state.title, `states[${index}].title`);
    safeText(state.summary, `states[${index}].summary`);
  });

  const workers = array(replay.workers, 'workers');
  invariant(workers.length >= 2, 'replay workers are incomplete');
  workers.forEach((candidateWorker, index) => {
    const worker = record(candidateWorker, `workers[${index}]`);
    safeText(worker.id, `workers[${index}].id`);
    safeText(worker.label, `workers[${index}].label`);
    invariant(worker.workspaceLabel === `Isolated worktree ${index + 1}`, `workers[${index}] workspace label is invalid`);
    safeText(worker.boundary, `workers[${index}].boundary`);
    safeText(worker.baseCommit, `workers[${index}].baseCommit`);
    safeText(worker.hostVersion, `workers[${index}].hostVersion`);
    timestamp(worker.startedAt, `workers[${index}].startedAt`);
    timestamp(worker.finishedAt, `workers[${index}].finishedAt`);
    timestamp(worker.verificationStartedAt, `workers[${index}].verificationStartedAt`);
    array(worker.checks, `workers[${index}].checks`).forEach((check, checkIndex) => {
      const item = record(check, `workers[${index}].checks[${checkIndex}]`);
      safeText(item.id, 'check.id');
      safeText(item.name, 'check.name');
      safeText(item.status, 'check.status');
      safeText(item.detail, 'check.detail');
    });
  });
  const overlap = record(replay.overlap, 'overlap');
  const recomputed = measuredOverlap(workers, overlap.maxConcurrentNodes);
  invariant(canonicalJson(recomputed) === canonicalJson(overlap), 'overlap evidence does not match worker intervals');
  validatePublicEvents(replay.events, missionId);
  invariant(!PRIVATE_MATERIAL.test(JSON.stringify(replay)), 'replay contains private material');
  return replay;
}

export async function buildRecordedMissionFixture(captureText) {
  const capture = record(JSON.parse(string(captureText, 'captureText')), 'capture');
  const mission = record(capture.mission, 'mission');
  const plan = record(mission.plan, 'mission.plan');
  const missionId = safeText(mission.id, 'mission.id');
  invariant(mission.status === 'succeeded', 'mission must be succeeded');
  const workers = publicWorkers(mission.nodes);
  invariant(capture.overlap === true, 'capture does not claim overlap');
  invariant(capture.maxConcurrentNodes >= 2, 'capture does not prove concurrent workers');
  const overlap = measuredOverlap(workers, capture.maxConcurrentNodes);
  const events = validateRawEvents(capture.events, missionId);
  const sourceCapture = string(captureText, 'captureText');

  const replay = {
    schemaVersion: 1,
    label: 'Recorded real Codex run',
    source: {
      kind: 'committed-real-host-capture',
      captureCommit: string(capture.commit, 'commit'),
      captureSha256: await sha256(sourceCapture),
    },
    mission: {
      id: missionId,
      outcome: safeText(plan.outcome, 'mission.plan.outcome'),
      status: 'succeeded',
      startedAt: timestamp(mission.startedAt, 'mission.startedAt'),
      finishedAt: timestamp(mission.finishedAt, 'mission.finishedAt'),
    },
    states: replayStates(capture, mission, plan, workers, overlap),
    overlap,
    workers,
    events,
  };
  validatePublicReplay(replay);
  return {
    ...replay,
    integrity: {
      algorithm: 'SHA-256',
      replaySha256: await sha256(canonicalJson(replay)),
    },
  };
}

export async function verifyRecordedMissionFixture(candidate) {
  try {
    const replay = validatePublicReplay(candidate);
    const integrity = record(replay.integrity, 'integrity');
    invariant(integrity.algorithm === 'SHA-256', 'integrity algorithm is invalid');
    invariant(SHA256.test(string(integrity.replaySha256, 'integrity.replaySha256')), 'replay hash is invalid');
    const { integrity: omitted, ...unsignedReplay } = replay;
    void omitted;
    return (await sha256(canonicalJson(unsignedReplay))) === integrity.replaySha256;
  } catch {
    return false;
  }
}
