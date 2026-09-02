import { Link } from 'react-router-dom';
import type { MissionPlan } from '../../cherry/workforce/mission-plan-model.ts';
import type { MissionCard } from '../../cherry/workforce/mission-control-service.ts';

const STATUS_LABEL: Record<MissionPlan['status'], string> = {
  draft: 'Planned',
  validated: 'Planned',
  ready: 'Ready',
  running: 'Working',
  waiting_for_human: 'Needs you',
  verifying: 'Checking',
  succeeded: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const STATUS_CLASS: Record<MissionPlan['status'], string> = {
  draft: 'sticker',
  validated: 'sticker',
  ready: 'sticker sticker-blue',
  running: 'sticker sticker-cherry',
  waiting_for_human: 'sticker sticker-wait',
  verifying: 'sticker sticker-blue',
  succeeded: 'sticker sticker-pass',
  failed: 'sticker sticker-fail',
  cancelled: 'sticker',
};

export function missionStatusLabel(status: MissionPlan['status']): string {
  return STATUS_LABEL[status];
}

export function missionStatusClass(status: MissionPlan['status']): string {
  return STATUS_CLASS[status];
}

const VERIFICATION_LABEL: Record<MissionCard['verification'], string> = {
  not_started: 'Checks not started',
  checking: 'Checking the work',
  passed: 'All required checks passed',
  failed: 'A required check failed',
};

/** One mission as a card: real counts, real hosts, real boundaries, nothing decorative. */
export function MissionCardView({ card }: { card: MissionCard }) {
  return (
    <article className="stack" style={{ border: 'var(--border)', borderRadius: 'var(--radius-cards)', padding: 'var(--sp-3)', gap: 'var(--sp-2)' }} data-testid="mission-card" data-status={card.status}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Link to={`/studio/control/${card.missionId}`} style={{ fontWeight: 600 }} data-testid="open-mission">{card.outcome}</Link>
        <span className={missionStatusClass(card.status)}>{missionStatusLabel(card.status)}</span>
      </div>
      <dl className="mission-card-facts">
        <div><dt className="label">Workers</dt><dd className="tnum">{card.activeWorkers} active of {card.nodeCount} tasks</dd></div>
        <div><dt className="label">Hosts</dt><dd>{card.hosts.length > 0 ? card.hosts.join(', ') : 'chosen at start'}</dd></div>
        <div><dt className="label">Boundary</dt><dd className="mono">{card.boundaries.length > 0 ? card.boundaries.join(', ') : 'none yet'}</dd></div>
        <div><dt className="label">Next</dt><dd>{card.nextDependency ? `waiting on ${card.nextDependency}` : 'no dependency waiting'}</dd></div>
        <div><dt className="label">Checks</dt><dd>{VERIFICATION_LABEL[card.verification]}</dd></div>
        <div><dt className="label">Approvals</dt><dd className="tnum">{card.pendingApprovals} pending</dd></div>
      </dl>
      <span className="label" style={{ textTransform: 'none', letterSpacing: 0 }}>
        {card.runnerBound ? 'Bound to your paired runner' : 'Not started on a runner'} · last event {card.lastEventAt.slice(0, 16).replace('T', ' ')}
      </span>
    </article>
  );
}
