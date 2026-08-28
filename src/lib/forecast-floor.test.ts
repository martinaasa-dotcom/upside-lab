import { describe, expect, it } from "vitest";
import { FORECAST_YEARS } from "@/lib/forecast";
import type { ForecastModel, ForecastYear } from "@/lib/forecast";
import {
  ensureCompleteEoyTargets,
  type ForecastPathAdjustment,
} from "@/lib/forecast-plan";
import { reshapeToThemeRhythm, shapedFallbackPath } from "@/lib/forecast-conviction";

/*
 * A forecast is allowed to point down.
 *
 * Until 2026-08-28 it was not. Two separate mechanisms floored every path
 * at the shape kept for its kind of business: one scaled a path up when its
 * last year came in under that shape, and replaced a falling path outright;
 * the other detected a straight line and substituted the theme path, which
 * turned a steady decline into a rise on the way past. The prompt had
 * always told the model that a path ending below today is an allowed answer
 * and not to round one up out of politeness. The code then rounded it up.
 *
 * These tests are the floor's headstone. They are written against what a
 * reader ends up seeing rather than against the internals, because the
 * whole failure was that each piece looked reasonable on its own.
 */

const SPOT = 100;

function modelOf(ticker: string, currentPrice = SPOT): ForecastModel {
  return {
    rows: [{ ticker, shares: 1, currentPrice }],
  } as unknown as ForecastModel;
}

function pathOf(prices: number[]): Partial<Record<ForecastYear, number>> {
  const out: Partial<Record<ForecastYear, number>> = {};
  FORECAST_YEARS.forEach((y, i) => {
    const p = prices[i];
    if (p != null) out[y] = p;
  });
  return out;
}

function pricesFrom(
  ticker: string,
  prices: number[],
  spot = SPOT
): { years: number[]; adjust?: ForecastPathAdjustment } {
  let adjust: ForecastPathAdjustment | undefined;
  const out = ensureCompleteEoyTargets(
    modelOf(ticker, spot),
    [{ ticker, prices: pathOf(prices) }] as never,
    (_t, a) => {
      adjust = a;
    }
  );
  const row = out[0]!;
  return {
    years: FORECAST_YEARS.map((y) => row.prices[y] as number),
    adjust,
  };
}

describe("a forecast may point down", () => {
  it("keeps a path that ends below today's price", () => {
    // A wobbly decline: not a straight line, so the shape rule leaves it be.
    const { years } = pricesFrom("NVDA", [92, 78, 84, 70, 61]);
    expect(years).toEqual([92, 78, 84, 70, 61]);
    expect(years[years.length - 1]!).toBeLessThan(SPOT);
  });

  it("keeps a modest path that lands well under its sector shape", () => {
    // NVDA is a semi, whose shape ends around 3.57x. A 1.2x answer used to
    // be scaled up by roughly three times to meet it.
    const { years } = pricesFrom("NVDA", [104, 98, 111, 106, 120]);
    expect(years).toEqual([104, 98, 111, 106, 120]);
  });

  it("keeps a flat path flat, including the year we are already in", () => {
    // The current-year cell used to be rewritten whenever it hugged spot
    // and the theme still had a move left in the year.
    const { years } = pricesFrom("NVDA", [100, 101, 99, 100, 100]);
    expect(years[0]).toBe(100);
    for (const p of years) expect(Math.abs(p - SPOT)).toBeLessThanOrEqual(1);
  });

  it("re-times a straight line without turning a decline into a rise", () => {
    // An even ramp down. The shape rule fires, and must not change where
    // the path ends or which way it points.
    const { years, adjust } = pricesFrom("NVDA", [90, 80, 70, 60, 50]);
    expect(adjust?.reshaped).toBe(true);
    expect(years[years.length - 1]).toBe(50);
    expect(years.every((p) => p < SPOT)).toBe(true);
  });

  it("reports no adjustment at all on a path it left alone", () => {
    const { adjust } = pricesFrom("NVDA", [92, 78, 84, 70, 61]);
    expect(adjust).toEqual({ missing: false, filled: false, reshaped: false });
  });

  it("still fills a year the model skipped", () => {
    const { years, adjust } = pricesFrom("NVDA", [92, 78, 84, 70]);
    expect(adjust?.filled).toBe(true);
    expect(years[4]).toBeGreaterThan(0);
  });
});

describe("reshapeToThemeRhythm", () => {
  const shaped = shapedFallbackPath(SPOT, "semi");

  function ends(prices: number[]): number {
    const out = reshapeToThemeRhythm(
      Object.fromEntries(
        FORECAST_YEARS.map((y, i) => [y, prices[i]!])
      ) as Record<ForecastYear, number>,
      shaped,
      SPOT
    );
    return out[FORECAST_YEARS[FORECAST_YEARS.length - 1]!]!;
  }

  it("lands exactly on the destination it was given, up or down", () => {
    expect(ends([90, 80, 70, 60, 50])).toBe(50);
    expect(ends([120, 140, 160, 180, 200])).toBe(200);
  });

  it("stops being a straight line without moving the destination", () => {
    const flat = Object.fromEntries(
      FORECAST_YEARS.map((y, i) => [y, 100 + i * 10])
    ) as Record<ForecastYear, number>;
    const out = reshapeToThemeRhythm(flat, shaped, SPOT);
    const steps = FORECAST_YEARS.map((y) => out[y]!);
    const deltas = steps.slice(1).map((p, i) => p - steps[i]!);
    // The even ramp had five identical steps. The re-timed one does not.
    expect(new Set(deltas.map((d) => Math.round(d))).size).toBeGreaterThan(1);
    expect(steps[steps.length - 1]).toBe(140);
  });

  it("leaves a path alone when the shape has no rhythm to lend", () => {
    const flatShape = Object.fromEntries(
      FORECAST_YEARS.map((y) => [y, SPOT])
    ) as Record<ForecastYear, number>;
    const given = Object.fromEntries(
      FORECAST_YEARS.map((y, i) => [y, 90 - i])
    ) as Record<ForecastYear, number>;
    expect(reshapeToThemeRhythm(given, flatShape, SPOT)).toEqual(given);
  });
});
