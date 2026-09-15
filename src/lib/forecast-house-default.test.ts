import { describe, expect, it } from "vitest";
import {
  FORECAST_YEARS,
  buildForecast,
  isForecastFullyCovered,
  resolveTickerForecastPath,
} from "@/lib/forecast";
import type { Holding, Quote } from "@/lib/types";

const YEAR = FORECAST_YEARS[0]!;

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: "h1",
    portfolio_id: "p1",
    ticker: "NBIS",
    shares: 10,
    buy_price: 50,
    eoy_target: null,
    target_call_pct: 0.1,
    stock_target_override: null,
    sort_order: 0,
    ...overrides,
  };
}

const QUOTES: Record<string, Quote> = {
  NBIS: { price: 100 } as Quote,
};

describe("resolveTickerForecastPath falls back to the house account's own plan", () => {
  it("keeps the reader's own year over a house one", () => {
    const path = resolveTickerForecastPath(
      "NBIS",
      100,
      { NBIS: { [YEAR]: 150 } },
      { NBIS: { [YEAR]: 200 } }
    );
    expect(path.eoyPrices[YEAR]).toBe(150);
    expect(path.targetedYears[YEAR]).toBe(true);
    expect(path.houseTargetedYears[YEAR]).toBe(false);
    expect(path.hasOverrides).toBe(true);
  });

  it("uses the house account's own year when the reader has none", () => {
    const path = resolveTickerForecastPath(
      "NBIS",
      100,
      undefined,
      { NBIS: { [YEAR]: 200 } }
    );
    expect(path.eoyPrices[YEAR]).toBe(200);
    expect(path.targetedYears[YEAR]).toBe(false);
    expect(path.houseTargetedYears[YEAR]).toBe(true);
    expect(path.hasOverrides).toBe(false);
    expect(path.hasHouseOverrides).toBe(true);
  });

  it("falls further, to the generic shape, with neither", () => {
    const path = resolveTickerForecastPath("NBIS", 100);
    expect(path.targetedYears[YEAR]).toBe(false);
    expect(path.houseTargetedYears[YEAR]).toBe(false);
    expect(path.hasHouseOverrides).toBe(false);
  });
});

describe("buildForecast fills a row from the house plan only where the reader has none", () => {
  it("marks a house-filled year distinctly from a reader-targeted one", () => {
    const model = buildForecast(
      [holding()],
      QUOTES,
      0,
      undefined,
      { NBIS: { [YEAR]: 175 } }
    );
    const row = model.rows[0]!;
    expect(row.eoyPrices[YEAR]).toBe(175);
    expect(row.targetedYears[YEAR]).toBe(false);
    expect(row.houseTargetedYears[YEAR]).toBe(true);
  });

  it("never lets a house year count toward the reader's own hasTargets", () => {
    const houseOverrides = {
      NBIS: Object.fromEntries(FORECAST_YEARS.map((y) => [y, 175])),
    };
    const model = buildForecast([holding()], QUOTES, 0, undefined, houseOverrides);
    // hasTargets is reader-only: a fully house-covered row must not read
    // as though the reader themselves had typed every year.
    expect(model.rows[0]!.hasTargets).toBe(false);
    expect(FORECAST_YEARS.every((y) => model.rows[0]!.houseTargetedYears[y])).toBe(
      true
    );
  });

  it("lets the reader's own year win over a house one on the same row", () => {
    const model = buildForecast(
      [holding()],
      QUOTES,
      0,
      { NBIS: { [YEAR]: 300 } },
      { NBIS: { [YEAR]: 175 } }
    );
    expect(model.rows[0]!.eoyPrices[YEAR]).toBe(300);
    expect(model.rows[0]!.targetedYears[YEAR]).toBe(true);
    expect(model.rows[0]!.houseTargetedYears[YEAR]).toBe(false);
  });
});

describe("isForecastFullyCovered counts a house year as covered", () => {
  it("is not fully covered with nothing set", () => {
    expect(isForecastFullyCovered(["NBIS"], {})).toBe(false);
  });

  it("is fully covered once the house plan answers every year", () => {
    const houseOverrides = {
      NBIS: Object.fromEntries(FORECAST_YEARS.map((y) => [y, 175])),
    };
    expect(isForecastFullyCovered(["NBIS"], {}, houseOverrides)).toBe(true);
  });

  it("is not covered if the house plan is missing a year", () => {
    const allButLast = Object.fromEntries(
      FORECAST_YEARS.slice(0, -1).map((y) => [y, 175])
    );
    expect(isForecastFullyCovered(["NBIS"], {}, { NBIS: allButLast })).toBe(
      false
    );
  });
});
