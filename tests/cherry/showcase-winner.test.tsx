import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  buildRecordedMissionFixture,
  verifyRecordedMissionFixture,
} from '../../src/components/showcase/recorded-mission.mjs';
import { RecordedMissionPlayer } from '../../src/components/showcase/RecordedMissionPlayer';
import type { RecordedMissionFixture } from '../../src/components/showcase/recorded-mission.mjs';
// @ts-expect-error The owned Node ESM capture CLI is exercised through its runtime exports.
import { inspectWebm, writePublicReplay } from '../../scripts/capture-winner-demo.mjs';

const capturePath = resolve('docs/release/benchmarks/god-mode-hosts.json');
const captureText = readFileSync(capturePath, 'utf8');

describe('winner mission replay fixture', () => {
  it('derives an ordered, overlapping and public-safe replay from the committed real-host capture', async () => {
    const fixture = await buildRecordedMissionFixture(captureText);

    expect(fixture.label).toBe('Recorded real Codex run');
    expect(fixture.source.captureCommit).toBe('be0e713156b2c98b4c19ecfa0c77cd544a0ca715');
    expect(fixture.states.map((step) => step.state)).toEqual([
      'idle',
      'planning',
      'parallel',
      'verifying',
      'needs_human',
      'complete',
    ]);
    expect(fixture.overlap).toEqual({
      workerIds: ['developer-fix', 'review-notes'],
      durationMs: 34_513,
      maxConcurrentNodes: 2,
    });
    expect(fixture.workers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'developer-fix',
        hostVersion: 'codex-cli 0.152.1',
        boundary: 'worktree-process',
        workspaceLabel: 'Isolated worktree 1',
        checks: [expect.objectContaining({ status: 'passed' })],
      }),
      expect.objectContaining({
        id: 'review-notes',
        hostVersion: 'codex-cli 0.152.1',
        boundary: 'worktree-process',
        workspaceLabel: 'Isolated worktree 2',
        checks: [expect.objectContaining({ status: 'passed' })],
      }),
    ]));
    expect(fixture.events.map((event) => event.sequence)).toEqual([
      1, 2, 4, 5, 7, 10, 13, 14, 16, 17, 18, 19, 21, 22, 23, 24,
    ]);

    const publicBytes = JSON.stringify(fixture);
    expect(publicBytes).not.toMatch(/(?:[A-Z]:\\|AppData|\\Users\\|\.cherry-sandboxes|stdoutTail|stderrTail)/i);
    expect(await verifyRecordedMissionFixture(fixture)).toBe(true);
  });

  it('rejects a capture whose event sequence moves backwards', async () => {
    const raw = JSON.parse(captureText) as { events: Array<Record<string, unknown>> };
    [raw.events[0], raw.events[1]] = [raw.events[1]!, raw.events[0]!];

    await expect(buildRecordedMissionFixture(JSON.stringify(raw))).rejects.toThrow(/event order/i);
  });

  it('rejects a capture that claims overlap after its worker intervals stop overlapping', async () => {
    const raw = JSON.parse(captureText) as {
      mission: { nodes: Record<string, { startedAt: string; finishedAt: string }> };
    };
    raw.mission.nodes['review-notes']!.startedAt = '2026-09-02T13:40:00.000Z';
    raw.mission.nodes['review-notes']!.finishedAt = '2026-09-02T13:40:10.000Z';

    await expect(buildRecordedMissionFixture(JSON.stringify(raw))).rejects.toThrow(/overlap/i);
  });

  it('detects any change to the sealed public replay', async () => {
    const fixture = await buildRecordedMissionFixture(captureText);
    const tampered = structuredClone(fixture);
    tampered.workers[0]!.hostVersion = 'codex-cli forged';

    expect(await verifyRecordedMissionFixture(tampered)).toBe(false);
  });

  it('writes only the sealed public projection and produces identical bytes on repeat generation', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'cherry-recorded-mission-'));
    const firstPath = join(directory, 'first.json');
    const secondPath = join(directory, 'second.json');
    try {
      const first = await writePublicReplay(capturePath, firstPath);
      const second = await writePublicReplay(capturePath, secondPath);
      const firstBytes = readFileSync(firstPath, 'utf8');
      expect(first).toEqual({ outputPath: firstPath, bytes: Buffer.byteLength(firstBytes), verified: true });
      expect(readFileSync(secondPath, 'utf8')).toBe(firstBytes);
      expect(second.verified).toBe(true);
      expect(firstBytes).not.toMatch(/(?:[A-Z]:\\|AppData|\\Users\\|\.cherry-sandboxes|stdoutTail|stderrTail)/i);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('probes the shipped browser recording instead of reporting its requested capture window', async () => {
    const metadata = await inspectWebm(resolve('public/media/cherry-demo/mission-hero.webm'));
    expect(metadata.container).toBe('webm');
    expect(metadata.width).toBe(1440);
    expect(metadata.height).toBe(900);
    expect(metadata.durationMs).toBeGreaterThan(27_500);
    expect(metadata.durationMs).toBeLessThan(28_000);
    expect(metadata.bytes).toBeLessThan(6 * 1024 * 1024);
  });
});

describe('recorded mission player', () => {
  let fixture: RecordedMissionFixture;

  beforeAll(async () => {
    fixture = await buildRecordedMissionFixture(captureText);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes all six states and exact keyboard-operable controls without relying on color', () => {
    render(<RecordedMissionPlayer fixture={fixture} reducedMotion />);

    const player = screen.getByRole('region', { name: 'Recorded real Codex run' });
    expect(player.textContent).toContain('Step 1 of 6');
    expect(player.textContent).toContain('Outcome recorded');
    expect((screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Pause' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Restart' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Previous step' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Next step' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Open evidence' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByRole('listitem', { name: /1\. Idle, current step/i }).getAttribute('aria-current')).toBe('step');

    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(player.textContent).toContain('Step 2 of 6');
    expect(player.textContent).toContain('Plan bounded');
    expect(screen.getByRole('status').textContent).toContain('Step 2 of 6: Plan bounded');

    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(player.textContent).toContain('Outcome recorded');
  });

  it('plays, pauses and restarts the recorded sequence', () => {
    vi.useFakeTimers();
    render(<RecordedMissionPlayer fixture={fixture} stepDurationMs={800} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect((screen.getByRole('button', { name: 'Pause' }) as HTMLButtonElement).disabled).toBe(false);
    act(() => vi.advanceTimersByTime(800));
    expect(screen.getByRole('region', { name: 'Recorded real Codex run' }).textContent).toContain('Step 2 of 6');

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    act(() => vi.advanceTimersByTime(1_600));
    expect(screen.getByRole('region', { name: 'Recorded real Codex run' }).textContent).toContain('Step 2 of 6');

    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect(screen.getByRole('region', { name: 'Recorded real Codex run' }).textContent).toContain('Step 1 of 6');
  });

  it('blocks autoplay for reduced motion and opens the sealed evidence drawer', () => {
    vi.useFakeTimers();
    render(<RecordedMissionPlayer fixture={fixture} autoplay reducedMotion stepDurationMs={500} />);
    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByRole('region', { name: 'Recorded real Codex run' }).textContent).toContain('Step 1 of 6');

    fireEvent.click(screen.getByRole('button', { name: 'Open evidence' }));
    const evidence = screen.getByRole('region', { name: 'Run evidence' });
    expect(evidence.textContent).toContain('34,513 ms measured overlap');
    expect(evidence.textContent).toContain('codex-cli 0.152.1');
    expect(evidence.textContent).toContain('worktree-process');
    expect(evidence.textContent).toContain('node --test exits 0 in the worker worktree');
    expect(evidence.textContent).toContain('SHA-256');
    expect(evidence.textContent).toContain('Codex version');
    expect(evidence.textContent).toContain('Event log');
    expect(evidence.textContent).toContain('#1 mission_started');
    expect(evidence.textContent).toContain('Workspace roots');
    expect(evidence.textContent).toContain('Base commit');
    expect(evidence.textContent).toContain('18774c71f7a0d9ca4e06997093b1011c75f3ba85');
    expect(evidence.textContent).toContain('Approval status');
    expect(evidence.textContent).toContain('Not exercised in this recorded mission');
  });
});
