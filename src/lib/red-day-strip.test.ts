import { describe, expect, it } from "vitest";

import {
  DOT_PX,
  STRIP_INSET_PX,
  stripLayout,
  stripRange,
  stripX,
  timesTheMarket,
} from "@/lib/red-day-strip";
import {
  SAMPLE_HOLDINGS,
  SAMPLE_MARKET_TICKER,
  SAMPLE_NEWS_TICKER,
  sampleDayFraction,
} from "@/lib/sample-portfolio";

const ROWS = SAMPLE_HOLDINGS.map((h) => ({
  ticker: h.ticker,
  move: sampleDayFraction(h),
}));

describe("the red day strip", () => {
  it("runs from a little past the worst fall to no move at all", () => {
    const { low, high } = stripRange(ROWS.map((r) => r.move));
    expect(high).toBe(0);
    expect(low).toBeLessThan(Math.min(...ROWS.map((r) => r.move)));
  });

  it("keeps every dot whole inside the strip", () => {
    for (const width of [240, 270, 300, 390, 560]) {
      const { dots } = stripLayout(ROWS, width);
      for (const d of dots) {
        expect(d.x - DOT_PX / 2).toBeGreaterThanOrEqual(0);
        expect(d.x + DOT_PX / 2).toBeLessThanOrEqual(width);
      }
    }
  });

  it("never draws two dots over each other, at any width a card has", () => {
    for (const width of [240, 270, 300, 336, 390, 480, 560]) {
      const { dots } = stripLayout(ROWS, width);
      for (const a of dots) {
        for (const b of dots) {
          if (a === b || a.lane !== b.lane) continue;
          expect(
            Math.abs(a.x - b.x),
            `${a.ticker} and ${b.ticker} overlap at ${width}px`
          ).toBeGreaterThanOrEqual(DOT_PX);
        }
      }
    }
  });

  it("puts the company with news on its own, on the top lane", () => {
    const { dots } = stripLayout(ROWS, 300);
    const news = dots.find((d) => d.ticker === SAMPLE_NEWS_TICKER)!;
    expect(news.lane).toBe(0);
    const market = dots.find((d) => d.ticker === SAMPLE_MARKET_TICKER)!;
    expect(market.x - news.x).toBeGreaterThan(100);
  });

  it("hands the dots back in the order they came in", () => {
    const { dots } = stripLayout(ROWS, 300);
    expect(dots.map((d) => d.ticker)).toEqual(ROWS.map((r) => r.ticker));
  });

  it("places the ends of the scale at the inset", () => {
    expect(stripX(-0.1, 300, -0.1, 0)).toBe(STRIP_INSET_PX);
    expect(stripX(0, 300, -0.1, 0)).toBe(300 - STRIP_INSET_PX);
  });

  it("says how many times the market a fall was, or nothing", () => {
    const news = ROWS.find((r) => r.ticker === SAMPLE_NEWS_TICKER)!.move;
    const market = ROWS.find((r) => r.ticker === SAMPLE_MARKET_TICKER)!.move;
    expect(timesTheMarket(news, market)).toBe(8);
    expect(timesTheMarket(0.01, -0.01)).toBeNull();
    expect(timesTheMarket(-0.01, 0)).toBeNull();
  });
});
