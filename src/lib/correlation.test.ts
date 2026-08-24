/**
 * The one thing this panel must not do is answer its own question
 * backwards. It did, for every pair, whenever both names were trending.
 */
import { describe, expect, it } from "vitest";
import {
  correlationGrid,
  correlationMatrix,
  pearson,
  priceCorrelation,
  toReturns,
} from "@/lib/correlation";

/** Both drift up 0.5% a step; their wobble is exactly opposite. A hedge. */
function hedgedPair(steps = 60): { a: number[]; b: number[] } {
  const a = [100];
  const b = [100];
  for (let i = 1; i <= steps; i++) {
    const wobble = (i % 2 === 0 ? 1 : -1) * 0.03;
    a.push(a[i - 1]! * (1 + 0.005 + wobble));
    b.push(b[i - 1]! * (1 + 0.005 - wobble));
  }
  return { a, b };
}

describe("priceCorrelation", () => {
  it("calls a hedged pair a hedge, not a pair that moves as one", () => {
    const { a, b } = hedgedPair();
    // The shared uptrend alone scores +0.93 on the raw price series, which
    // is what this used to report.
    expect(pearson(a, b)!).toBeGreaterThan(0.9);
    expect(priceCorrelation(a, b)!).toBeCloseTo(-1, 2);
  });

  it("still calls a pair that really does move as one +1", () => {
    const { a } = hedgedPair();
    const same = a.map((v) => v * 3);
    expect(priceCorrelation(a, same)!).toBeCloseTo(1, 6);
  });

  it("does not find a link between independent wobbles", () => {
    // Deterministic, so this cannot flake: two out-of-phase cycles whose
    // returns are close to orthogonal.
    const a: number[] = [100];
    const b: number[] = [100];
    for (let i = 1; i <= 80; i++) {
      a.push(a[i - 1]! * (1 + 0.02 * Math.sin(i)));
      b.push(b[i - 1]! * (1 + 0.02 * Math.cos(i)));
    }
    expect(Math.abs(priceCorrelation(a, b)!)).toBeLessThan(0.35);
  });

  it("needs enough history to mean anything", () => {
    expect(priceCorrelation([1, 2, 3], [1, 2, 3])).toBeNull();
    expect(priceCorrelation([], [])).toBeNull();
  });

  it("says nothing rather than something about a flat line", () => {
    const flat = new Array(40).fill(100);
    const { a } = hedgedPair();
    expect(priceCorrelation(flat, a)).toBeNull();
  });

  it("pairs the same step in both series when their lengths differ", () => {
    const { a, b } = hedgedPair();
    expect(priceCorrelation(a, b.slice(20))!).toBeCloseTo(-1, 2);
  });
});

describe("toReturns", () => {
  it("reads a 10% step as 0.1", () => {
    expect(toReturns([100, 110, 99])).toEqual([0.1, -0.1]);
  });

  it("skips a step it cannot divide by", () => {
    expect(toReturns([0, 10, 20])).toEqual([1]);
    expect(toReturns([Number.NaN, 10, 20])).toEqual([1]);
  });

  it("has nothing to say about one point", () => {
    expect(toReturns([100])).toEqual([]);
  });
});

describe("the grid and the pair list agree with it", () => {
  const { a, b } = hedgedPair();
  const series = [
    { ticker: "AAA", sparkline: a },
    { ticker: "BBB", sparkline: b },
  ];

  it("puts the hedge on the pair list as a hedge", () => {
    const pairs = correlationMatrix(series);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.corr).toBeCloseTo(-1, 2);
  });

  it("is symmetric and 1 down the diagonal", () => {
    const { tickers, grid } = correlationGrid(series);
    expect(tickers).toEqual(["AAA", "BBB"]);
    expect(grid[0]![0]).toBe(1);
    expect(grid[1]![1]).toBe(1);
    expect(grid[0]![1]).toBeCloseTo(grid[1]![0]!, 12);
    expect(grid[0]![1]!).toBeCloseTo(-1, 2);
  });
});
