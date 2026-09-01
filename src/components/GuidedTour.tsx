import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../app/AppState.tsx';
import { Icons } from './Icons.tsx';

const TOUR_KEY = 'cherry.tour.step';

export function startTour(): void {
  try {
    localStorage.setItem(TOUR_KEY, '0');
  } catch {
    // Storage unavailable: the tour simply will not persist.
  }
}

export function isTourActive(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) !== null;
  } catch {
    return false;
  }
}

interface TourStep {
  title: string;
  body: string;
  route: string | null;
  lookFor: string;
}

/**
 * Replayable walkthrough over REAL workspace state. Steps navigate to actual
 * routes with actual data — the tour never renders content of its own beyond
 * the explainer card. Steps that need records the workspace does not have are
 * skipped, honestly.
 */
export function GuidedTour() {
  const { activeMission } = useAppState();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState<number | null>(() => {
    try {
      const stored = localStorage.getItem(TOUR_KEY);
      return stored === null ? null : Number(stored);
    } catch {
      return null;
    }
  });

  // Another tab / the demo entry can start the tour after mount.
  useEffect(() => {
    const interval = window.setInterval(() => {
      try {
        const stored = localStorage.getItem(TOUR_KEY);
        const parsed = stored === null ? null : Number(stored);
        setStepIndex((current) => (current === parsed ? current : parsed));
      } catch {
        /* ignore */
      }
    }, 500);
    return () => window.clearInterval(interval);
  }, []);

  const steps: TourStep[] = [
    {
      title: 'Welcome to the workshop',
      body: 'Everything Cherry knows lives in your browser. Proof history records every important action by you, Cherry, or your agent.',
      route: '/studio',
      lookFor: 'The project list and Proof history.',
    },
    ...(activeMission
      ? [
          {
            title: 'The project',
            body: 'A project has one clear goal and checks that define done. Cherry keeps each step in order, so neither you nor your agent can skip required review.',
            route: `/studio/missions/${activeMission.id}`,
            lookFor: 'The status, completion checks, and source notes with review labels.',
          },
        ]
      : []),
    ...(activeMission?.lessonId
      ? [
          {
            title: 'The source',
            body: 'The transcript and your notes sit here with timestamps. Spoken and visual notes stay separate. Cherry only marks coverage complete when every listed check is met.',
            route: `/studio/watch/${activeMission.lessonId}`,
            lookFor: 'The coverage panel, including passed checks and any gaps.',
          },
        ]
      : []),
    ...(activeMission?.skillGraphId
      ? [
          {
            title: 'The skill',
            body: 'Source notes became a saved workflow. You approve the exact version you read. Editing it requires another approval.',
            route: `/studio/skills/${activeMission.skillGraphId}`,
            lookFor: 'Version history and the approval status for each version.',
          },
        ]
      : []),
    ...(activeMission?.artifactSetId
      ? [
          {
            title: 'Real files',
            body: 'These are saved files with versions and hashes. The preview is isolated from the network and Cherry’s data. In this example, the first check failed and was repaired. Open Proof next.',
            route: `/studio/artifacts/${activeMission.artifactSetId}`,
            lookFor: 'The file list, the hash under the editor, and the isolated preview.',
          },
        ]
      : []),
    {
      title: 'Proof',
      body: 'Choose "Recompute hashes" to check the proof again. The result comes from recorded data, and changing one byte makes the check fail.',
      route: '/studio/proof',
      lookFor: 'Failed checks, repairs, and the recompute button.',
    },
    {
      title: 'Agent View',
      body: 'Cherry gives a connected agent at most five action tools and two read-only tools at once. The available tools follow the current project step. Every call appears in this log.',
      route: '/studio/agent',
      lookFor: 'The tools table with the current project step highlighted.',
    },
    {
      title: 'Take it anywhere',
      body: 'Approved skills download as a bundle for Codex and Claude Code, including a verification script. You can also export your space as checked JSON. Teach once, approve what you read, and reuse it.',
      route: '/studio/skills',
      lookFor: 'The skill card. Open it and download the bundle.',
    },
  ];

  const stop = useCallback(() => {
    try {
      localStorage.removeItem(TOUR_KEY);
    } catch {
      /* ignore */
    }
    setStepIndex(null);
  }, []);

  if (stepIndex === null) return null;
  const boundedIndex = Math.min(stepIndex, steps.length - 1);
  const step = steps[boundedIndex]!;

  function goTo(index: number) {
    const clamped = Math.max(0, Math.min(index, steps.length - 1));
    try {
      localStorage.setItem(TOUR_KEY, String(clamped));
    } catch {
      /* ignore */
    }
    setStepIndex(clamped);
    const target = steps[clamped]!;
    if (target.route) navigate(target.route);
  }

  return (
    <aside className="tour-card" role="dialog" aria-label="Guided walkthrough" data-testid="guided-tour">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="sticker sticker-cherry">Walkthrough · {boundedIndex + 1}/{steps.length}</span>
        <button type="button" className="btn btn-sm" onClick={stop} aria-label="Exit walkthrough">{Icons.close(16)}</button>
      </div>
      <h2 className="subhead" style={{ fontSize: 20 }}>{step.title}</h2>
      <p style={{ margin: 0, fontSize: 14 }}>{step.body}</p>
      <p className="label" style={{ margin: 0 }}>Look for: {step.lookFor}</p>
      <div className="row">
        <button type="button" className="btn btn-sm" onClick={() => goTo(boundedIndex - 1)} disabled={boundedIndex === 0}>
          Back
        </button>
        {boundedIndex < steps.length - 1 ? (
          <button type="button" className="btn btn-sm btn-primary" onClick={() => goTo(boundedIndex + 1)} data-testid="tour-next">
            Next
          </button>
        ) : (
          <button type="button" className="btn btn-sm btn-primary" onClick={stop} data-testid="tour-finish">
            Finish
          </button>
        )}
      </div>
    </aside>
  );
}
