import { describe, expect, it } from "vitest";
import { latestFundTrade, tradeIsFresh } from "@/lib/fund-latest-trade";
import type { FundAction } from "@/lib/margus-fund";

const a = (over: Partial<FundAction>): FundAction => ({
  type: "hold", ticker: "NVDA", reasoning: "r", ...over,
});

describe("Home names the Fund's latest real trade", () => {
  it("skips holds and the parked Nasdaq 100 money", () => {
    const t = latestFundTrade([
      { report_date: "2026-09-25", actions: [a({ type: "buy", ticker: "QQQ", rule: "park" }), a({ type: "hold" })] },
      { report_date: "2026-09-24", actions: [a({ type: "trim", ticker: "MU", rule: "take-half", price: 120 })] },
    ]);
    expect(t).toMatchObject({ date: "2026-09-24", ticker: "MU", side: "sell", verb: "Sold half of", price: 120 });
  });

  it("leads with a buy when a day had both", () => {
    const t = latestFundTrade([
      { report_date: "2026-09-25", actions: [a({ type: "exit", ticker: "AMD" }), a({ type: "buy", ticker: "AVGO" })] },
    ]);
    expect(t).toMatchObject({ ticker: "AVGO", verb: "Bought", side: "buy" });
  });

  it("has nothing to say when the Fund made no company trade", () => {
    expect(latestFundTrade([{ report_date: "2026-09-25", actions: [a({})] }])).toBeNull();
  });

  it("stops leading with a trade after ten days", () => {
    const now = new Date("2026-09-26T12:00:00Z");
    expect(tradeIsFresh("2026-09-20", now)).toBe(true);
    expect(tradeIsFresh("2026-09-10", now)).toBe(false);
  });
});
