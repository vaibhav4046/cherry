import { POLICY_ROWS } from './landing-content.ts';

const DECISION_CLASS = { Automatic: 'sticker sticker-pass', Approval: 'sticker sticker-wait', Denied: 'sticker sticker-fail' } as const;

/** The default God Mode policy profile, as a table. */
export function ApprovalDemo() {
  return (
    <div className="card gm-figure" data-testid="approval-demo">
      <div className="row gm-figure-head">
        <span className="label">Default policy</span>
      </div>
      <div className="table-scroll">
      <table className="gm-policy" aria-label="Default policy by action">
        <thead>
          <tr>
            <th scope="col">Action</th>
            <th scope="col">Default</th>
          </tr>
        </thead>
        <tbody>
          {POLICY_ROWS.map((row) => (
            <tr key={row.action}>
              <td>{row.action}</td>
              <td><span className={DECISION_CLASS[row.decision]}>{row.decision}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="label gm-figure-note">Approvals bind the exact content hash. Any edit makes them stale. No agent tool can grant one.</p>
    </div>
  );
}
