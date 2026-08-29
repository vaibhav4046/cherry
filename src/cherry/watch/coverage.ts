import type {
  CoverageGap,
  CoverageReport,
  Lesson,
  Observation,
  TranscriptSegment,
} from './watch-model.ts';

interface Interval {
  start: number;
  end: number;
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end + 1) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

function totalSeconds(intervals: Interval[]): number {
  return intervals.reduce((sum, interval) => sum + Math.max(0, interval.end - interval.start), 0);
}

/**
 * Coverage is computed, never asserted. "Complete" requires declared criteria
 * and every criterion satisfied; full transcript processing alone is reported
 * as processed segments, not semantic understanding.
 */
export function computeCoverage(
  lesson: Lesson,
  segments: TranscriptSegment[],
  observations: Observation[],
): CoverageReport {
  const transcriptIntervals = mergeIntervals(
    segments.map((segment) => ({ start: segment.startSeconds, end: segment.endSeconds })),
  );
  const transcriptCoveredSeconds = Math.round(totalSeconds(transcriptIntervals));

  const gaps: CoverageGap[] = [];
  const observationTimes = observations.map((observation) => observation.timestampSeconds).sort((a, b) => a - b);

  const criteria = lesson.coverageCriteria;
  let satisfied = 0;
  for (const criterion of criteria) {
    const hit = observations.some(
      (observation) =>
        observation.timestampSeconds >= criterion.startSeconds &&
        observation.timestampSeconds <= criterion.endSeconds,
    );
    if (hit) {
      satisfied += 1;
    } else {
      gaps.push({
        startSeconds: criterion.startSeconds,
        endSeconds: criterion.endSeconds,
        reason: 'criterion_unmet',
        label: criterion.label,
      });
    }
  }

  // Long transcript stretches with no observation at all are surfaced as gaps.
  for (const interval of transcriptIntervals) {
    const GAP_WINDOW = 120;
    let cursor = interval.start;
    while (cursor < interval.end) {
      const windowEnd = Math.min(cursor + GAP_WINDOW, interval.end);
      const hasObservation = observationTimes.some((time) => time >= cursor && time <= windowEnd);
      if (!hasObservation && windowEnd - cursor >= 60) {
        gaps.push({ startSeconds: Math.round(cursor), endSeconds: Math.round(windowEnd), reason: 'no_observation' });
      }
      cursor = windowEnd;
    }
  }

  const duration = lesson.durationSeconds ?? null;
  if (duration && transcriptIntervals.length > 0) {
    const lastCovered = transcriptIntervals[transcriptIntervals.length - 1]!.end;
    if (duration - lastCovered > 90) {
      gaps.push({ startSeconds: Math.round(lastCovered), endSeconds: Math.round(duration), reason: 'uninspected' });
    }
  }

  const uncertaintyCount = observations.filter((observation) => observation.uncertainty !== 'confident').length;
  const complete = criteria.length > 0 && satisfied === criteria.length;

  let completenessNote: string;
  if (criteria.length === 0) {
    completenessNote = 'No coverage criteria declared yet. Coverage cannot be marked complete without them.';
  } else if (complete) {
    completenessNote = `All ${criteria.length} declared criteria have at least one observation. This covers declared segments, not every video frame.`;
  } else {
    completenessNote = `${satisfied} of ${criteria.length} declared criteria satisfied.`;
  }

  return {
    lessonId: lesson.id,
    durationSeconds: duration,
    transcriptSegmentCount: segments.length,
    transcriptCoveredSeconds,
    observationCount: observations.length,
    visualObservationCount: observations.filter((observation) => observation.kind === 'visual').length,
    spokenObservationCount: observations.filter((observation) => observation.kind === 'spoken').length,
    criteriaTotal: criteria.length,
    criteriaSatisfied: satisfied,
    gaps: gaps.sort((a, b) => a.startSeconds - b.startSeconds).slice(0, 100),
    uncertaintyCount,
    complete,
    completenessNote,
  };
}
