import { describe, expect, it } from "vitest";
import {
  daySize,
  portfolioDayLine,
  typicalMoveForPortfolio,
  typicalMoveFromCloses,
  typicalMoveLine,
} from "@/lib/typical-move";

/** A series whose every day moves by exactly `pct`, alternating direction. */
function steady(pct: number, days: number, start = 100): number[] {
  const out = [start];
  for (let i = 1; i < days; i += 1) {
    const last = out[out.length - 1]!;
    out.push(i % 2 === 0 ? last * (1 + pct) : last * (1 - pct));
  }
  return out;
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

describe("typicalMoveFromCloses", () => {
  it("answers null rather than guessing from a short series", () => {
    expect(typicalMoveFromCloses([100, 101, 102])).toBeNull();
    expect(typicalMoveFromCloses([])).toBeNull();
  });

  it("finds the size of an ordinary day", () => {
    const t = typicalMoveFromCloses(steady(0.02, 40));
    expect(t).not.toBeNull();
    expect(t!.typicalPct).toBeCloseTo(0.02, 3);
    expect(t!.days).toBe(39);
  });

  it("is not dragged by one enormous day, which is why it is a median", () => {
    const closes = steady(0.01, 40);
    // One results day of nine per cent, the kind that moves an average.
    closes.push(closes[closes.length - 1]! * 1.09);
    const t = typicalMoveFromCloses(closes)!;
    expect(t.typicalPct).toBeCloseTo(0.01, 3);
  });

  it("ignores a day that is a split or a bad bar rather than a day lived through", () => {
    const closes = steady(0.02, 40);
    // A ten for one split: the price is a tenth the next morning and
    // nothing was traded.
    closes.push(closes[closes.length - 1]! / 10);
    closes.push(closes[closes.length - 1]! * 1.02);
    const t = typicalMoveFromCloses(closes)!;
    expect(t.typicalPct).toBeCloseTo(0.02, 3);
  });

  it("refuses a series of zeroes and negatives", () => {
    expect(typicalMoveFromCloses(new Array(40).fill(0))).toBeNull();
    expect(typicalMoveFromCloses(new Array(40).fill(-5))).toBeNull();
  });
});

describe("typicalMoveForPortfolio", () => {
  it("measures the portfolio's own swing, not the sum of its parts", () => {
    // Two holdings that move opposite ways every day. Each one swings two
    // per cent; held together they very nearly cancel, and the portfolio's
    // own day is a fraction of either holding's. Unequal share counts, so
    // the two do not cancel exactly and the answer is a real number rather
    // than the flat line that would honestly say nothing.
    const up = steady(0.02, 40);
    const mirrored = up.map((v, i) => (i === 0 ? v : 200 - v));
    const each = typicalMoveFromCloses(up)!.typicalPct;
    const t = typicalMoveForPortfolio([
      { shares: 1, closes: up },
      { shares: 1.1, closes: mirrored },
    ])!;
    expect(t.typicalPct).toBeLessThan(each / 4);
  });

  it("says nothing about a portfolio that never moves at all", () => {
    const flat = new Array(40).fill(100);
    expect(typicalMoveForPortfolio([{ shares: 2, closes: flat }])).toBeNull();
  });

  it("answers null when a holding has no history to speak of", () => {
    expect(
      typicalMoveForPortfolio([{ shares: 3, closes: [100, 101] }])
    ).toBeNull();
    expect(typicalMoveForPortfolio([])).toBeNull();
  });

  it("skips a holding with no shares rather than counting it as flat", () => {
    const t = typicalMoveForPortfolio([
      { shares: 0, closes: steady(0.09, 40) },
      { shares: 5, closes: steady(0.02, 40) },
    ])!;
    expect(t.typicalPct).toBeCloseTo(0.02, 3);
  });
});

describe("daySize", () => {
  const typical = { typicalPct: 0.01, days: 40 };

  it("calls a day near the usual size an ordinary one, either way", () => {
    expect(daySize(0.009, typical)).toBe("ordinary");
    expect(daySize(-0.014, typical)).toBe("ordinary");
  });

  it("marks the middle band and the loud one apart", () => {
    expect(daySize(0.02, typical)).toBe("bigger");
    expect(daySize(-0.045, typical)).toBe("big");
  });
});

describe("the sentences", () => {
  const typical = { typicalPct: 0.012, days: 40 };

  it("says nothing at all when there is no history", () => {
    expect(typicalMoveLine("Apple", -0.02, null)).toBeNull();
    expect(portfolioDayLine(-100, -0.02, 5000, null, money)).toBeNull();
  });

  it("puts an ordinary day in its place", () => {
    const line = typicalMoveLine("Apple", -0.011, typical)!;
    expect(line).toContain("down 1.1% today");
    expect(line).toContain("ordinary day");
  });

  it("counts a loud day in ordinary days", () => {
    const line = portfolioDayLine(-3600, -0.06, 60000, typical, money)!;
    expect(line).toContain("$3,600");
    expect(line).toContain("5 ordinary days at once");
  });

  it("leads with money for the portfolio and never states a direction it does not have", () => {
    const line = portfolioDayLine(null, null, 60000, typical, money)!;
    expect(line).toBe("Your portfolio moves about $720 on an ordinary day.");
  });

  it("never rounds a tiny figure up into existence", () => {
    const line = typicalMoveLine("Apple", 0.0004, {
      typicalPct: 0.0003,
      days: 40,
    })!;
    expect(line).toContain("less than 0.1%");
  });

  it("says nothing that could be read as a forecast or an instruction", () => {
    const lines = [
      typicalMoveLine("Apple", -0.06, typical)!,
      typicalMoveLine("Apple", -0.005, typical)!,
      portfolioDayLine(-3600, -0.06, 60000, typical, money)!,
    ];
    for (const line of lines) {
      expect(line).not.toMatch(/buy|sell|hold|should|expect|will /i);
      expect(line).not.toMatch(/[—–]/);
    }
  });
});
