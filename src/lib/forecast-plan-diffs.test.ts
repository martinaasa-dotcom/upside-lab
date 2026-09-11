import { describe, expect, it } from "vitest";
import { FORECAST_YEARS } from "@/lib/forecast";
import { forecastPlanDiffs, type ForecastPlan } from "@/lib/forecast-plan";

/*
 * "Since the last run" states, as fact, that a holding's modeled price
 * changed between two runs of the same portfolio's forecast.
 * forecastPlanDiffs is the arithmetic behind that card, pulled out of
 * ForecastPanel so it can be tested on its own rather than only by
 * rendering the whole panel.
 */

const LAST_YEAR = FORECAST_YEARS[FORECAST_YEARS.length - 1]!;

function planOf(
  targets: { ticker: string; to: number; rationale?: string }[]
): ForecastPlan {
  return {
    eoyTargets: targets.map((t) => ({
      ticker: t.ticker,
      prices: { [LAST_YEAR]: t.to },
      rationale: t.rationale,
    })),
  } as unknown as ForecastPlan;
}

describe("forecastPlanDiffs", () => {
  it("reports a holding whose last-year price moved", () => {
    const prev = planOf([{ ticker: "NVDA", to: 340 }]);
    const next = planOf([
      { ticker: "NVDA", to: 375, rationale: "Grew into the estimate." },
    ]);
    expect(forecastPlanDiffs(next, prev, LAST_YEAR)).toEqual([
      { ticker: "NVDA", from: 340, to: 375, rationale: "Grew into the estimate." },
    ]);
  });

  it("reports an empty string rather than undefined when there is no rationale", () => {
    const prev = planOf([{ ticker: "NVDA", to: 340 }]);
    const next = planOf([{ ticker: "NVDA", to: 375 }]);
    expect(forecastPlanDiffs(next, prev, LAST_YEAR)[0]?.rationale).toBe("");
  });

  it("ignores a move under 50 cents", () => {
    const prev = planOf([{ ticker: "NVDA", to: 340 }]);
    const next = planOf([{ ticker: "NVDA", to: 340.3 }]);
    expect(forecastPlanDiffs(next, prev, LAST_YEAR)).toEqual([]);
  });

  it("reports a move right at the 50 cent floor", () => {
    const prev = planOf([{ ticker: "NVDA", to: 340 }]);
    const next = planOf([{ ticker: "NVDA", to: 340.5 }]);
    expect(forecastPlanDiffs(next, prev, LAST_YEAR)).toHaveLength(1);
  });

  it("skips a ticker only present in one of the two plans", () => {
    const prev = planOf([{ ticker: "NVDA", to: 340 }]);
    const next = planOf([
      { ticker: "NVDA", to: 340 },
      { ticker: "AAPL", to: 250 },
    ]);
    // AAPL is new and NVDA did not move, so there is nothing to report.
    expect(forecastPlanDiffs(next, prev, LAST_YEAR)).toEqual([]);
  });

  it("matches tickers case-insensitively", () => {
    const prev = planOf([{ ticker: "nvda", to: 340 }]);
    const next = planOf([{ ticker: "NVDA", to: 375 }]);
    expect(forecastPlanDiffs(next, prev, LAST_YEAR)).toHaveLength(1);
  });

  it("is empty with no previous plan", () => {
    const next = planOf([{ ticker: "NVDA", to: 375 }]);
    expect(forecastPlanDiffs(next, null, LAST_YEAR)).toEqual([]);
  });

  it("is empty with no current plan", () => {
    const prev = planOf([{ ticker: "NVDA", to: 340 }]);
    expect(forecastPlanDiffs(null, prev, LAST_YEAR)).toEqual([]);
  });

  it("is empty with no last year to compare against", () => {
    const prev = planOf([{ ticker: "NVDA", to: 340 }]);
    const next = planOf([{ ticker: "NVDA", to: 375 }]);
    expect(forecastPlanDiffs(next, prev, undefined)).toEqual([]);
  });

  it("is empty when the previous plan has no targets at all", () => {
    const prev = planOf([]);
    const next = planOf([{ ticker: "NVDA", to: 375 }]);
    expect(forecastPlanDiffs(next, prev, LAST_YEAR)).toEqual([]);
  });
});
