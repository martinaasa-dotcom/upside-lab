import { describe, expect, it } from "vitest";
import { NO_VALUE } from "@/lib/format";
import { companyFactsKey, factsAreThin, type CompanyFacts } from "@/lib/company/facts";
import { companyReadings } from "@/lib/company/readings";

/**
 * The rule this file exists to hold: **a reading never invents a figure**.
 *
 * Everything else on a company page is downstream of that. A model may only
 * cite a figure that is on screen, a fair value is only run on inputs that
 * arrived, and the whole promise of the room is that a reader can go and
 * check every number. One reading quietly rounding a missing input to zero
 * would break all three at once, and would look exactly like a real answer.
 */

function facts(over: Partial<CompanyFacts> = {}): CompanyFacts {
  return {
    ticker: "TEST",
    listedSymbol: "TEST",
    name: "Test Company",
    about: "It tests things.",
    sector: "Technology",
    industry: "Software",
    country: "United States",
    employees: 100,
    website: null,
    kind: "EQUITY",
    currency: "USD",
    price: 100,
    changePercent: 1,
    marketCap: 1_000_000_000,
    fiftyTwoWeekHigh: 120,
    fiftyTwoWeekLow: 80,
    revenue: 500_000_000,
    revenueGrowth: 0.2,
    grossMargin: 0.6,
    profitMargin: 0.1,
    netIncome: 50_000_000,
    freeCashFlow: 40_000_000,
    totalCash: 200_000_000,
    totalDebt: 100_000_000,
    trailingPe: 25,
    forwardPe: 20,
    dividendYield: null,
    epsTrailing: 4,
    epsForward: 5,
    sharesOutstanding: 10_000_000,
    history: [],
    analystCount: 12,
    analystTargetMean: 130,
    analystTargetHigh: 160,
    analystTargetLow: 90,
    fetchedAt: "2026-09-05T00:00:00.000Z",
    ...over,
  };
}

describe("a reading never invents a figure", () => {
  it("says n/a for every number the feed did not carry", () => {
    const empty = facts({
      marketCap: null,
      revenue: null,
      revenueGrowth: null,
      profitMargin: null,
      totalCash: null,
      totalDebt: null,
      trailingPe: null,
      forwardPe: null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      dividendYield: null,
    });
    for (const reading of companyReadings(empty)) {
      // The payout reading is the one that has a real answer for "no
      // figure": a company that pays nothing pays nothing.
      if (reading.id === "dividend") {
        expect(reading.value).toBe("Nothing");
        continue;
      }
      expect(reading.value, reading.id).toBe(NO_VALUE);
      expect(reading.plain, reading.id).toBeNull();
    }
  });

  it("still teaches the idea when there is no figure", () => {
    for (const reading of companyReadings(facts({ profitMargin: null }))) {
      expect(reading.compare.length, reading.id).toBeGreaterThan(20);
    }
  });

  it("never prints a zero for a missing figure", () => {
    const readings = companyReadings(facts({ revenue: null, marketCap: null }));
    const sales = readings.find((r) => r.id === "sales");
    expect(sales?.value).toBe(NO_VALUE);
    expect(sales?.value).not.toContain("$0");
  });
});

describe("the readings say what they mean", () => {
  it("turns a profit margin into dollars out of every hundred", () => {
    const profit = companyReadings(facts({ profitMargin: 0.09 })).find(
      (r) => r.id === "profit"
    );
    expect(profit?.plain).toContain("$9");
    expect(profit?.plain).toContain("$100");
  });

  it("says a loss is a loss rather than a negative margin", () => {
    const profit = companyReadings(facts({ profitMargin: -0.2 })).find(
      (r) => r.id === "profit"
    );
    expect(profit?.plain?.toLowerCase()).toContain("lose");
    expect(profit?.tone).toBe("watch");
  });

  it("flags falling sales and not a fast-growing company", () => {
    const falling = companyReadings(facts({ revenueGrowth: -0.1 })).find(
      (r) => r.id === "growth"
    );
    const rising = companyReadings(facts({ revenueGrowth: 0.4 })).find(
      (r) => r.id === "growth"
    );
    expect(falling?.tone).toBe("watch");
    expect(rising?.tone).toBe("good");
  });

  it("leaves how expensive the shares are without a colour", () => {
    /*
      Deliberate: expensive is not the same as bad, and a tone on this one
      figure would be the single place on the page where a number reads as
      a verdict.
    */
    const dear = companyReadings(facts({ trailingPe: 90 })).find(
      (r) => r.id === "price-tag"
    );
    const cheap = companyReadings(facts({ trailingPe: 6 })).find(
      (r) => r.id === "price-tag"
    );
    expect(dear?.tone).toBe("neutral");
    expect(cheap?.tone).toBe("neutral");
  });

  it("does not ask a fund about its customers", () => {
    const ids = companyReadings(facts({ kind: "ETF" })).map((r) => r.id);
    expect(ids).not.toContain("sales");
    expect(ids).not.toContain("profit");
    expect(ids).toContain("size");
  });
});

describe("the cache key follows the company's own figures", () => {
  it("changes when a quarter's numbers change", () => {
    const before = companyFactsKey(facts());
    const after = companyFactsKey(facts({ revenue: 600_000_000 }));
    expect(after).not.toBe(before);
  });

  it("does not change when only the share price moves", () => {
    /*
      Price drift is handled separately, by the anchor bound on the cache.
      Folding it in here would re-write every page every day for nothing.
    */
    expect(companyFactsKey(facts({ price: 140 }))).toBe(
      companyFactsKey(facts())
    );
  });
});

describe("a company the feed barely covers is called thin", () => {
  it("refuses to write a page from nothing", () => {
    expect(
      factsAreThin(
        facts({
          about: null,
          marketCap: null,
          revenue: null,
          profitMargin: null,
          trailingPe: null,
          history: [],
        })
      )
    ).toBe(true);
  });

  it("does not call an ordinary company thin", () => {
    expect(factsAreThin(facts())).toBe(false);
  });
});
