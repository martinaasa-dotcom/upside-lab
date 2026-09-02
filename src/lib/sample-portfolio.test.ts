import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SAMPLE_CASH,
  SAMPLE_HOLDINGS,
  SAMPLE_NEWS_TICKER,
  SAMPLE_RISER_TICKER,
  sampleAllTimeDollars,
  sampleDayDollars,
  sampleDayFractionTotal,
  sampleDayTotal,
  sampleDemoStore,
  sampleFallingCount,
  sampleMovers,
  sampleShareOfPortfolio,
  sampleStocksValue,
  sampleTotalValue,
  sampleValue,
} from "@/lib/sample-portfolio";

/*
  The sample is the one card on the landing page whose whole job is to be
  believed, and the version before this one could be taken apart with a
  calculator in about a minute: three of its eight holdings implied
  positions worth more than the portfolio they sat in, the mover list left
  out a company that had lost more than one it named, and the movers it did
  name added up to the day's entire move, which says the other five
  companies moved nothing.

  Every one of those is a relationship between two numbers, so every one of
  them is checkable here. This is not a copy test. It fails when the
  holdings stop adding up, whichever number moved.
*/
describe("the sample portfolio adds up", () => {
  it("has eight companies anybody could name", () => {
    expect(SAMPLE_HOLDINGS).toHaveLength(8);
    const seen = new Set(SAMPLE_HOLDINGS.map((row) => row.ticker));
    expect(seen.size).toBe(8);
  });

  it("never lets one holding be worth more than the whole portfolio", () => {
    const total = sampleTotalValue();
    for (const row of SAMPLE_HOLDINGS) {
      expect(sampleValue(row)).toBeGreaterThan(0);
      expect(sampleValue(row)).toBeLessThan(total);
    }
  });

  it("adds the holdings and the cash up to the headline figure", () => {
    const parts = SAMPLE_HOLDINGS.reduce(
      (sum, row) => sum + sampleValue(row),
      0
    );
    expect(sampleStocksValue()).toBeCloseTo(parts, 6);
    expect(sampleTotalValue()).toBeCloseTo(parts + SAMPLE_CASH, 6);
  });

  it("keeps the biggest movers smaller than the day they are part of", () => {
    /*
      The failure this is here for: three movers summing to exactly the
      day's move, which quietly asserts that every other company was flat.
      They are a part of the day, so their sum has to be strictly inside it.
    */
    const day = sampleDayTotal();
    const listed = sampleMovers(3).reduce(
      (sum, row) => sum + sampleDayDollars(row),
      0
    );
    expect(day).toBeLessThan(0);
    expect(listed).toBeGreaterThan(day);
  });

  it("lists the movers biggest first, and leaves nothing bigger out", () => {
    const listed = sampleMovers(3);
    const smallestListed = Math.min(
      ...listed.map((row) => Math.abs(sampleDayDollars(row)))
    );
    const left = SAMPLE_HOLDINGS.filter((row) => !listed.includes(row));
    for (const row of left) {
      expect(Math.abs(sampleDayDollars(row))).toBeLessThanOrEqual(
        smallestListed
      );
    }
  });

  it("is a red day with exactly one company up", () => {
    // The point of the sample: a fall that is the market, plus one company
    // that had news. A day where everything falls together teaches nothing.
    expect(sampleFallingCount()).toBe(7);
    expect(sampleDayFractionTotal()).toBeLessThan(0);
    expect(sampleDayDollars(
      SAMPLE_HOLDINGS.find((r) => r.ticker === SAMPLE_RISER_TICKER)!
    )).toBeGreaterThan(0);
  });

  it("has some holdings up on what was paid and some down", () => {
    const up = SAMPLE_HOLDINGS.filter((r) => r.price > r.buyPrice);
    const down = SAMPLE_HOLDINGS.filter((r) => r.price < r.buyPrice);
    expect(up.length).toBeGreaterThan(0);
    expect(down.length).toBeGreaterThan(0);
    expect(sampleAllTimeDollars()).toBeGreaterThan(0);
  });

  it("puts the company with news at the share of the portfolio the page says", () => {
    const share = sampleShareOfPortfolio(SAMPLE_NEWS_TICKER);
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1);
    // Big enough to be worth a sentence, small enough not to be the day.
    expect(share).toBeLessThan(0.2);
  });

  it("holds a little cash and never borrows any", () => {
    // A sample is a poor place to introduce somebody to a margin loan.
    expect(SAMPLE_CASH).toBeGreaterThan(0);
    expect(SAMPLE_CASH).toBeLessThan(sampleStocksValue() * 0.1);
  });
});

describe("the sample as a portfolio the app can open", () => {
  it("turns every holding into a row the rooms can read", () => {
    const store = sampleDemoStore();
    expect(store.portfolios).toHaveLength(1);
    expect(store.holdings).toHaveLength(SAMPLE_HOLDINGS.length);
    for (const row of store.holdings) {
      expect(row.portfolio_id).toBe(store.portfolios[0]!.id);
      expect(row.shares).toBeGreaterThan(0);
      expect(row.buy_price).toBeGreaterThan(0);
      // No opinions in a sample: targets are something a reader writes.
      expect(row.eoy_target).toBeNull();
      expect(row.stock_target_override).toBeNull();
    }
  });

  it("is named so nobody could read it as their own", () => {
    expect(sampleDemoStore().portfolios[0]!.name.toLowerCase()).toContain(
      "sample"
    );
  });

  it("carries no frozen price into the app", () => {
    /*
      The landing's cards draw a made-up day, and those two prices exist
      for that and nothing else. A holding handed to the rooms carries
      shares and what was paid; the price comes from `/api/quotes`, the
      same path a signed-in reader is on. If a frozen price ever leaked
      into this store the demo would be quietly showing modelled figures
      where prices go, which is the one thing this app does not do.
    */
    const store = sampleDemoStore();
    const frozen = new Set(SAMPLE_HOLDINGS.map((r) => r.price));
    for (const row of store.holdings) {
      const keys = Object.keys(row);
      expect(keys).not.toContain("price");
      expect(keys).not.toContain("previousClose");
      expect(frozen.has(row.buy_price)).toBe(false);
    }
  });
});

describe("what the landing page is allowed to say about the sample", () => {
  const landing = readFileSync(
    join(process.cwd(), "src/components/SignedOutLanding.tsx"),
    "utf8"
  );

  it("types no sample money or percentage into the page", () => {
    /*
      Every figure on those cards is derived above and formatted through
      `format.ts`. A dollar amount or a percent typed straight into the
      markup is how the old ones drifted apart from each other, one edit at
      a time, with nothing to notice.

      The eight cashtags and the company names are still written out, which
      is fine: they are not arithmetic.
    */
    const body = landing.slice(landing.indexOf("/* ----"));
    const money = body.match(/"[^"]*\$[\d,]+(\.\d+)?[^"]*"/g) ?? [];
    expect(money).toEqual([]);
    const percents = body.match(/>[^<>{}]*?[-+]?\d+(\.\d+)?%/g) ?? [];
    expect(percents).toEqual([]);
  });

  it("says out loud that the holdings are invented and the prices are not", () => {
    expect(landing).toMatch(/made up/i);
    expect(landing).toMatch(/prices are real/i);
  });
});
