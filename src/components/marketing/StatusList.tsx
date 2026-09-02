import { STATUS_CLASS, type StatusRow } from './landing-content.ts';

interface StatusListProps {
  rows: readonly StatusRow[];
  label: string;
  testId: string;
  /** Optional line rendered under the name (used by run paths for the runtime). */
  secondary?: (row: StatusRow) => string | null;
}

/** A labelled list of rows with an honest public status chip on each. */
export function StatusList({ rows, label, testId, secondary }: StatusListProps) {
  return (
    <div className="card gm-figure" data-testid={testId}>
      <div className="row gm-figure-head">
        <span className="label">{label}</span>
      </div>
      <ul className="gm-status-list">
        {rows.map((row) => {
          const extra = secondary?.(row) ?? null;
          return (
            <li key={row.name} className="gm-status-row">
              <div className="gm-status-copy">
                <span className="gm-status-name">{row.name}</span>
                {extra ? <span className="gm-status-runtime">{extra}</span> : null}
                <span className="gm-status-detail">{row.detail}</span>
              </div>
              <span className={STATUS_CLASS[row.status]} data-testid="status-chip">{row.status}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
