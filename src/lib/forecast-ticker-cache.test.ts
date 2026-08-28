/**
 * The shared forecast cache is the one table in this app that is written by
 * one reader and read by all of them, so its rules are not a performance
 * detail. As it first landed it had none: a row was keyed on the ticker,
 * never aged, never checked against the price it was reasoned from, and
 * re-stamped every time it was handed out. The first portfolio ever to hold
 * a name fixed that name's five-year path for every reader in the product,
 * permanently, and the plan built from it told the reader it had been worked
 * out just now.
 *
 * These pin the three rules that replaced that, and the provenance the
 * cached plan reports, because a wrong answer here is shown to everybody
 * rather than to the one person who caused it.
 */
import { describe, expect, it } from "vitest";
import {
  FORECAST_CACHE_MAX_AGE_MS,
  FORECAST_CACHE_MAX_DRIFT,
  isReusableTickerPath,
  type ServerTickerPath,
} from "@/lib/forecast-ticker-cache-store";
import { buildCachedForecastPlan } from "@/lib/forecast-plan";
import { buildForecast } from "@/lib/forecast";

const NOW = new Date("2026-08-28T12:00:00.000Z");

function agedDays(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function path(over: Partial<ServerTickerPath> = {}): ServerTickerPath {
  return {
    prices: { 2026: 120, 2027: 140 },
    rationale: "why",
    generatedAt: agedDays(1),
    convictionKey: "",
    anchorPrice: 100,
    ...over,
  };
}

describe("a shared row ages out", () => {
  it("reuses a path reasoned inside the age bound", () => {
    expect(
      isReusableTickerPath(path(), "RKLB", { spot: 100, now: NOW })
    ).toBe(true);
  });

  it("refuses one older than the bound", () => {
    const stale = path({
      generatedAt: new Date(
        NOW.getTime() - FORECAST_CACHE_MAX_AGE_MS - 1000
      ).toISOString(),
    });
    expect(isReusableTickerPath(stale, "RKLB", { spot: 100, now: NOW })).toBe(
      false
    );
  });

  it("refuses a row whose date cannot be read, rather than reusing it forever", () => {
    expect(
      isReusableTickerPath(path({ generatedAt: "" }), "RKLB", {
        spot: 100,
        now: NOW,
      })
    ).toBe(false);
  });

  it("refuses a row with no prices in it", () => {
    expect(
      isReusableTickerPath(path({ prices: {} }), "RKLB", { spot: 100, now: NOW })
    ).toBe(false);
  });
});

describe("a shared row is tied to the price it was reasoned from", () => {
  it("reuses one whose stock has barely moved", () => {
    expect(
      isReusableTickerPath(path(), "RKLB", { spot: 105, now: NOW })
    ).toBe(true);
  });

  it("refuses one whose stock has run away from its anchor", () => {
    const spot = 100 * (1 + FORECAST_CACHE_MAX_DRIFT) + 1;
    expect(isReusableTickerPath(path(), "RKLB", { spot, now: NOW })).toBe(false);
  });

  it("refuses one whose stock has fallen away from its anchor", () => {
    const spot = 100 * (1 - FORECAST_CACHE_MAX_DRIFT) - 1;
    expect(isReusableTickerPath(path(), "RKLB", { spot, now: NOW })).toBe(false);
  });

  it("judges a row written before anchors existed on age alone", () => {
    const old = path({ anchorPrice: undefined });
    expect(isReusableTickerPath(old, "RKLB", { spot: 900, now: NOW })).toBe(true);
  });

  it("does not refuse a row just because today's price is missing", () => {
    expect(isReusableTickerPath(path(), "RKLB", { now: NOW })).toBe(true);
  });
});

describe("somebody's written thesis does not leak into everybody's forecast", () => {
  const shaped = path({ convictionKey: "4:they win the launch market" });

  it("keeps a thesis-shaped row from a reader who wrote nothing", () => {
    expect(isReusableTickerPath(shaped, "RKLB", { spot: 100, now: NOW })).toBe(
      false
    );
  });

  it("hands it back to a reader whose thesis matches", () => {
    expect(
      isReusableTickerPath(shaped, "RKLB", {
        spot: 100,
        now: NOW,
        convictions: { RKLB: { level: 4, thesis: "they win the launch market" } },
      })
    ).toBe(true);
  });
});

describe("a plan assembled from the cache says how old it really is", () => {
  const held = [
    { ticker: "RKLB", shares: 200, price: 100 },
    { ticker: "NBIS", shares: 100, price: 50 },
  ];
  const forecast = buildForecast(
    held.map((h, i) => ({
      id: h.ticker,
      portfolio_id: "p1",
      ticker: h.ticker,
      shares: h.shares,
      buy_price: h.price,
      eoy_target: null,
      target_call_pct: 0,
      stock_target_override: null,
      sort_order: i,
    })),
    Object.fromEntries(
      held.map((h) => [h.ticker, { ticker: h.ticker, price: h.price }])
    ) as Parameters<typeof buildForecast>[1],
    0
  );

  it("reports the oldest reused path, not the moment it was assembled", () => {
    const plan = buildCachedForecastPlan({
      forecast,
      portfolioId: "p1",
      portfolioName: "Aasad",
      now: NOW,
      cacheHits: {
        RKLB: { prices: { 2026: 120 }, generatedAt: agedDays(9) },
        NBIS: { prices: { 2026: 60 }, generatedAt: agedDays(2) },
      },
    });
    expect(plan.generatedAt).toBe(agedDays(9));
  });

  it("falls back to now only when no reused path carries a date", () => {
    const plan = buildCachedForecastPlan({
      forecast,
      portfolioId: "p1",
      portfolioName: "Aasad",
      now: NOW,
      cacheHits: {
        RKLB: { prices: { 2026: 120 } },
        NBIS: { prices: { 2026: 60 } },
      },
    });
    expect(plan.generatedAt).toBe(NOW.toISOString());
  });

  it("never claims a cached plan is a fallback grid", () => {
    const plan = buildCachedForecastPlan({
      forecast,
      portfolioId: "p1",
      portfolioName: "Aasad",
      now: NOW,
      cacheHits: { RKLB: { prices: { 2026: 120 }, generatedAt: agedDays(3) } },
    });
    expect(plan.fallback).toBe(false);
  });
});
