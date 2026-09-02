import { MISSION_DEMO_NODES, MISSION_DEMO_OUTCOME } from './landing-content.ts';

const KIND_LABEL = { agent: 'teammate', verify: 'independent checks', human: 'needs you' } as const;

/**
 * Outcome to graph, as a static, labelled example. The graph matches the
 * release-mission template Cherry instantiates in Mission Control.
 */
export function CherryMissionDemo() {
  return (
    <figure className="card gm-figure" data-testid="mission-demo">
      <figcaption className="row gm-figure-head">
        <span className="label">Outcome to mission graph</span>
        <span className="sticker">Example</span>
      </figcaption>
      <blockquote className="gm-outcome">{MISSION_DEMO_OUTCOME}</blockquote>
      <ol className="gm-graph" aria-label="Mission graph, in dependency order">
        {MISSION_DEMO_NODES.map((node) => (
          <li key={node.id} className={`gm-node gm-node-${node.kind}`}>
            <span className="gm-node-title">{node.title}</span>
            <span className="gm-node-meta">
              <span>{node.host}</span>
              <span className="mono">{node.boundary}</span>
              <span>{KIND_LABEL[node.kind]}</span>
            </span>
            {node.dependsOn.length > 0 ? (
              <span className="gm-node-deps label">after {node.dependsOn.map((id) => MISSION_DEMO_NODES.find((candidate) => candidate.id === id)?.title ?? id).join(' and ')}</span>
            ) : (
              <span className="gm-node-deps label">starts immediately</span>
            )}
          </li>
        ))}
      </ol>
    </figure>
  );
}
