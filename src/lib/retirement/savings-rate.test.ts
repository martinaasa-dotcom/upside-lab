import { describe, expect, it } from "vitest";
import {
  habitResult,
  levers,
  localHabitPrice,
  paySplit,
  rateCurve,
  roundStep,
  yearsSaid,
  yearsToIndependence,
} from "@/lib/retirement/savings-rate";

describe("paySplit", () => {
  it("counts a pension as kept, on both sides of the share", () => {
    const s = paySplit({ takeHomeMonthly: 3000, pensionMonthly: 500, planMonthly: 800 })!;
    expect(s.earned).toBe(3500);
    expect(s.invested).toBe(300);
    expect(s.spent).toBe(2700);
    expect(s.saved).toBe(800);
    expect(s.rate).toBeCloseTo(800 / 3500);
    expect(s.pensionExceedsPlan).toBe(false);
  });

  it("says nothing without take-home pay", () => {
    expect(paySplit({ takeHomeMonthly: 0, pensionMonthly: 200, planMonthly: 200 })).toBeNull();
  });

  it("notices a plan that leaves the pension out", () => {
    const s = paySplit({ takeHomeMonthly: 2000, pensionMonthly: 300, planMonthly: 100 })!;
    expect(s.pensionExceedsPlan).toBe(true);
    expect(s.invested).toBe(0);
    expect(s.spent).toBe(2000);
  });

  it("never spends a negative amount", () => {
    const s = paySplit({ takeHomeMonthly: 1000, pensionMonthly: 0, planMonthly: 5000 })!;
    expect(s.spent).toBe(0);
    expect(s.rate).toBe(1);
  });
});

describe("yearsToIndependence", () => {
  const at = (rate: number) =>
    yearsToIndependence({
      saveYear: rate * 12,
      spendYear: (1 - rate) * 12,
      startPot: 0,
      realReturnPct: 5,
      multiple: 25,
    });

  it("reproduces the published savings rate table at 5% and 25 times spending", () => {
    // Networthify's figures, compounded yearly; monthly lands a little sooner.
    for (const [rate, published] of [
      [0.1, 51.4],
      [0.25, 31.9],
      [0.5, 16.6],
      [0.75, 7.1],
    ] as const) {
      const y = at(rate)!;
      expect(y).toBeLessThanOrEqual(published + 0.1);
      expect(y).toBeGreaterThan(published - 1.5);
    }
  });

  it("is zero when the pot already covers it, and null when it never will", () => {
    expect(yearsToIndependence({ saveYear: 0, spendYear: 10, startPot: 1000, realReturnPct: 0, multiple: 25 })).toBe(0);
    expect(yearsToIndependence({ saveYear: 0, spendYear: 10, startPot: 0, realReturnPct: 5, multiple: 25 })).toBeNull();
  });

  it("falls as the share kept rises", () => {
    const curve = rateCurve({ earned: 4000, startPot: 0, realReturnPct: 5, multiple: 25 });
    const ys = curve.map((p) => p.years ?? Infinity);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThan(ys[i - 1]);
  });
});

describe("levers", () => {
  const split = paySplit({ takeHomeMonthly: 3000, pensionMonthly: 200, planMonthly: 500 })!;
  const ctx = { split, startPot: 10_000, realReturnPct: 5, multiple: 25 };
  const { levers: rows } = levers(ctx, 200);
  const change = (id: string) => rows.find((r) => r.id === id)!.change!;

  it("makes spending less beat earning the same more and keeping it", () => {
    expect(change("spend-less")).toBeLessThan(change("earn-save"));
    expect(change("earn-save")).toBeLessThan(0);
  });

  it("makes earning more and spending it a longer wait", () => {
    expect(change("earn-spend")).toBeGreaterThan(0);
  });
});

describe("habitResult", () => {
  it("prices a daily cost over a year, invested, and against the target", () => {
    const r = habitResult(4, "day", { yearsToStop: 30, realReturnPct: 0, multiple: 25, lesson: null });
    expect(r.yearly).toBe(1460);
    expect(r.invested).toBeCloseTo(1460 * 30);
    expect(r.targetLess).toBe(1460 * 25);
    expect(r.sooner).toBeNull();
  });
});

describe("small helpers", () => {
  it("rounds to 1, 2 or 5 times a power of ten", () => {
    expect(roundStep(170)).toBe(200);
    expect(roundStep(480)).toBe(500);
    expect(roundStep(120)).toBe(100);
  });
  it("says a wait in words", () => {
    expect(yearsSaid(31.94)).toBe("31.9 years");
    expect(yearsSaid(1)).toBe("1 year");
    expect(yearsSaid(0.5)).toBe("6 months");
    expect(yearsSaid(null)).toBeNull();
  });
  it("prices a coffee to a step a till would print", () => {
    expect(localHabitPrice({ priceLevel: 100, perGbp: 1 }, 3.5)).toBe(3.5);
    expect(localHabitPrice({ priceLevel: 110, perGbp: 1.27 }, 3.5)).toBe(5);
  });
});
