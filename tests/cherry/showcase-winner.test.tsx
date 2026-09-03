import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppStateProvider } from '../../src/app/AppState';
import {
  buildRecordedMissionFixture,
  canonicalJson,
  verifyRecordedMissionFixture,
} from '../../src/components/showcase/recorded-mission.mjs';
import { MissionFilm } from '../../src/components/showcase/MissionFilm';
import { RecordedMissionPlayer } from '../../src/components/showcase/RecordedMissionPlayer';
import type { RecordedMissionFixture } from '../../src/components/showcase/recorded-mission.mjs';
import { Showcase } from '../../src/pages/Showcase';
// @ts-expect-error The owned Node ESM capture CLI is exercised through its runtime exports.
import { inspectWebm, writePublicReplay } from '../../scripts/capture-winner-demo.mjs';

const capturePath = resolve('docs/release/benchmarks/god-mode-hosts.json');
const captureText = readFileSync(capturePath, 'utf8');
const expectedReplaySha256 = 'edd88812aaf1c91ad58e542362fb05908a9b0b373803dd7e132980f0284b5cad';

interface RawWorkerFixture {
  status?: string;
  sandbox?: { root?: string; boundary?: string; baseCommit?: string };
  host?: { hostId?: string; kind?: string; version?: string };
  evaluation?: { status?: string; checks: Array<{ status?: string }> };
}

interface RawCaptureFixture {
  maxConcurrentNodes?: number;
  mission: { nodes: Record<string, RawWorkerFixture> };
}

function rawCapture(): RawCaptureFixture {
  return JSON.parse(captureText) as RawCaptureFixture;
}

function firstRawWorker(capture: RawCaptureFixture): RawWorkerFixture {
  return capture.mission.nodes['developer-fix']!;
}

function recomputeEmbeddedHash(fixture: RecordedMissionFixture): void {
  const { integrity, ...payload } = fixture;
  void integrity;
  fixture.integrity.replaySha256 = createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

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

  it('rejects a forged replay even when an attacker recomputes its embedded self-hash', async () => {
    const fixture = await buildRecordedMissionFixture(captureText);
    const forged = structuredClone(fixture);
    forged.mission.outcome = 'Forged outcome with a matching embedded digest';
    recomputeEmbeddedHash(forged);

    expect(forged.integrity.replaySha256).not.toBe(expectedReplaySha256);
    expect(await verifyRecordedMissionFixture(forged)).toBe(false);
  });

  it.each([
    ['an impossible max concurrency claim', (raw: RawCaptureFixture) => { raw.maxConcurrentNodes = 99; }],
    ['a failed worker', (raw: RawCaptureFixture) => { firstRawWorker(raw).status = 'failed'; }],
    ['a failed evaluation', (raw: RawCaptureFixture) => { firstRawWorker(raw).evaluation!.status = 'failed'; }],
    ['a failed check', (raw: RawCaptureFixture) => { firstRawWorker(raw).evaluation!.checks[0]!.status = 'failed'; }],
    ['a shared-process boundary', (raw: RawCaptureFixture) => { firstRawWorker(raw).sandbox!.boundary = 'shared-process'; }],
    ['the wrong host id', (raw: RawCaptureFixture) => { firstRawWorker(raw).host!.hostId = 'other'; }],
    ['the wrong host kind', (raw: RawCaptureFixture) => { firstRawWorker(raw).host!.kind = 'other-cli'; }],
    ['a missing host', (raw: RawCaptureFixture) => { delete firstRawWorker(raw).host; }],
    ['the wrong base commit', (raw: RawCaptureFixture) => { firstRawWorker(raw).sandbox!.baseCommit = 'f'.repeat(40); }],
    ['a missing base commit', (raw: RawCaptureFixture) => { delete firstRawWorker(raw).sandbox!.baseCommit; }],
    ['the wrong workspace root', (raw: RawCaptureFixture) => { firstRawWorker(raw).sandbox!.root = 'C:\\shared\\worker'; }],
    ['a missing workspace root', (raw: RawCaptureFixture) => { delete firstRawWorker(raw).sandbox!.root; }],
    ['the wrong Codex version', (raw: RawCaptureFixture) => { firstRawWorker(raw).host!.version = 'codex-cli 999'; }],
    ['a missing Codex version', (raw: RawCaptureFixture) => { delete firstRawWorker(raw).host!.version; }],
  ])('rejects source evidence with %s', async (_label, mutate) => {
    const raw = rawCapture();
    mutate(raw);

    await expect(buildRecordedMissionFixture(JSON.stringify(raw))).rejects.toThrow();
  });

  it.each([
    ['failed worker status', (fixture: RecordedMissionFixture) => { fixture.workers[0]!.status = 'failed'; }],
    ['failed check status', (fixture: RecordedMissionFixture) => { fixture.workers[0]!.checks[0]!.status = 'failed'; }],
    ['the wrong boundary', (fixture: RecordedMissionFixture) => { fixture.workers[0]!.boundary = 'shared-process'; }],
    ['an impossible peak', (fixture: RecordedMissionFixture) => { fixture.overlap.maxConcurrentNodes = 99; }],
  ])('rejects structurally false public success evidence with %s', async (_label, mutate) => {
    const fixture = await buildRecordedMissionFixture(captureText);
    const forged = structuredClone(fixture);
    mutate(forged);
    recomputeEmbeddedHash(forged);

    expect(await verifyRecordedMissionFixture(forged, forged.integrity.replaySha256)).toBe(false);
  });

  it('writes only the sealed public projection and produces identical bytes on repeat generation', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'cherry-recorded-mission-'));
    const firstPath = join(directory, 'first.json');
    const secondPath = join(directory, 'second.json');
    const firstTrustPath = join(directory, 'first-trust.mjs');
    const secondTrustPath = join(directory, 'second-trust.mjs');
    try {
      const first = await writePublicReplay(capturePath, firstPath, firstTrustPath);
      const second = await writePublicReplay(capturePath, secondPath, secondTrustPath);
      const firstBytes = readFileSync(firstPath, 'utf8');
      expect(first).toEqual({ outputPath: firstPath, bytes: Buffer.byteLength(firstBytes), verified: true });
      expect(readFileSync(secondPath, 'utf8')).toBe(firstBytes);
      expect(readFileSync(firstTrustPath, 'utf8')).toBe(
        `// Generated by scripts/capture-winner-demo.mjs; do not hand-edit.\nexport const RECORDED_MISSION_EXPECTED_SHA256 = '${expectedReplaySha256}';\n`,
      );
      expect(readFileSync(secondTrustPath, 'utf8')).toBe(readFileSync(firstTrustPath, 'utf8'));
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

describe('mission film', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('derives its control from actual media events and reports a rejected play request', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValueOnce(new DOMException('Autoplay blocked', 'NotAllowedError'));
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    render(<MissionFilm reducedMotion={false} />);

    const film = screen.getByLabelText('Silent mission film');
    expect(screen.getByRole('button', { name: 'Play film' })).toBeTruthy();
    fireEvent.play(film);
    expect(screen.getByRole('button', { name: 'Pause film' })).toBeTruthy();
    fireEvent.pause(film);
    expect(screen.getByRole('button', { name: 'Play film' })).toBeTruthy();
    fireEvent.play(film);
    fireEvent.ended(film);
    expect(screen.getByRole('button', { name: 'Play film' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Play film' }));
    expect((await screen.findByRole('status')).textContent).toContain('The mission film could not play.');
    expect(screen.getByRole('button', { name: 'Retry film' })).toBeTruthy();
  });
});

describe('Showcase replay loading', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not publish a replay whose digest finishes after its request was aborted', async () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    const fixture = await buildRecordedMissionFixture(captureText);
    const abortedReplay = structuredClone(fixture);
    const currentReplay = structuredClone(fixture);
    let resolveAbortedFetch = (_response: { ok: boolean; json: () => Promise<RecordedMissionFixture> }) => {};
    const abortedFetch = new Promise<{ ok: boolean; json: () => Promise<RecordedMissionFixture> }>((resolveFetch) => {
      resolveAbortedFetch = resolveFetch;
    });
    const fetchMock = vi.fn()
      .mockReturnValueOnce(abortedFetch)
      .mockResolvedValue({ ok: true, json: async () => currentReplay });
    vi.stubGlobal('fetch', fetchMock);

    const originalDigest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
    let releaseDigest = () => {};
    let markDigestStarted = () => {};
    const digestGate = new Promise<void>((resolveGate) => { releaseDigest = resolveGate; });
    const digestStarted = new Promise<void>((resolveStarted) => { markDigestStarted = resolveStarted; });
    vi.spyOn(globalThis.crypto.subtle, 'digest')
      .mockImplementationOnce((algorithm, data) => originalDigest(algorithm, data))
      .mockImplementationOnce(async (algorithm, data) => {
        const digest = await originalDigest(algorithm, data);
        markDigestStarted();
        await digestGate;
        return digest;
      })
      .mockImplementation((algorithm, data) => originalDigest(algorithm, data));

    render(
      <StrictMode>
        <MemoryRouter>
          <AppStateProvider><Showcase /></AppStateProvider>
        </MemoryRouter>
      </StrictMode>,
    );
    expect(await screen.findAllByText(fixture.mission.outcome)).toHaveLength(2);
    await act(async () => {
      resolveAbortedFetch({ ok: true, json: async () => abortedReplay });
    });
    await digestStarted;
    abortedReplay.mission.outcome = 'Stale replay from the aborted request';
    await act(async () => {
      releaseDigest();
      await new Promise((resolveTick) => setTimeout(resolveTick, 0));
    });

    await waitFor(() => expect(screen.queryByText('Stale replay from the aborted request')).toBeNull());
  });
});

describe('recorded mission player', () => {
  let fixture: RecordedMissionFixture;

  beforeAll(async () => {
    fixture = await buildRecordedMissionFixture(captureText);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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
