/** Injectable clock so tests can produce deterministic timestamps. */
export interface Clock {
  now(): Date;
  isoNow(): string;
}

export const systemClock: Clock = {
  now: () => new Date(),
  isoNow: () => new Date().toISOString(),
};

let activeClock: Clock = systemClock;

export function getClock(): Clock {
  return activeClock;
}

export function setClock(clock: Clock): void {
  activeClock = clock;
}

export function resetClock(): void {
  activeClock = systemClock;
}

export function isoNow(): string {
  return activeClock.isoNow();
}

/** Deterministic clock used by tests and fixture generation. */
export function fixedClock(startIso: string, stepMs = 1000): Clock {
  let current = Date.parse(startIso);
  return {
    now: () => {
      const value = new Date(current);
      current += stepMs;
      return value;
    },
    isoNow(): string {
      return this.now().toISOString();
    },
  };
}
