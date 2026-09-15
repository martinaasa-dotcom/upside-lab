import { describe, expect, it, vi } from "vitest";
import {
  loadEoySources,
  mergeEoySourcePaths,
  saveEoySources,
  sanitizeEoySources,
  setEoySource,
  type PortfolioEoySources,
} from "@/lib/forecast-overrides";
import { buildForecast, resolveTickerForecastPath } from "@/lib/forecast";
import type { Holding, Quote } from "@/lib/types";

/**
 * A FIGURE SAYS WHO WROTE IT, BECAUSE THE NUMBER ALONE CANNOT.
 *
 * An end-of-year target reaches the same map two ways: a reader typing
 * one year into the Growth room, and a forecast run writing a whole path
 * for every holding at once. Stored as a bare number they are
 * indistinguishable, and this app said the flattering thing about both --
 * telling a reader they had written down a price a model invented for
 * them, and republishing the house account's own runs to everybody else
 * as prices that account had "typed directly".
 *
 * Three answers, never two: the reader's, the model's, and "saved before
 * this app kept the answer", which is described as neither.
 */
describe("who wrote an end-of-year figure", () => {
  it("marks a typed year as the reader's and a run as the model's", () => {
    let sources: PortfolioEoySources = {};
    sources = setEoySource(sources, "nbis", 2026, "yours");
    sources = mergeEoySourcePaths(
      sources,
      [{ ticker: "NBIS", prices: { 2027: 200, 2028: 250 } }],
      "model"
    );
    expect(sources.NBIS).toEqual({
      2026: "yours",
      2027: "model",
      2028: "model",
    });
  });

  it("marks exactly the years a run answered, never the ones it skipped", () => {
    const sources = mergeEoySourcePaths(
      {},
      [{ ticker: "NBIS", prices: { 2026: 100, 2027: 0, 2028: Number.NaN } }],
      "model"
    );
    expect(sources.NBIS).toEqual({ 2026: "model" });
  });

  it("lets a reader take a year back from the model by typing over it", () => {
    let sources = mergeEoySourcePaths(
      {},
      [{ ticker: "NBIS", prices: { 2026: 100 } }],
      "model"
    );
    sources = setEoySource(sources, "NBIS", 2026, "yours");
    expect(sources.NBIS?.[2026]).toBe("yours");
  });

  it("drops a ticker whose last mark is cleared, rather than keeping an empty row", () => {
    let sources = setEoySource({}, "NBIS", 2026, "yours");
    sources = setEoySource(sources, "NBIS", 2026, null);
    expect(sources.NBIS).toBeUndefined();
  });

  it("refuses a word it did not write", () => {
    const cleaned = sanitizeEoySources({
      NBIS: { 2026: "yours", 2027: "margus", 2028: 12 },
      "": { 2026: "model" },
    });
    expect(cleaned).toEqual({ NBIS: { 2026: "yours" } });
  });

  it("survives a round trip through the browser's own storage", () => {
    // This suite runs in node, and there is no jsdom in this repo, so the
    // two calls the store actually makes are stood up by hand.
    const store = new Map<string, string>();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });

    saveEoySources("p1", { NBIS: { 2026: "model" } });
    expect(loadEoySources("p1")).toEqual({ NBIS: { 2026: "model" } });
    saveEoySources("p1", {});
    expect(loadEoySources("p1")).toEqual({});
    vi.unstubAllGlobals();
  });
});

describe("the forecast reads the answer back", () => {
  const holdings = [
    {
      id: "h1",
      portfolio_id: "p1",
      ticker: "NBIS",
      shares: 10,
      buy_price: 100,
      sort_order: 0,
    },
  ] as unknown as Holding[];
  const quotes = { NBIS: { price: 100 } } as unknown as Record<string, Quote>;

  it("says which of the three wrote each year", () => {
    const model = buildForecast(
      holdings,
      quotes,
      0,
      { NBIS: { 2026: 120, 2027: 140, 2028: 160 } },
      undefined,
      { own: { NBIS: { 2026: "yours", 2027: "model" } } }
    );
    const row = model.rows[0];
    expect(row.targetOrigins[2026]).toBe("yours");
    expect(row.targetOrigins[2027]).toBe("model");
    // Stored before this app kept the answer: described as neither.
    expect(row.targetOrigins[2028]).toBe("saved");
    // A year no store answered is not an origin at all.
    expect(row.targetOrigins[2030]).toBeNull();
  });

  it("keeps the house's own answer apart from the reader's", () => {
    const path = resolveTickerForecastPath(
      "NBIS",
      100,
      undefined,
      { NBIS: { 2026: 130 } },
      { house: { NBIS: { 2026: "model" } } }
    );
    expect(path.houseTargetedYears[2026]).toBe(true);
    expect(path.targetOrigins[2026]).toBe("model");
  });

  it("never reads the reader's own answer for a house figure", () => {
    // The two maps are keyed alike, so a resolver reading the wrong one
    // would look right on every test that sets only one of them.
    const path = resolveTickerForecastPath(
      "NBIS",
      100,
      undefined,
      { NBIS: { 2026: 130 } },
      { own: { NBIS: { 2026: "yours" } } }
    );
    expect(path.targetOrigins[2026]).toBe("saved");
  });
});
