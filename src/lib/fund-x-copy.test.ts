import { describe, expect, it } from "vitest";
import {
  TWEET_MAX,
  composeDailyFundPost,
  composeWeeklyFundPost,
  tweetLength,
} from "@/lib/fund-x-copy";

const BASE = {
  serial: 12,
  daily: { dollar: 325.87, pct: 0.0046, spyPct: 0.002 },
  weekly: { dollar: 1060, pct: 0.0152, spyPct: 0.0049 },
  total: { dollar: 1225.87, pct: 0.0175, spyPct: 0.0116 },
  balance: 71_226,
};

describe("the daily post", () => {
  it("says bought and sold, and says sold some for a part sale", () => {
    const post = composeDailyFundPost({
      ...BASE,
      actions: [
        { type: "buy", ticker: "VRT" },
        { type: "trim", ticker: "NVDA" },
      ],
    });
    expect(post).toContain("bought vrt");
    expect(post).toContain("sold some nvda");
    expect(post).not.toContain("trimmed");
  });

  it("says held on a day with no trade", () => {
    expect(composeDailyFundPost({ ...BASE, actions: [] })).toContain(
      "Day 12: held"
    );
  });

  it("stays inside the free cap even on a heavy day", () => {
    const post = composeDailyFundPost({
      ...BASE,
      actions: [
        { type: "exit", ticker: "TSM" },
        { type: "exit", ticker: "AVGO" },
        { type: "buy", ticker: "VRT" },
        { type: "buy", ticker: "ANET" },
      ],
      movers: [
        { ticker: "NVDA", changePct: 0.031 },
        { ticker: "MSFT", changePct: -0.02 },
        { ticker: "VRT", changePct: 0.058 },
        { ticker: "ASML", changePct: -0.011 },
      ],
      radar: [
        { ticker: "AMD", waitFor: "a fall under one hundred and fifty dollars" },
        { ticker: "ANET", waitFor: "any week that gives back the run" },
      ],
    });
    expect(tweetLength(post)).toBeLessThanOrEqual(TWEET_MAX);
  });

  it("leaves out a stretch it has no figure for", () => {
    const post = composeDailyFundPost({
      serial: 3,
      daily: { dollar: null, pct: null, spyPct: null },
      total: { dollar: 100, pct: 0.01, spyPct: 0.02 },
      actions: [],
    });
    expect(post).not.toContain("Day $");
    expect(post).toContain("Tot");
  });
});

describe("the weekly post", () => {
  it("counts its week rather than its day", () => {
    expect(composeWeeklyFundPost({ ...BASE, actions: [] })).toContain(
      "Week 12: held"
    );
  });
});
