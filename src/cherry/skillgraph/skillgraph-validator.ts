import type { SkillGraph } from './skillgraph-model.ts';

export interface GraphIssue {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Structural validation of a SkillGraph: identifiers, referential integrity,
 * dependency acyclicity, and required review gates. Deterministic — the same
 * graph always produces the same issue list.
 */
export function validateSkillGraph(graph: SkillGraph): GraphIssue[] {
  const issues: GraphIssue[] = [];

  if (!graph.name.trim()) issues.push({ code: 'name_empty', message: 'Skill name is required' });
  if (graph.slug && !SLUG_PATTERN.test(graph.slug)) {
    issues.push({ code: 'slug_invalid', message: `Slug "${graph.slug}" must be lowercase kebab-case` });
  }
  if (!SEMVER_PATTERN.test(graph.version)) {
    issues.push({ code: 'version_invalid', message: `Version "${graph.version}" is not semantic (x.y.z)` });
  }
  if (graph.nodes.length === 0) issues.push({ code: 'no_nodes', message: 'A skill needs at least one node' });
  if (graph.evaluations.length === 0) {
    issues.push({ code: 'no_evaluations', message: 'A skill needs at least one evaluation' });
  }
  if (graph.targets.length === 0) {
    issues.push({ code: 'no_targets', message: 'A skill needs at least one compile target' });
  }
  if (graph.memoryPolicy.requireApproval !== true) {
    issues.push({ code: 'memory_approval', message: 'Memory policy must require approval' });
  }

  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push({ code: 'node_duplicate', message: `Duplicate node id ${node.id}`, nodeId: node.id });
    }
    nodeIds.add(node.id);
    if (!node.title.trim()) issues.push({ code: 'node_title', message: 'Node title is required', nodeId: node.id });
    if (!node.goal.trim()) issues.push({ code: 'node_goal', message: 'Node goal is required', nodeId: node.id });
    if (node.onFailure.strategy === 'return-to-node' && !node.onFailure.targetNodeId) {
      issues.push({ code: 'node_failure_target', message: 'return-to-node needs a target node', nodeId: node.id });
    }
  }

  const evidenceIds = new Set((graph.knowledge ?? []).map((reference) => reference.evidenceId));
  const assertionIds = new Set(graph.evaluations.map((evaluation) => evaluation.id));
  const gateIds = new Set(graph.humanGates.map((gate) => gate.id));
  const toolIds = new Set(graph.tools.map((tool) => tool.id));

  for (const node of graph.nodes) {
    for (const evidenceId of node.evidenceIds) {
      if (evidenceIds.size > 0 && !evidenceIds.has(evidenceId)) {
        issues.push({
          code: 'node_evidence_missing',
          message: `Node references evidence ${evidenceId} that is not in the knowledge list`,
          nodeId: node.id,
        });
      }
    }
    for (const assertionId of node.assertionIds) {
      if (!assertionIds.has(assertionId)) {
        issues.push({
          code: 'node_assertion_missing',
          message: `Node references evaluation ${assertionId} that does not exist`,
          nodeId: node.id,
        });
      }
    }
    for (const gateId of node.humanGateIds) {
      if (!gateIds.has(gateId)) {
        issues.push({
          code: 'node_gate_missing',
          message: `Node references human gate ${gateId} that does not exist`,
          nodeId: node.id,
        });
      }
    }
    for (const toolId of node.allowedToolIds) {
      if (!toolIds.has(toolId)) {
        issues.push({
          code: 'node_tool_missing',
          message: `Node references tool ${toolId} that is not declared`,
          nodeId: node.id,
        });
      }
    }
    if (node.onFailure.strategy === 'return-to-node' && node.onFailure.targetNodeId) {
      if (!nodeIds.has(node.onFailure.targetNodeId)) {
        issues.push({
          code: 'node_failure_target_missing',
          message: `Failure target ${node.onFailure.targetNodeId} does not exist`,
          nodeId: node.id,
        });
      }
    }
  }

  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      issues.push({ code: 'edge_duplicate', message: `Duplicate edge id ${edge.id}`, edgeId: edge.id });
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source)) {
      issues.push({ code: 'edge_source_missing', message: `Edge source ${edge.source} does not exist`, edgeId: edge.id });
    }
    if (!nodeIds.has(edge.target)) {
      issues.push({ code: 'edge_target_missing', message: `Edge target ${edge.target} does not exist`, edgeId: edge.id });
    }
  }

  // Dependency edges must be acyclic.
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.type !== 'dependency') continue;
    const list = adjacency.get(edge.source) ?? [];
    list.push(edge.target);
    adjacency.set(edge.source, list);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const hasCycle = (nodeId: string): boolean => {
    if (visited.has(nodeId)) return false;
    if (visiting.has(nodeId)) return true;
    visiting.add(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      if (hasCycle(next)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };
  for (const nodeId of nodeIds) {
    if (hasCycle(nodeId)) {
      issues.push({ code: 'dependency_cycle', message: 'Dependency edges contain a cycle', nodeId });
      break;
    }
  }

  return issues;
}
