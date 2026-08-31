import { useEffect, useState } from 'react';
import { buildMemoryGraph } from '../../cherry/memory/memory-graph.ts';
import type { MemoryGraph as MemoryGraphData, MemoryGraphNode } from '../../cherry/memory/memory-graph-model.ts';

interface Props { workspaceId: string; missionId?: string | null; onSelectNode?: (nodeId: string) => void }

const labelFor = (node: MemoryGraphNode) => node.label ?? node.recordType.replace(/[-_]/g, ' ');

export default function MemoryGraph({ workspaceId, missionId, onSelectNode }: Props) {
  const [graph, setGraph] = useState<MemoryGraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { let alive = true; void buildMemoryGraph(workspaceId, missionId).then((result) => { if (!alive) return; if (result.ok) setGraph(result.value); else setError(result.error.message); }); return () => { alive = false; }; }, [workspaceId, missionId]);
  const select = (id: string) => { setSelected(id); onSelectNode?.(id); };
  if (error) return <section className="card" role="alert">Unable to load memory graph: {error}</section>;
  if (!graph) return <section className="card" role="status">Loading memory graph…</section>;
  return <section className="card memory-graph stack" aria-labelledby="memory-graph-title">
    <div className="row" style={{ justifyContent: 'space-between' }}><div><h2 id="memory-graph-title" className="subhead">Memory graph</h2><p className="label" style={{ margin: 0 }}>Persisted relationships · {graph.nodes.length} nodes · {graph.edges.length} edges</p></div><span className="sticker">{graph.createdAt ? `Snapshot generated ${new Date(graph.createdAt).toLocaleDateString()}` : 'Live snapshot'}</span></div>
    {graph.nodes.length === 0 ? <p className="label">No persisted records yet. Add a memory or source to see it here.</p> : <>
      <div className="memory-graph-canvas" role="group" aria-labelledby="memory-graph-title">
        <svg viewBox="0 0 800 260" role="img" aria-label="Interactive memory graph. Select a node or use the synchronized table below.">{graph.edges.map((edge) => { const a = graph.nodes.findIndex((n) => n.id === edge.source); const b = graph.nodes.findIndex((n) => n.id === edge.target); if (a < 0 || b < 0) return null; const x1 = 80 + (a % 6) * 130; const y1 = 55 + Math.floor(a / 6) * 85; const x2 = 80 + (b % 6) * 130; const y2 = 55 + Math.floor(b / 6) * 85; return <line key={edge.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeOpacity=".28" />; })}{graph.nodes.map((node, index) => { const x = 80 + (index % 6) * 130; const y = 55 + Math.floor(index / 6) * 85; const label = labelFor(node); return <g key={node.id} transform={`translate(${x} ${y})`} role="button" tabIndex={0} aria-label={`Select ${label}`} aria-pressed={selected === node.id} data-testid={`memory-graph-node-${node.id}`} onClick={() => select(node.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(node.id); } }}><circle r="24" fill="currentColor" opacity={selected === node.id ? 0.9 : 0.25} /><text textAnchor="middle" y="4" fontSize="9" fill="currentColor">{node.kind.slice(0, 8)}</text></g>; })}</svg>
      </div>
      <div className="table-scroll"><table className="data-table"><caption className="sr-only">Synchronized memory graph nodes</caption><thead><tr><th scope="col">Node</th><th scope="col">Kind</th><th scope="col">Status</th><th scope="col">Provenance</th></tr></thead><tbody>{graph.nodes.map((node) => { const provenance = node.provenance ?? []; return <tr key={node.id} className={selected === node.id ? 'is-selected' : ''}><td><button type="button" className="btn btn-sm" aria-pressed={selected === node.id} onClick={() => select(node.id)}>{labelFor(node)}</button></td><td>{node.kind}</td><td>{node.status ?? 'recorded'}{node.revision ? ` · r${node.revision}` : ''}</td><td>{provenance.length ? `${provenance.length} source${provenance.length === 1 ? '' : 's'}` : '—'}</td></tr>; })}</tbody></table></div>
    </>}
    {graph.diagnostics.length ? <p className="label" role="status">{graph.diagnostics.length} relationship diagnostic{graph.diagnostics.length === 1 ? '' : 's'} retained.</p> : null}
  </section>;
}
