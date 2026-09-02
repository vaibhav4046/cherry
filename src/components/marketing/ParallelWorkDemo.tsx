interface Lane {
  name: string;
  host: string;
  boundary: string;
  start: number;
  end: number;
}

const TOTAL_SECONDS = 300;

/** Example intervals in seconds; the two builders overlap by design. */
const LANES: readonly Lane[] = [
  { name: 'Developer fix', host: 'Codex', boundary: 'worktree-process', start: 0, end: 250 },
  { name: 'Content draft', host: 'Claude Code', boundary: 'process', start: 20, end: 210 },
  { name: 'Independent checks', host: 'Cherry', boundary: 'worktree-process', start: 250, end: 290 },
];

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Two workers whose run intervals overlap, then the verifier. Static example;
 * the real proof of parallelism is the runner event log, never a picture.
 */
export function ParallelWorkDemo() {
  return (
    <figure className="card gm-figure" data-testid="parallel-demo">
      <figcaption className="row gm-figure-head">
        <span className="label">Overlapping run intervals</span>
        <span className="sticker">Example</span>
      </figcaption>
      <div className="table-scroll">
      <table className="gm-timeline" aria-label="Example timeline of three workers">
        <thead>
          <tr>
            <th scope="col">Worker</th>
            <th scope="col">Interval</th>
            <th scope="col">Boundary</th>
          </tr>
        </thead>
        <tbody>
          {LANES.map((lane) => (
            <tr key={lane.name}>
              <th scope="row">
                <span className="gm-lane-name">{lane.name}</span>
                <span className="label">{lane.host}</span>
              </th>
              <td>
                <span className="gm-bar-track" aria-hidden="true">
                  <span
                    className={`gm-bar gm-bar-${lane.host === 'Cherry' ? 'verify' : 'work'}`}
                    style={{ left: `${(lane.start / TOTAL_SECONDS) * 100}%`, width: `${((lane.end - lane.start) / TOTAL_SECONDS) * 100}%` }}
                  />
                </span>
                <span className="tnum gm-bar-time">{clock(lane.start)} to {clock(lane.end)}</span>
              </td>
              <td className="mono">{lane.boundary}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="label gm-figure-note">Parallel means overlapping intervals recorded in the runner event log, not two cards on a screen.</p>
    </figure>
  );
}
