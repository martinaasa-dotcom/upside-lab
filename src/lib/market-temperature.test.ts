import { describe, expect, it } from "vitest";
import {
  preferSentimentSnapshot,
  spySparkFromCloses,
  type SentimentMetrics,
} from "@/lib/market-sentiment";
import {
  annualFromMultiple,
  BEST_DAY_STEPS,
  bestDaysFromCloses,
  isBestDaysRead,
  riseToRecover,
} from "@/lib/market-temperature";

describe("the recovery gap", () => {
  it("is the arithmetic and not an approximation of it", () => {
    expect(riseToRecover(0.1)).toBeCloseTo(0.1111, 4);
    expect(riseToRecover(0.25)).toBeCloseTo(0.3333, 4);
    expect(riseToRecover(0.5)).toBe(1);
    expect(riseToRecover(0.75)).toBe(3);
    expect(riseToRecover(0.9)).toBeCloseTo(9, 6);
  });

  it("is always at least as large as the fall, and larger past nothing", () => {
    for (let fall = 1; fall < 100; fall++) {
      const rise = riseToRecover(fall / 100);
      expect(rise).not.toBeNull();
      expect(rise!).toBeGreaterThanOrEqual(fall / 100);
    }
  });

  it("refuses a fall of everything rather than drawing an infinity", () => {
    expect(riseToRecover(1)).toBeNull();
    expect(riseToRecover(1.5)).toBeNull();
    expect(riseToRecover(Number.NaN)).toBeNull();
    expect(riseToRecover(0)).toBe(0);
  });
});

/*
  A series whose answer is known by construction: a steady drift with ten
  large up days and ten large down days dropped into it, five of the up
  days placed right beside a down day and five placed nowhere near one. So
  the ten largest and ten smallest daily moves are exactly the ones put
  there, and `bestNearWorst` has one correct answer rather than a plausible
  range.
*/
function madeUpSeries() {
  const DAYS = 2600;
  const UP = [40, 300, 700, 1100, 1500, 1900, 2100, 2200, 2300, 2400];
  // Five of the down days sit within ten days of an up day, five do not.
  const DOWN = [42, 302, 702, 1102, 1502, 600, 900, 1300, 1700, 2000];
  const closes: number[] = [100];
  const at: string[] = [];
  const start = Date.UTC(2014, 0, 6);
  for (let i = 0; i < DAYS; i++) {
    at.push(new Date(start + i * 86_400_000).toISOString().slice(0, 10));
    if (i === 0) continue;
    /*
      The ordinary days alternate up and down. A series that only ever
      drifts upward has no negative days beyond the ones put there, so
      taking out "the worst 20" would start removing gains and the read
      would look wrong for a reason that is an artefact of the fixture
      rather than anything about the arithmetic.
    */
    const drift = i % 2 === 0 ? 1.0012 : 0.9992;
    const mult = UP.includes(i) ? 1.06 : DOWN.includes(i) ? 0.94 : drift;
    closes.push(closes[i - 1]! * mult);
  }
  return { closes, at };
}

describe("the best days read", () => {
  const { closes, at } = madeUpSeries();
  const read = bestDaysFromCloses(closes, at);

  it("names its own window rather than leaving it to be guessed", () => {
    expect(read).not.toBeNull();
    expect(read!.from).toBe(at[0]);
    expect(read!.to).toBe(at[at.length - 1]);
    expect(read!.years).toBeGreaterThan(6);
    expect(read!.days).toBe(closes.length - 1);
  });

  it("costs more the more of the best days come out", () => {
    const steps = read!.missingBest;
    expect(steps.map((s) => s.days)).toEqual([...BEST_DAY_STEPS]);
    expect(read!.full).toBeGreaterThan(steps[0]!.multiple);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.multiple).toBeLessThan(steps[i - 1]!.multiple);
    }
  });

  it("pays more the more of the worst days come out, which is the honest half", () => {
    const steps = read!.missingWorst;
    expect(steps[0]!.multiple).toBeGreaterThan(read!.full);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.multiple).toBeGreaterThan(steps[i - 1]!.multiple);
    }
  });

  it("counts the clustering rather than asserting it", () => {
    expect(read!.bestNearWorst).toBe(5);
  });

  it("stands down rather than quoting a window too short to mean anything", () => {
    expect(bestDaysFromCloses([100, 101, 102])).toBeNull();
    const short = Array.from({ length: 900 }, (_, i) => 100 + i);
    const tight = short.map((_, i) =>
      new Date(Date.UTC(2025, 0, 1) + i * 3_600_000).toISOString().slice(0, 10)
    );
    expect(bestDaysFromCloses(short, tight)).toBeNull();
  });

  it("drops a bar the provider sent as junk rather than dividing by it", () => {
    const dirty = [...closes];
    dirty[500] = 0;
    dirty[900] = Number.NaN;
    const out = bestDaysFromCloses(dirty, at);
    expect(out).not.toBeNull();
    expect(Number.isFinite(out!.full)).toBe(true);
    expect(out!.days).toBe(closes.length - 3);
  });

  it("is recognised coming back off a cache, and junk is not", () => {
    expect(isBestDaysRead(read)).toBe(true);
    expect(isBestDaysRead(null)).toBe(false);
    expect(isBestDaysRead({ days: 10 })).toBe(false);
    expect(isBestDaysRead({ ...read, missingBest: [{ days: 5 }] })).toBe(false);
  });
});

describe("the yearly rate", () => {
  it("undoes the compounding it describes", () => {
    const rate = annualFromMultiple(2, 10);
    expect(rate).not.toBeNull();
    expect(Math.pow(1 + rate!, 10)).toBeCloseTo(2, 9);
  });

  it("refuses a window or a multiple it cannot describe", () => {
    expect(annualFromMultiple(2, 0)).toBeNull();
    expect(annualFromMultiple(0, 10)).toBeNull();
    expect(annualFromMultiple(-1, 10)).toBeNull();
  });
});

/*
  THE TWO HALVES OF THE CHART HAVE DIFFERENT APPETITES, AND THAT BROKE THE
  SNAPSHOT CACHE.

  `preferSentimentSnapshot` has three answers, not two: the new reading, the
  old one, or a MERGE that carries forward an expensive half the new fetch
  did not get. The fetcher used to decide whether to cache by asking whether
  the answer was identical to the raw fetch, which reads a merge as "nothing
  new" and declines to store a snapshot full of fresh gauges. Nothing looks
  wrong when that happens; the app simply stops caching and walks the
  provider on every single request, on a free tier.

  It never fired before, because the only thing carried forward was the
  spark, and a chart too short for a spark is too short for anything. The
  ten-year read has a larger appetite than the spark does, so a truncated
  chart now yields one and not the other, which is exactly the case. This
  holds the condition that made it reachable.
*/
describe("a truncated chart yields a spark but no ten-year read", () => {
  function bars(n: number) {
    const closes: number[] = [100];
    const at: string[] = [];
    const start = Date.UTC(2014, 0, 2);
    for (let i = 0; i < n; i++) {
      at.push(new Date(start + i * 86_400_000 * 1.45).toISOString().slice(0, 10));
      if (i) closes.push(closes[i - 1]! * (i % 2 ? 1.002 : 0.999));
    }
    return { closes, at };
  }

  function snapshot(n: number): SentimentMetrics {
    const { closes, at } = bars(n);
    return {
      vix: 18,
      rsi: 55,
      fearGreed: 40,
      cryptoFearGreed: 40,
      spyPrice: 500,
      sma200: 480,
      smaRatio: 0.04,
      streakDays: 10,
      typicalMoreDays: 5,
      alreadyLong: false,
      spark: spySparkFromCloses(closes, at, 10),
      bestDays: bestDaysFromCloses(closes, at),
      asOf: new Date().toISOString(),
    };
  }

  it("is a real condition and not a hypothetical one", () => {
    const short = snapshot(400);
    expect(short.spark).not.toBeNull();
    expect(short.bestDays).toBeNull();
  });

  it("carries the older read forward rather than dropping it", () => {
    const full = snapshot(2600);
    const short = snapshot(400);
    const chosen = preferSentimentSnapshot(full, short);
    expect(chosen.bestDays).toBe(full.bestDays);
    expect(chosen.fearGreed).toBe(short.fearGreed);
  });

  it("hands back neither input, which is what the fetcher must notice", () => {
    const full = snapshot(2600);
    const short = snapshot(400);
    const chosen = preferSentimentSnapshot(full, short);
    // The fetcher decides on `chosen !== prev`. Identity against the raw
    // fetch is the test that was wrong; this says why it cannot be used.
    expect(chosen).not.toBe(short);
    expect(chosen).not.toBe(full);
  });
});
