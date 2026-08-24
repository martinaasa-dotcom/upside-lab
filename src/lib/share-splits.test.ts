import { describe, expect, it } from "vitest";
import { splitsInWindow } from "@/lib/share-splits";
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
