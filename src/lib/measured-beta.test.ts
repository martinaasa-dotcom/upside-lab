import { describe, expect, it } from "vitest";

import { measuredBeta, measuredBetas } from "@/lib/measured-beta";

/** A market series with a real wobble in it, long enough to measure. */
function market(points = 40): number[] {
  const out = [100];
  for (let i = 1; i < points; i++) {
    // Deterministic, and it changes sign, so the variance is genuine.
    const move = (i % 3 === 0 ? -1 : 1) * (0.004 + (i % 5) * 0.001);
    out.push(out[i - 1]! * (1 + move));
  }
  return out;
}

/** A company that moves exactly `beta` times the market, every day. */
function follows(marketCloses: number[], beta: number): number[] {
  const out = [50];
  for (let i = 1; i < marketCloses.length; i++) {
    const marketMove = marketCloses[i]! / marketCloses[i - 1]! - 1;
    out.push(out[i - 1]! * (1 + marketMove * beta));
  }
  return out;
}

describe("a company's own swing against the market", () => {
  it("recovers a swing it was built from", () => {
    const m = market();
    for (const beta of [0.4, 1, 1.8]) {
      const read = measuredBeta(follows(m, beta), m);
      expect(read, String(beta)).not.toBeNull();
      expect(read!.beta).toBeCloseTo(beta, 1);
      expect(read!.points).toBe(m.length - 1);
    }
  });

  it("holds the bounds, so one bad print cannot print an absurd row", () => {
    /*
      A month of closes can throw up nonsense from a single gap or results
      day, and a row saying a company falls four times as far as the market
      is worse than the typed guess it replaced.
    */
    const m = market();
    expect(measuredBeta(follows(m, 12), m)!.beta).toBeLessThanOrEqual(2.6);
    expect(measuredBeta(follows(m, -9), m)!.beta).toBeGreaterThanOrEqual(-1.2);
  });

  it("refuses to answer from too little, or from nothing", () => {
    const m = market();
    // Twenty daily moves is the floor; nineteen is noise dressed up.
    expect(measuredBeta(follows(m, 1).slice(0, 20), m.slice(0, 20))).toBeNull();
    expect(measuredBeta(undefined, m)).toBeNull();
    expect(measuredBeta(follows(m, 1), undefined)).toBeNull();
    // A market that did not move has no slope to measure against.
    expect(measuredBeta(follows(m, 1), new Array(40).fill(100))).toBeNull();
    // A zero or negative close is bad data, not a 100% fall.
    const broken = follows(m, 1);
    broken[10] = 0;
    expect(measuredBeta(broken, m)).toBeNull();
  });

  it("lines the two up from the most recent day", () => {
    /*
      They come from one provider walk so they are usually the same length,
      and when they are not it is because one name listed later or missed a
      day. The recent end is the part they share.
    */
    const m = market();
    const short = follows(m, 1.5).slice(10);
    const read = measuredBeta(short, m);
    expect(read).not.toBeNull();
    expect(read!.beta).toBeCloseTo(1.5, 1);
  });

  it("skips the names it cannot answer for, and keeps the rest", () => {
    const m = market();
    const out = measuredBetas(
      [
        { ticker: "aaa", sparkline: follows(m, 1.2) },
        { ticker: "BBB" },
        { ticker: "CCC", sparkline: [1, 2, 3] },
      ],
      m
    );
    expect(Object.keys(out)).toEqual(["AAA"]);
    expect(out.AAA).toBeCloseTo(1.2, 1);
  });
});
