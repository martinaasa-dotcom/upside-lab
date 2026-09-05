import { describe, expect, it } from "vitest";
import { NO_VALUE } from "@/lib/format";
import { companyFactsKey, factsAreThin } from "@/lib/company/facts";
import { makeFacts, makeOrdinaryFacts } from "@/lib/company/facts-fixture";
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

const facts = makeOrdinaryFacts;

describe("a reading never invents a figure", () => {
  it("says n/a for every number the feed did not carry", () => {
    const empty = makeFacts({ name: "Test Company" });
    for (const reading of companyReadings(empty)) {
      // The payout reading is the one that has a real answer for "no
      // figure": a company that pays nothing pays nothing.
      if (reading.id === "dividend") {
        expect(reading.value).toBe("None");
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
    // What a fund charges is the one number its holder controls, so it
    // leads rather than being an afterthought below the price.
    expect(ids[0]).toBe("fee");
  });

  it("does not ask a coin about its accounts", () => {
    /*
      A coin has no revenue to grow and no profit to keep. Eight headings
      over six `n/a`s is not a gap in the data, it is this app asking a
      question that does not apply and reporting that nobody answered.
    */
    const ids = companyReadings(facts({ kind: "CRYPTOCURRENCY" })).map((r) => r.id);
    expect(ids).toEqual(["size", "range"]);
  });

  it("prices a company on the profit it is expected to make", () => {
    /*
      The fault this pins is the one that made the first version produce
      nonsense: read off last year, a company whose earnings are about to
      quadruple looks several times more expensive than the market is
      actually pricing it at.
    */
    const reading = companyReadings(
      facts({ price: 400, epsTrailing: 4, trailingPe: 100, epsNextYear: 20 })
    ).find((r) => r.id === "price-tag");
    expect(reading?.value).toBe("20.0x");
    expect(reading?.label).toContain("next year");
    // The trailing figure is still printed, because it is the one a
    // professional wants and the gap between the two is the story.
    expect(reading?.compare).toContain("100.0x");
  });

  it("sets expected growth against the market's own, when the feed has it", () => {
    const reading = companyReadings(
      facts({ epsGrowthNextYear: 1.04, marketEpsGrowthNextYear: 0.15 })
    ).find((r) => r.id === "earnings-growth");
    expect(reading?.versus).toMatchObject({ label: "S&P 500", better: true });
    expect(reading?.versus?.value).toBe("15.0%");
  });

  it("measures a margin against the company's own history, not a table", () => {
    const reading = companyReadings(
      facts({
        profitMargin: 0.2,
        history: [
          { year: 2022, revenue: 100, netIncome: 5 },
          { year: 2025, revenue: 200, netIncome: 40 },
        ],
      })
    ).find((r) => r.id === "profit");
    expect(reading?.versus).toMatchObject({ label: "In 2022", better: true });
    expect(reading?.compare).toContain("keeping more");
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
