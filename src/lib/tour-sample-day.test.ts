/**
 * The made-up portfolio on the walkthrough's first screen.
 *
 * The screen states a portfolio value, a dollar move for the day, and how
 * much of that move came from one company, above eight rows a reader can
 * add up themselves. If those disagree, the very first thing this app ever
 * says to somebody is a figure that does not survive a calculator, on a
 * screen whose whole subject is trusting the numbers.
 *
 * The lesson the screen teaches has arithmetic behind it too, and it is the
 * part most likely to rot: seven rows have to genuinely be the market, and
 * one has to be genuinely different. Change a percent by hand and the
 * answer to "which one had news" can quietly stop being findable.
 */
import { describe, expect, it } from "vitest";
import {
  MARKET_SPREAD,
  SAMPLE_HOLDINGS,
  SAMPLE_MARKET_PCT,
  SAMPLE_TAPS_BEFORE_SUMMARY,
  sampleDayDollar,
  sampleTotals,
  sampleValue,
} from "@/lib/tour-sample-day";

describe("the sample portfolio", () => {
  it("is eight companies", () => {
    expect(SAMPLE_HOLDINGS).toHaveLength(8);
  });

  it("gives every row a share count, a price and a day", () => {
    for (const h of SAMPLE_HOLDINGS) {
      expect(h.shares, h.ticker).toBeGreaterThan(0);
      expect(h.price, h.ticker).toBeGreaterThan(0);
      expect(Number.isFinite(h.dayPct), h.ticker).toBe(true);
    }
  });

  it("says what every company does, for a reader who does not know", () => {
    for (const h of SAMPLE_HOLDINGS) {
      expect(h.company.length, h.ticker).toBeGreaterThan(2);
      expect(h.does.length, h.ticker).toBeGreaterThan(8);
      expect(h.verdict.length, h.ticker).toBeGreaterThan(20);
    }
  });

  it("is a red day, all the way down", () => {
    for (const h of SAMPLE_HOLDINGS) {
      expect(h.dayPct, h.ticker).toBeLessThan(0);
    }
    expect(sampleTotals().dayDollar).toBeLessThan(0);
  });

  it("has exactly one company with news", () => {
    expect(SAMPLE_HOLDINGS.filter((h) => h.news)).toHaveLength(1);
  });

  it("keeps the other seven inside the market's own move", () => {
    for (const h of SAMPLE_HOLDINGS.filter((x) => !x.news)) {
      expect(
        Math.abs(h.dayPct - SAMPLE_MARKET_PCT),
        `${h.ticker} is too far from the market to read as the market`
      ).toBeLessThanOrEqual(MARKET_SPREAD);
      expect(h.badge, h.ticker).toBe("Thesis intact");
    }
  });

  it("puts the one with news far enough out to be findable", () => {
    const news = SAMPLE_HOLDINGS.find((h) => h.news)!;
    // Four times the market at the very least, or the screen is asking the
    // reader to spot something that is not there.
    expect(Math.abs(news.dayPct)).toBeGreaterThan(
      Math.abs(SAMPLE_MARKET_PCT) * 4
    );
    expect(news.badge).toBe("Thesis watch");
  });
});

describe("the totals the screen prints", () => {
  const totals = sampleTotals();

  it("is the rows added up, and nothing typed in beside them", () => {
    const rows = SAMPLE_HOLDINGS.reduce((sum, h) => sum + sampleValue(h), 0);
    expect(totals.value).toBeCloseTo(rows, 6);
  });

  it("adds the day up out of the same rows", () => {
    const rows = SAMPLE_HOLDINGS.reduce(
      (sum, h) => sum + sampleDayDollar(h),
      0
    );
    expect(totals.dayDollar).toBeCloseTo(rows, 6);
  });

  it("works the day out backwards from the price on the row", () => {
    // Yesterday's value plus the day is today's value, per row. That is the
    // only reading under which the totals agree with what the reader sees.
    for (const h of SAMPLE_HOLDINGS) {
      const yesterday = h.shares * (h.price / (1 + h.dayPct));
      expect(yesterday + sampleDayDollar(h), h.ticker).toBeCloseTo(
        sampleValue(h),
        6
      );
    }
  });

  it("states the day's percent against yesterday, not against today", () => {
    expect(totals.dayPct).toBeCloseTo(
      totals.dayDollar / (totals.value - totals.dayDollar),
      10
    );
    expect(totals.dayPct).toBeLessThan(0);
  });

  it("makes the one company with news worth pointing at", () => {
    expect(totals.newsTicker).toBe(
      SAMPLE_HOLDINGS.find((h) => h.news)!.ticker
    );
    // The screen says this one company is a large part of the whole day. If
    // it stops being so, the sentence stops being true.
    expect(totals.newsShareOfDay).toBeGreaterThan(0.3);
    expect(totals.newsShareOfDay).toBeLessThan(1);
  });
});

describe("the summary", () => {
  it("arrives after fewer taps than there are rows to turn over", () => {
    expect(SAMPLE_TAPS_BEFORE_SUMMARY).toBeGreaterThan(0);
    expect(SAMPLE_TAPS_BEFORE_SUMMARY).toBeLessThan(SAMPLE_HOLDINGS.length);
  });
});
