import { describe, expect, it } from "vitest";
import { nextStrikeFromTarget } from "@/lib/market/resistance";
import { callDelta } from "@/lib/options/black-scholes";
import { repriceCandidate, strikeEditPatch, threeWeekYield } from "@/lib/options/reprice";
import type { OptionCandidate } from "@/lib/types";

function isoInDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

const expiry = isoInDays(56);
const scanned: OptionCandidate = {
  ticker: "NBIS",
  expiration: expiry,
  strike: 305,
  bid: 12.65,
  ask: 14.05,
  mid: 13.35,
  otmPct: 0.29,
  yield3w: 0.02,
  premium: 6675,
  contracts: 5,
  daysToExpiry: 56,
  stockTarget: 250,
  targetDistance: 0.05,
  delta: 0.3,
  listedStrike: 305,
  vol: 0.85,
};

describe("the three-week rate", () => {
  it("scales the premium to twenty-one days", () => {
    expect(threeWeekYield(2, 100, 42)).toBeCloseTo(0.01);
    expect(threeWeekYield(2, 100, 21)).toBeCloseTo(0.02);
    expect(threeWeekYield(0, 100, 21)).toBe(0);
  });
});

describe("pricing an edit before the scan answers", () => {
  it("leaves a candidate alone when nothing moved", () => {
    expect(
      repriceCandidate(scanned, { spot: 237, strike: 305, expiry, contracts: 5 })
    ).toBe(scanned);
  });

  it("moves strike, delta and premium together, and says it is an estimate", () => {
    const moved = repriceCandidate(scanned, { spot: 237, strike: 250, expiry, contracts: 5 })!;
    expect(moved.strike).toBe(250);
    expect(moved.estimated).toBe(true);
    expect(moved.delta!).toBeGreaterThan(scanned.delta!);
    expect(moved.mid).toBeGreaterThan(scanned.mid);
    expect(moved.premium).toBeCloseTo(moved.mid * 500);
    const years = moved.daysToExpiry / 365;
    expect(moved.delta!).toBeCloseTo(callDelta(237, 250, years, 0.85)!, 1);
  });

  it("a later expiry pays more", () => {
    const later = repriceCandidate(scanned, {
      spot: 237,
      strike: 305,
      expiry: isoInDays(90),
      contracts: 5,
    })!;
    expect(later.mid).toBeGreaterThan(scanned.mid);
    expect(later.expiration).toBe(isoInDays(90));
  });

  it("refuses to move a candidate with no volatility behind it", () => {
    expect(
      repriceCandidate({ ...scanned, vol: null }, { spot: 237, strike: 250, expiry, contracts: 5 })
    ).toBeNull();
  });
});

describe("typing a strike", () => {
  it("keeps the target and moves Call % to land on it", () => {
    const patch = strikeEditPatch(305, 250)!;
    expect(patch).toEqual({ target_call_pct: 0.22, stock_target_override: 250 });
    expect(nextStrikeFromTarget(patch.stock_target_override, patch.target_call_pct)).toBe(305);
  });

  it("lands on a strike that is not a round percentage of the target", () => {
    const patch = strikeEditPatch(250, 237)!;
    expect(nextStrikeFromTarget(patch.stock_target_override, patch.target_call_pct)).toBe(250);
  });

  it("moves the target down to a strike under it, since Call % cannot go negative", () => {
    expect(strikeEditPatch(240, 250)).toEqual({ target_call_pct: 0, stock_target_override: 240 });
  });

  it("refuses nonsense", () => {
    expect(strikeEditPatch(0, 250)).toBeNull();
    expect(strikeEditPatch(Number.NaN, 250)).toBeNull();
  });
});
