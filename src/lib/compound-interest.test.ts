/**
 * The growth planner is arithmetic on numbers a person typed, and it is
 * the one screen in the app that puts a figure years out in front of them.
 * These check it against closed form rather than against itself, because a
 * month-by-month simulation that drifts is a projection nobody can catch
 * by eye.
 */
import { describe, expect, it } from "vitest";
import {
  calculateCompound,
  compoundsPerYear,
  effectiveAnnualRate,
  timeToDouble,
  type CompoundInputs,
} from "@/lib/compound-interest";

function inputs(over: Partial<CompoundInputs> = {}): CompoundInputs {
  return {
    principal: 10_000,
    ratePercent: 10,
    ratePeriod: "annual",
    compound: "annually",
    years: 10,
    months: 0,
    contributionMode: "none",
    depositAmount: 0,
    depositFrequency: "monthly",
    withdrawalAmount: 0,
    withdrawalFrequency: "monthly",
    increaseMode: "percent",
    annualIncrease: 0,
    ...over,
  };
}

describe("a lump sum, against the closed form", () => {
  it("compounds annually: 10,000 at 10% for 10 years", () => {
    const fv = calculateCompound(inputs()).futureValue;
    expect(fv).toBeCloseTo(10_000 * Math.pow(1.1, 10), 2);
    expect(fv).toBeCloseTo(25_937.42, 2);
  });

  it("compounds monthly", () => {
    const fv = calculateCompound(inputs({ compound: "monthly" })).futureValue;
    expect(fv).toBeCloseTo(10_000 * Math.pow(1 + 0.1 / 12, 120), 2);
    expect(fv).toBeCloseTo(27_070.41, 2);
  });

  it("compounds quarterly", () => {
    const fv = calculateCompound(inputs({ compound: "quarterly" })).futureValue;
    expect(fv).toBeCloseTo(10_000 * Math.pow(1 + 0.1 / 4, 40), 2);
  });

  it("compounds semiannually", () => {
    const fv = calculateCompound(inputs({ compound: "semiannually" })).futureValue;
    expect(fv).toBeCloseTo(10_000 * Math.pow(1 + 0.1 / 2, 20), 2);
  });

  it("compounds continuously", () => {
    const fv = calculateCompound(inputs({ compound: "continuous" })).futureValue;
    expect(fv).toBeCloseTo(10_000 * Math.exp(0.1 * 10), 2);
    expect(fv).toBeCloseTo(27_182.82, 2);
  });

  it("compounds daily at the rate a year actually has", () => {
    // 365 a year is what `compoundsPerYear` reports and what the label
    // promises, so it is what the balance has to be built from.
    const fv = calculateCompound(inputs({ compound: "daily" })).futureValue;
    expect(compoundsPerYear("daily")).toBe(365);
    expect(fv).toBeCloseTo(10_000 * Math.pow(1 + 0.1 / 365, 3650), 2);
  });

  it("reads a monthly rate as a monthly rate", () => {
    const fv = calculateCompound(
      inputs({ ratePercent: 1, ratePeriod: "monthly", compound: "monthly" })
    ).futureValue;
    // 1% a month is a 12% nominal year, compounded monthly.
    expect(fv).toBeCloseTo(10_000 * Math.pow(1.01, 120), 2);
  });
});

describe("deposits", () => {
  it("matches an ordinary annuity: $100 a month for 10 years at 10%", () => {
    const r = 0.1 / 12;
    const expected = 100 * ((Math.pow(1 + r, 120) - 1) / r);
    const out = calculateCompound(
      inputs({
        principal: 0,
        compound: "monthly",
        contributionMode: "deposits",
        depositAmount: 100,
        depositFrequency: "monthly",
      })
    );
    expect(out.futureValue).toBeCloseTo(expected, 2);
    expect(out.totalContributions).toBeCloseTo(12_000, 2);
    expect(out.totalInterest).toBeCloseTo(expected - 12_000, 2);
  });

  it("adds the lump sum and the annuity, not one or the other", () => {
    const r = 0.1 / 12;
    const annuity = 100 * ((Math.pow(1 + r, 120) - 1) / r);
    const lump = 10_000 * Math.pow(1 + r, 120);
    const fv = calculateCompound(
      inputs({
        compound: "monthly",
        contributionMode: "deposits",
        depositAmount: 100,
      })
    ).futureValue;
    expect(fv).toBeCloseTo(annuity + lump, 2);
  });

  it("pays an annual deposit once a year, at the year's end", () => {
    const out = calculateCompound(
      inputs({
        principal: 0,
        compound: "annually",
        contributionMode: "deposits",
        depositAmount: 1_200,
        depositFrequency: "annually",
      })
    );
    expect(out.totalContributions).toBeCloseTo(12_000, 2);
  });

  it("raises the deposit each year when asked to", () => {
    const out = calculateCompound(
      inputs({
        principal: 0,
        ratePercent: 0,
        compound: "annually",
        contributionMode: "deposits",
        depositAmount: 100,
        annualIncrease: 10,
        increaseMode: "percent",
        years: 3,
      })
    );
    // 1200, then 1320, then 1452.
    expect(out.totalContributions).toBeCloseTo(1200 + 1320 + 1452, 2);
  });
});

describe("the headline numbers beside the chart", () => {
  it("reports the effective annual rate, not the nominal one", () => {
    expect(effectiveAnnualRate(0.1, "monthly")).toBeCloseTo(0.1047130675, 8);
    expect(effectiveAnnualRate(0.1, "annually")).toBeCloseTo(0.1, 8);
    expect(effectiveAnnualRate(0.1, "continuous")).toBeCloseTo(Math.E ** 0.1 - 1, 8);
  });

  it("reports time to double", () => {
    // ln2 / ln(1.1) = 7.2725 years, which is 87 months.
    expect(timeToDouble(0.1, "annually")).toEqual({ years: 7, months: 3 });
    expect(timeToDouble(0, "annually").years).toBe(Infinity);
    expect(timeToDouble(-0.05, "annually").years).toBe(Infinity);
  });

  it("never reports a return it did not earn", () => {
    const flat = calculateCompound(inputs({ ratePercent: 0 }));
    expect(flat.futureValue).toBeCloseTo(10_000, 2);
    expect(flat.totalInterest).toBeCloseTo(0, 2);
    expect(flat.allTimeRoR).toBeCloseTo(0, 6);
  });
});

describe("the shapes a person can actually type", () => {
  it("survives a negative rate without going below nothing", () => {
    const out = calculateCompound(inputs({ ratePercent: -50, years: 5 }));
    expect(out.futureValue).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(out.futureValue)).toBe(true);
  });

  it("survives withdrawals larger than the balance", () => {
    const out = calculateCompound(
      inputs({
        principal: 1_000,
        contributionMode: "withdrawals",
        withdrawalAmount: 10_000,
        withdrawalFrequency: "monthly",
      })
    );
    expect(out.futureValue).toBe(0);
    expect(Number.isFinite(out.futureValue)).toBe(true);
  });

  it("keeps a zero-length plan at the principal", () => {
    const out = calculateCompound(inputs({ years: 0, months: 0 }));
    expect(out.futureValue).toBeCloseTo(10_000, 2);
    expect(out.yearly).toHaveLength(1);
  });

  it("refuses to turn junk into a number", () => {
    const out = calculateCompound(
      inputs({ principal: Number.NaN, ratePercent: Number.POSITIVE_INFINITY })
    );
    expect(Number.isFinite(out.futureValue)).toBe(true);
  });
});
