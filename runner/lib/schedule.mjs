/**
 * Schedule math for the runner — a dependency-free reimplementation of the
 * semantics in src/cherry/workforce/workforce-model.ts (ScheduleSpec,
 * validateSchedule, nextRunAt). Deterministic and DST-aware via Intl.
 * Kinds: manual | once | interval | daily | weekly.
 */

export const MIN_INTERVAL_MINUTES = 5;
export const MAX_INTERVAL_MINUTES = 30 * 24 * 60;

const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Returns human-readable problems; empty array means the spec is valid. */
export function validateSchedule(spec) {
  const problems = [];
  if (!spec || typeof spec !== 'object') return ['schedule must be an object'];
  switch (spec.kind) {
    case 'manual':
      break;
    case 'once':
      if (Number.isNaN(Date.parse(spec.runAt))) problems.push('once.runAt must be a valid ISO timestamp');
      break;
    case 'interval':
      if (!Number.isInteger(spec.everyMinutes)) problems.push('interval.everyMinutes must be an integer');
      else if (spec.everyMinutes < MIN_INTERVAL_MINUTES) problems.push(`interval must be at least ${MIN_INTERVAL_MINUTES} minutes`);
      else if (spec.everyMinutes > MAX_INTERVAL_MINUTES) problems.push('interval must be at most 30 days');
      if (Number.isNaN(Date.parse(spec.startAt))) problems.push('interval.startAt must be a valid ISO timestamp');
      break;
    case 'daily':
      if (!LOCAL_TIME_PATTERN.test(spec.localTime)) problems.push('daily.localTime must be HH:MM (24h)');
      if (!isValidTimeZone(spec.timeZone)) problems.push('daily.timeZone must be a valid IANA time zone');
      break;
    case 'weekly':
      if (!LOCAL_TIME_PATTERN.test(spec.localTime)) problems.push('weekly.localTime must be HH:MM (24h)');
      if (!isValidTimeZone(spec.timeZone)) problems.push('weekly.timeZone must be a valid IANA time zone');
      if (!Array.isArray(spec.weekdays) || spec.weekdays.length === 0) problems.push('weekly.weekdays must not be empty');
      else if (spec.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
        problems.push('weekly.weekdays entries must be 0 (Sunday) through 6 (Saturday)');
      }
      break;
    default:
      problems.push(`unknown schedule kind ${String(spec.kind)}`);
  }
  return problems;
}

/** Minutes that `timeZone`'s wall clock is ahead of UTC at the given instant. */
function offsetMinutesAt(utcMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const get = (type) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  const wallMs = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return Math.round((wallMs - utcMs) / 60000);
}

/**
 * UTC instant for a wall-clock date+time in a zone. DST-aware via the
 * standard two-pass offset correction; skipped wall times resolve to the
 * post-transition instant, which is the safe choice for schedules.
 */
function zonedInstant(year, month, day, hour, minute, timeZone) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let pass = 0; pass < 2; pass += 1) {
    guess = Date.UTC(year, month - 1, day, hour, minute, 0) - offsetMinutesAt(guess, timeZone) * 60000;
  }
  return guess;
}

function zonedDateParts(utcMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '';
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')), weekday: weekdayIndex };
}

/**
 * Next run strictly after `fromIso`, or null (manual, or a once schedule in
 * the past). Deterministic and DST-aware for daily/weekly.
 */
export function nextRunAt(spec, fromIso) {
  const from = Date.parse(fromIso);
  if (Number.isNaN(from)) throw new Error('nextRunAt: fromIso is not a valid timestamp');

  switch (spec.kind) {
    case 'manual':
      return null;
    case 'once': {
      const runAt = Date.parse(spec.runAt);
      return runAt > from ? new Date(runAt).toISOString() : null;
    }
    case 'interval': {
      const start = Date.parse(spec.startAt);
      const stepMs = spec.everyMinutes * 60000;
      if (start > from) return new Date(start).toISOString();
      const elapsed = from - start;
      const next = start + (Math.floor(elapsed / stepMs) + 1) * stepMs;
      return new Date(next).toISOString();
    }
    case 'daily':
    case 'weekly': {
      const [hourText, minuteText] = spec.localTime.split(':');
      const hour = Number(hourText);
      const minute = Number(minuteText);
      const weekdays = spec.kind === 'weekly' ? spec.weekdays : [0, 1, 2, 3, 4, 5, 6];
      // Walk day by day in the target zone; 9 days covers any weekday set + DST edges.
      for (let offset = 0; offset <= 9; offset += 1) {
        const probe = zonedDateParts(from + offset * 86400000, spec.timeZone);
        if (!weekdays.includes(probe.weekday)) continue;
        const instant = zonedInstant(probe.year, probe.month, probe.day, hour, minute, spec.timeZone);
        if (instant > from) return new Date(instant).toISOString();
      }
      return null;
    }
    default:
      throw new Error(`nextRunAt: unknown schedule kind ${String(spec.kind)}`);
  }
}
