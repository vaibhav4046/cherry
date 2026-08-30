import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { listSkillGraphs } from '../../cherry/skillgraph/skillgraph-service.ts';
import type { SkillGraph } from '../../cherry/skillgraph/skillgraph-model.ts';
import { StickerCluster } from '../../components/Ribbon.tsx';

export default function Skills() {
  const { activeWorkspace } = useAppState();
  const [graphs, setGraphs] = useState<SkillGraph[]>([]);

  useEffect(() => {
    (async () => {
      if (activeWorkspace) setGraphs(await listSkillGraphs(activeWorkspace.id));
    })();
  }, [activeWorkspace]);

  if (!activeWorkspace) {
    return <div className="empty-state"><p className="subhead">Create a workspace first.</p></div>;
  }

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <h1 className="display-sm">Skills Library</h1>
      {graphs.length === 0 ? (
        <div className="empty-state">
          <StickerCluster />
          <p className="subhead" style={{ maxWidth: 520 }}>
            No skills yet. Learn from a lesson in a mission, compile the draft, and your first skill
            lands here with its evidence attached.
          </p>
          <Link to="/studio/missions/new" className="btn btn-primary">Start a mission</Link>
        </div>
      ) : (
        <div className="grid-cards">
          {graphs.map((graph) => (
            <Link key={graph.id} to={`/studio/skills/${graph.id}`} className="card stack" style={{ textDecoration: 'none' }}>
              <div className="row">
                <span className={graph.status === 'approved' ? 'sticker sticker-pass' : graph.status === 'rejected' ? 'sticker sticker-fail' : 'sticker sticker-wait'}>
                  {graph.status}
                </span>
                <span className="sticker">v{graph.version} · r{graph.revision}</span>
              </div>
              <h2 className="subhead">{graph.name}</h2>
              <p style={{ margin: 0 }}>{graph.purpose.slice(0, 160)}</p>
              <div className="row">
                <span className="sticker sticker-blue">{graph.nodes.length} nodes</span>
                <span className="sticker sticker-lavender">{graph.evaluations.length} evals</span>
                {graph.targets.map((target) => (
                  <span key={target} className="sticker">{target}</span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
