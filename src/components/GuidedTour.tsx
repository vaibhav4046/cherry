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
      body: 'Everything Cherry knows lives in your browser. The event strip below is the append-only proof ledger — every important action lands there, human or agent.',
      route: '/studio',
      lookFor: 'The mission list and the proof event strip.',
    },
    ...(activeMission
      ? [
          {
            title: 'The mission',
            body: 'A mission has an objective and a testable definition of done. Its state machine is enforced in the service layer — an agent cannot skip a state the UI would refuse.',
            route: `/studio/missions/${activeMission.id}`,
            lookFor: 'The state chip, the definition-of-done stickers, and the evidence ledger with trust labels.',
          },
        ]
      : []),
    ...(activeMission?.lessonId
      ? [
          {
            title: 'Cherry Watch',
            body: 'The lesson was learned here: transcript segments, timestamped observations (spoken vs visual kept distinct), and computed coverage that cannot claim completeness without declared criteria.',
            route: `/studio/watch/${activeMission.lessonId}`,
            lookFor: 'The coverage panel — criteria satisfied, gaps listed honestly.',
          },
        ]
      : []),
    ...(activeMission?.skillGraphId
      ? [
          {
            title: 'The SkillGraph',
            body: 'Observations became a versioned workflow. Every revision is snapshotted; approval binds to the exact revision reviewed. Edit anything and the approval goes stale — by design.',
            route: `/studio/skills/${activeMission.skillGraphId}`,
            lookFor: 'The revision history and the approval status showing who approved which revision.',
          },
        ]
      : []),
    ...(activeMission?.artifactSetId
      ? [
          {
            title: 'Real artifacts',
            body: 'These are real files with versions and hashes, previewed in a sandboxed iframe that cannot reach the network or Cherry’s data. In this example the first attempt failed verification and was repaired — check the receipt next.',
            route: `/studio/artifacts/${activeMission.artifactSetId}`,
            lookFor: 'The file tree, the hash under the editor, and the isolated preview.',
          },
        ]
      : []),
    {
      title: 'Proof',
      body: 'The receipt was generated from the event ledger. Hit "Recompute hashes" — the SHA-256 over canonical JSON recomputes in front of you. Change one byte anywhere and it fails.',
      route: '/studio/proof',
      lookFor: 'The failures-and-repairs section and the recompute button.',
    },
    {
      title: 'Agent View',
      body: 'This is the WebMCP story: at most five tools + two global reads exist at a time, chosen by the mission phase. Attach a compatible ChatGPT/Codex client and the registrations go live; every tool call lands in this log.',
      route: '/studio/agent',
      lookFor: 'The aperture table with the current phase highlighted.',
    },
    {
      title: 'Take it anywhere',
      body: 'Approved skills compile to a portable Agent Skills bundle with Codex and Claude Code targets and a standalone verification script. Export the workspace itself as hash-verified JSON. That’s the loop: teach once, prove it, take it with you.',
      route: '/studio/skills',
      lookFor: 'The skill card — open it and compile the bundle.',
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
