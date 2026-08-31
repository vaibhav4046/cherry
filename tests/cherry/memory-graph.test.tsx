import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BrandIcon, BrandMark } from '../../src/components/BrandIcons.tsx';
import MemoryGraph from '../../src/pages/studio/MemoryGraph.tsx';
import { freshDb } from '../setup.ts';
import { createWorkspace } from '../../src/cherry/mission/mission-service.ts';
import { proposeMemory } from '../../src/cherry/memory/memory-service.ts';
import { unwrap } from '../../src/cherry/core/result.ts';

describe('premium graph and brand marks', () => {
  beforeEach(() => freshDb());
  it('renders persisted graph labels and synchronized table fallback', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Graph UI' }));
    unwrap(await proposeMemory({ workspaceId: workspace.id, type: 'preference', title: 'Use concise copy', content: 'Keep labels short', scope: 'workspace', provenance: [{ sourceType: 'human', description: 'test' }] }));
    render(<MemoryGraph workspaceId={workspace.id} />);
    expect(await screen.findByText('Use concise copy')).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
  });
  it('keeps SVG nodes keyboard-activatable and synchronized with the table', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Keyboard graph' }));
    unwrap(await proposeMemory({ workspaceId: workspace.id, type: 'preference', title: 'Keyboard node', content: 'Select me', scope: 'workspace', provenance: [{ sourceType: 'human', description: 'test' }] }));
    const onSelectNode = vi.fn();
    render(<MemoryGraph workspaceId={workspace.id} onSelectNode={onSelectNode} />);
    const node = await screen.findByRole('button', { name: 'Select Keyboard node' });
    fireEvent.keyDown(node, { key: 'Enter' });
    expect(onSelectNode).toHaveBeenCalledWith(expect.any(String));
    expect(node.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('table')).toBeTruthy();
  });
  it('exposes recognizable inline SVG brand names and accessible labels', () => {
    render(<><BrandMark brand="slack" /><BrandMark brand="teams" /><BrandIcon brand="github" /></>);
    expect(screen.getByText('Slack')).toBeTruthy();
    expect(screen.getByText('Microsoft Teams')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'GitHub icon' })).toBeTruthy();
  });
});
