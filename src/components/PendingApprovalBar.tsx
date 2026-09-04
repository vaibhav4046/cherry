import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { listApprovals } from '../cherry/skillgraph/skillgraph-service.ts';
import { approvalPath } from '../cherry/approval/approval-links.ts';
import type { ApprovalRecord } from '../cherry/approval/approval-model.ts';
import { useAppState } from '../app/AppState.tsx';

/**
 * One decision, always in reach.
 *
 * An agent working through WebMCP can request approval from a chat window the
 * person may not be looking at, and before this the only way to find the
 * request was to guess which screen it was on. The bar makes the outstanding
 * decision visible everywhere in the studio and links straight to it. It shows
 * what is waiting; it never decides anything.
 */
export function PendingApprovalBar() {
  const { activeWorkspace, webmcp } = useAppState();
  const location = useLocation();
  const [pending, setPending] = useState<ApprovalRecord[]>([]);

  const workspaceId = activeWorkspace?.id ?? null;
  // Re-read on navigation and after any tool call: those are exactly the moments
  // an approval appears or is decided.
  const callCount = webmcp.recentCalls.length;
  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) {
      setPending([]);
      return () => {
        cancelled = true;
      };
    }
    void listApprovals(workspaceId).then((approvals) => {
      if (!cancelled) setPending(approvals.filter((approval) => approval.decision === 'pending'));
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, location.pathname, callCount]);

  const next = pending[0];
  if (!next) return null;
  const target = approvalPath(next.objectType, next.objectId, next.id);
  const alreadyThere = location.pathname === target.split('?')[0];

  return (
    <div className="approval-bar" role="status" data-testid="pending-approval-bar">
      <span className="sticker sticker-wait">Waiting on you</span>
      <span className="approval-bar-text">
        {pending.length > 1 ? `${pending.length} decisions are waiting. ` : ''}
        <strong>{next.requestReason.slice(0, 120)}</strong>
        <span className="approval-bar-meta"> · version {next.objectRevision} · requested by {next.requestedBy.slice(0, 24)}</span>
      </span>
      {alreadyThere ? (
        <span className="label">Decide below</span>
      ) : (
        <Link className="btn btn-primary btn-sm" to={target} data-testid="pending-approval-open">
          Review and decide
        </Link>
      )}
    </div>
  );
}
