import { describe, expect, it } from "vitest";
import {
  fundDayNumber,
  fundQuoteCoverage,
  fundTotalReturn,
  fundDayBaseline,
  liveFundTodayMove,
  liveFundTotalValue,
  spyReturnSince,
} from "@/lib/margus-fund-mark";

const HOLDINGS = [
  { ticker: "NVDA", shares: 120, cost_basis: 168.4, status: "open" },
  { ticker: "MSFT", shares: 45, cost_basis: 402.1, status: "open" },
  { ticker: "TSM", shares: 60, cost_basis: 188, status: "closed" },
];

describe("what the fund is worth right now", () => {
  it("is cash plus every open holding at its price", () => {
    const total = liveFundTotalValue({
      cash: 12_450.32,
      holdings: HOLDINGS,
      quotes: { NVDA: { price: 182.4 }, MSFT: { price: 421.55 } },
    });
    // 12450.32 + 120*182.4 + 45*421.55, and the closed one is not in it.
    expect(total).toBeCloseTo(53_308.07, 2);
  });

  it("counts a company with no price at what he paid, and says which", () => {
    const quotes = { NVDA: { price: 182.4 } };
    const total = liveFundTotalValue({ cash: 0, holdings: HOLDINGS, quotes });
    expect(total).toBeCloseTo(120 * 182.4 + 45 * 402.1, 2);
    const coverage = fundQuoteCoverage({ holdings: HOLDINGS, quotes });
    expect(coverage).toEqual({ priced: 1, unpriced: ["MSFT"] });
  });

  it("treats a zero or broken price as no price at all", () => {
    const coverage = fundQuoteCoverage({
      holdings: HOLDINGS,
      quotes: { NVDA: { price: 0 }, MSFT: { price: Number.NaN } },
    });
    expect(coverage.priced).toBe(0);
    expect(coverage.unpriced).toEqual(["NVDA", "MSFT"]);
  });
});

describe("today's move needs a yesterday", () => {
  it("has no percentage when there is no closing figure to measure against", () => {
    expect(
      liveFundTodayMove({ liveTotal: 71_226, lastReportValue: null })
    ).toEqual({ todayDollar: 0, todayPct: null });
  });

  it("is the difference from the last recorded close", () => {
    const move = liveFundTodayMove({
      liveTotal: 71_225.87,
      lastReportValue: 70_900,
    });
    expect(move.todayDollar).toBeCloseTo(325.87, 2);
    expect(move.todayPct).toBeCloseTo(0.004596, 6);
  });
});

describe("what today is measured against", () => {
  const reports = [
    { report_date: "2026-10-01", portfolio_value: 70_000 },
    { report_date: "2026-10-02", portfolio_value: 71_000 },
    { report_date: "2026-09-30", portfolio_value: 69_000 },
  ];

  it("is the report before today once the evening report has written today", () => {
    // Friday 2 October 2026, 20:00 in New York: the newest report is
    // today's own close, and measuring against it printed $0 today.
    const evening = new Date("2026-10-03T00:00:00Z");
    expect(fundDayBaseline(reports, evening)).toBe(70_000);
  });

  it("is the newest report while the session is under way", () => {
    const midday = new Date("2026-10-02T16:00:00Z");
    expect(fundDayBaseline(reports.slice(0, 1), midday)).toBe(70_000);
  });

  it("shows the last session's move across a weekend", () => {
    // Saturday: the last session is Friday, measured from Thursday's close.
    const saturday = new Date("2026-10-03T15:00:00Z");
    expect(fundDayBaseline(reports, saturday)).toBe(70_000);
  });

  it("keeps the newest report when an older payload carries no dates", () => {
    expect(fundDayBaseline([{ portfolio_value: 5 }, { portfolio_value: 4 }])).toBe(5);
    expect(fundDayBaseline([])).toBeNull();
  });
});

describe("the return since it started", () => {
  it("is null rather than zero when nothing says what it started with", () => {
    expect(fundTotalReturn({ liveTotal: 71_226, startingCapital: undefined })).toEqual({
      dollar: null,
      pct: null,
    });
    expect(fundTotalReturn({ liveTotal: 71_226, startingCapital: -5 }).pct).toBeNull();
  });

  it("can point down", () => {
    const down = fundTotalReturn({ liveTotal: 63_000, startingCapital: 70_000 });
    expect(down.dollar).toBeCloseTo(-7000, 2);
    expect(down.pct).toBeCloseTo(-0.1, 10);
  });
});

describe("the benchmark's own move", () => {
  it("needs both prices", () => {
    expect(spyReturnSince({ inceptionPrice: 597.2, livePrice: 604.12 })).toBeCloseTo(
      0.0115874,
      6
    );
    expect(spyReturnSince({ inceptionPrice: undefined, livePrice: 604 })).toBeNull();
    expect(spyReturnSince({ inceptionPrice: 597, livePrice: undefined })).toBeNull();
  });
});

describe("how many days the fund has been running", () => {
  it("counts from the day it started, and never below one", () => {
    expect(fundDayNumber(null)).toBe(1);
    expect(fundDayNumber("not a date")).toBe(1);
    const today = new Date().toISOString().slice(0, 10);
    expect(fundDayNumber(today)).toBe(1);
  });
});
