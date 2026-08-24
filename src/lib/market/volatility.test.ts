/**
 * `realizedVolAnnual` decides Call %, and had no tests. These pin the
 * definition (log returns, sample variance, root 252) and the guard that
 * keeps a non-daily series from being annualized as though it were daily.
 */
import { describe, expect, it } from "vitest";
import {
  realizedVolAnnual,
  TRADING_DAYS_PER_YEAR,
} from "@/lib/market/volatility";

/** A deterministic random walk built to a known annual volatility. */
function walk(annualVol: number, days = 250, seed = 12345): number[] {
  let s = seed;
  const rnd = () => (s = (1103515245 * s + 12345) % 2147483648) / 2147483648;
  const gauss = () => {
    const u = Math.max(1e-9, rnd());
    const v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const sd = annualVol / Math.sqrt(TRADING_DAYS_PER_YEAR);
  const out = [100];
  for (let i = 1; i < days; i++) out.push(out[i - 1]! * Math.exp(gauss() * sd));
  return out;
}

/** Every nth close, which is what a sparkline is. */
function everyNth(prices: number[], n: number): number[] {
  return prices.filter((_, i) => i % n === 0);
}

describe("realizedVolAnnual", () => {
  it("recovers the volatility a series was built with", () => {
    expect(realizedVolAnnual(walk(0.2))!).toBeCloseTo(0.2, 1);
    expect(realizedVolAnnual(walk(0.6))!).toBeCloseTo(0.6, 1);
  });

  it("is flat for a series that does not move", () => {
    expect(realizedVolAnnual(new Array(50).fill(100))).toBeNull();
  });

  it("needs enough history to mean anything", () => {
    expect(realizedVolAnnual([100, 101, 102])).toBeNull();
    expect(realizedVolAnnual([])).toBeNull();
  });

  it("ignores a point it cannot take a return from", () => {
    const clean = walk(0.3, 60);
    const dirty = [...clean];
    dirty[10] = 0;
    dirty[20] = Number.NaN;
    expect(realizedVolAnnual(dirty)).not.toBeNull();
  });

  describe("the step it was measured over", () => {
    const daily = walk(0.25, 250);
    const everyThird = everyNth(daily, 3);

    it("overstates by root n when a wider step is read as daily", () => {
      // This is the trap, kept as a measurement rather than a warning.
      const asIfDaily = realizedVolAnnual(everyThird)!;
      expect(asIfDaily / realizedVolAnnual(daily)!).toBeCloseTo(Math.sqrt(3), 0);
    });

    it("gets it right when the step is named", () => {
      const named = realizedVolAnnual(everyThird, { tradingDaysPerStep: 3 })!;
      expect(named).toBeCloseTo(realizedVolAnnual(daily)!, 1);
    });

    it("refuses a step that is not a number of days", () => {
      expect(realizedVolAnnual(daily, { tradingDaysPerStep: 0 })).toBeNull();
      expect(realizedVolAnnual(daily, { tradingDaysPerStep: -1 })).toBeNull();
    });
  });
});
