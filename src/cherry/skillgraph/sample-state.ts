import type { SkillGraph } from './skillgraph-model.ts';

/**
 * Durable actor used only by the shipped starter archive. Unlike the optional
 * workspace presentation flag, this value survives a portable archive import.
 */
export const SYNTHETIC_SAMPLE_APPROVER = 'sample-fixture-state';

export const SYNTHETIC_SAMPLE_NOTICE =
  'Labelled sample state. This file uses a synthetic approval to demonstrate Cherry\'s boundary; it is not proof of a live human decision. Review and approve your own revision before use.';

export function isSyntheticSampleGraph(
  graph: Pick<SkillGraph, 'approvedBy'>,
): boolean {
  return graph.approvedBy === SYNTHETIC_SAMPLE_APPROVER;
}

/** Keep Agent Skills frontmatter first while making the sample state visible. */
export function labelSyntheticSampleMarkdown(content: string): string {
  const notice = `> **Sample notice:** ${SYNTHETIC_SAMPLE_NOTICE}`;
  if (!content.startsWith('---\n')) return `${notice}\n\n${content}`;

  const frontmatterEnd = content.indexOf('\n---\n', 4);
  if (frontmatterEnd < 0) return `${notice}\n\n${content}`;
  const insertionPoint = frontmatterEnd + '\n---\n'.length;
  return `${content.slice(0, insertionPoint)}\n${notice}\n${content.slice(insertionPoint)}`;
}
