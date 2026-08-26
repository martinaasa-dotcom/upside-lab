import { describe, expect, it } from "vitest";
import { isRealSplitRatio, splitsInWindow } from "@/lib/share-splits";
import type { ShareSplit } from "@/lib/market/yahoo";

/*
  Which splits a morning's sweep is responsible for.

  Too narrow a window and a split that happened while the job was not running
  is never applied, so a holding sits at the wrong number of shares until
  somebody notices by hand and writes in. Too wide and it reaches back into
  weeks nobody is looking at.
*/

function split(ticker: string, effectiveOn: string, numerator = 10, denominator = 1): ShareSplit {
  return { ticker, effectiveOn, numerator, denominator };
}

describe("a spinoff is not a split", () => {
  /*
   * Checked against the live Yahoo feed. GE reports a real 1 for 8 reverse
   * in August 2021, then 1281:1000 and 1253:1000, which are the GE
   * HealthCare and Vernova spinoffs. A spinoff restates the price history
   * and leaves the share count alone, so passing one to
   * `portfell_apply_split` would multiply every GE holder's position by
   * 1.281 and write a ledger row saying it was done.
   */
  const GE_FEED = [
    { ticker: "GE", effectiveOn: "2021-08-02", numerator: 1, denominator: 8 },
    { ticker: "GE", effectiveOn: "2023-01-04", numerator: 1281, denominator: 1000 },
    { ticker: "GE", effectiveOn: "2024-04-02", numerator: 1253, denominator: 1000 },
  ];

  it("keeps the reverse split and drops both adjustment factors", () => {
    expect(isRealSplitRatio(1, 8)).toBe(true);
    expect(isRealSplitRatio(1281, 1000)).toBe(false);
    expect(isRealSplitRatio(1253, 1000)).toBe(false);
  });

  it("never lets one through the window the sweep applies from", () => {
    expect(splitsInWindow(GE_FEED, "2023-01-05")).toEqual([]);
    expect(splitsInWindow(GE_FEED, "2024-04-03")).toEqual([]);
    expect(splitsInWindow(GE_FEED, "2021-08-03")).toEqual([GE_FEED[0]]);
  });

  it("takes every ratio a real split is written as", () => {
    for (const [n, d] of [[2, 1], [3, 2], [5, 4], [10, 1], [20, 1], [1, 10], [1, 8]]) {
      expect(isRealSplitRatio(n!, d!)).toBe(true);
    }
  });

  it("reduces the fraction before judging it", () => {
    // Twenty for ten is two for one written the long way.
    expect(isRealSplitRatio(20, 10)).toBe(true);
  });

  it("refuses a ratio that is not whole numbers of shares, or moves nothing", () => {
    expect(isRealSplitRatio(1.5, 1)).toBe(false);
    expect(isRealSplitRatio(1, 1)).toBe(false);
    expect(isRealSplitRatio(0, 1)).toBe(false);
    expect(isRealSplitRatio(2, 0)).toBe(false);
    expect(isRealSplitRatio(Number.NaN, 1)).toBe(false);
  });
});

describe("splitsInWindow", () => {
  it("takes what has happened inside the window", () => {
    const events = [split("NVDA", "2026-06-10"), split("AAPL", "2026-06-08")];
    expect(splitsInWindow(events, "2026-06-10", 4).map((s) => s.ticker)).toEqual([
      "NVDA",
      "AAPL",
    ]);
  });

  it("leaves a split that has not happened yet alone", () => {
    // Splits are announced weeks ahead and dated forward. Applying one early
    // would move somebody's shares before the market did.
    expect(splitsInWindow([split("NVDA", "2026-06-15")], "2026-06-10", 4)).toEqual([]);
  });

  it("stops at the edge of the window", () => {
    const events = [split("OLD", "2026-06-05"), split("NEW", "2026-06-06")];
    expect(splitsInWindow(events, "2026-06-10", 4).map((s) => s.ticker)).toEqual(["NEW"]);
  });

  it("reaches back over a weekend the job did not run", () => {
    // Friday's split, found on Tuesday. Four days is what makes that the same
    // sweep rather than a support message.
    expect(splitsInWindow([split("FRI", "2026-06-05")], "2026-06-09", 4)).toHaveLength(1);
  });

  it("keeps a reverse split the same way round it arrived", () => {
    const [event] = splitsInWindow([split("SIRI", "2026-06-10", 1, 10)], "2026-06-10", 4);
    expect(event.numerator).toBe(1);
    expect(event.denominator).toBe(10);
  });
});
