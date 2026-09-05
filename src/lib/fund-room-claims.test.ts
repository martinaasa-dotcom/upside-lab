import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NO_VALUE } from "@/lib/format";
import { upsideFundProvenance } from "@/lib/provenance";
import {
  fundQuoteCoverage,
  fundTotalReturn,
  spyReturnSince,
} from "@/lib/margus-fund-mark";

/*
  The Fund room is the most copyable page in this product.

  It is a confident daily write-up with a portfolio value, a return and a
  chart beside it, signed with a name, and a reader learning to invest will
  read it as a tip sheet whatever any global disclaimer says. So the page
  itself makes four promises in its own words, and each of those promises is
  pinned here to the code that has to be true for it. Same pattern as
  `landing-claims.test.ts`: not a copy test, a test that fails when either
  side moves away from the other.
*/
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const room = read("src/components/UpsidePortfolioPage.tsx");
/*
  Code only, for the checks that ban a pattern. The comments in that file
  quote the patterns they replaced, on purpose, and a scan that cannot tell
  a record of a fixed fault from the fault would push people to stop writing
  the record down.
*/
const roomCode = room
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
/* JSX wraps a paragraph over several lines, so prose is matched flattened. */
const roomText = room.replace(/\s+/g, " ");

describe("what the Fund room promises a reader", () => {
  it("says on the page, not only behind the mark, that the money is pretend", () => {
    /*
      The provenance panel has always said this. It is opened by a reader
      who has already decided to be suspicious, and the reader this matters
      for is the one who never presses anything.
    */
    expect(room).toMatch(/The money is <Explain term="paper-money">pretend<\/Explain>/);
    expect(roomText).toMatch(/nobody&apos;s savings are in it/);
    // And the eye has to still be saying the same thing underneath.
    expect(upsideFundProvenance().headline).toMatch(/not a real fund/i);
    expect(upsideFundProvenance().headline).toMatch(/nobody's money is in it/i);
  });

  it("says it is not advice, in the app's own legal words", () => {
    expect(room).toContain("ADVICE_DISCLAIMER_SHORT");
    expect(roomText).toMatch(/a diary, not a list to copy/i);
  });

  it("promises nothing is edited afterwards, and nothing can edit it", () => {
    /*
      The only route the room reads is read-only, and the room never posts
      to it. If a write verb is ever added there, the sentence stops being
      true and this fails before a reader finds out.
    */
    const route = read("src/app/api/upside-portfolio/route.ts");
    expect(route).toMatch(/export const GET =/);
    expect(route).not.toMatch(/export const (POST|PATCH|PUT|DELETE)/);
    expect(roomText).toMatch(/Nothing is edited afterwards/);
  });

  it("promises one decision on each day the market is open, and the cron says so", () => {
    // Weekday schedules only. A seven-day cron would make the sentence wrong.
    const vercel = JSON.parse(read("vercel.json")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const fund = vercel.crons.filter((c) => c.path === "/api/cron/margus-fund");
    expect(fund.length).toBeGreaterThan(0);
    for (const c of fund) {
      const dayOfWeek = c.schedule.trim().split(/\s+/)[4];
      expect(dayOfWeek).toMatch(/^1-[56]$/);
    }
    expect(roomText).toMatch(/each day the market is open/);
  });
});

describe("what the room calls the line it is measured against", () => {
  it("never prints the bare ticker as the name of the benchmark", () => {
    /*
      An S&P 500 tracker is not the S&P 500. It is one fund that follows the
      list, quoted on its own share price without the dividends the
      companies pay. The room used to be titled "Margus vs SPY" and to label
      the chart line "SPY", both of which ask a beginner to already know
      that.
    */
    expect(roomCode).not.toMatch(/Margus vs SPY/);
    expect(roomCode).not.toMatch(/label: "SPY"/);
    expect(roomCode).not.toMatch(/SPY \{percent/);
    expect(room).toMatch(/const BENCHMARK_SHORT = "The S&P 500 tracker"/);
    // And it says what that fund is, including what the line leaves out.
    expect(roomText).toMatch(/without the dividends those companies pay/);
  });
});

describe("trade shorthand is not a word a beginner has to look up", () => {
  it("says Bought and Sold rather than Opened and Exited", () => {
    const styles = roomCode.slice(
      roomCode.indexOf("const ACTION_STYLE"),
      roomCode.indexOf("function ActionBadge")
    );
    expect(styles).toMatch(/buy: \{ label: "Bought"/);
    expect(styles).toMatch(/exit: \{ label: "Sold all of"/);
    expect(styles).toMatch(/trim: \{ label: "Sold some"/);
    expect(styles).not.toMatch(/"Opened"|"Exited"/);
    // Section headings, which carried the same shorthand.
    expect(roomCode).not.toMatch(/Open positions|Closed positions/);
  });
});

describe("a figure with nothing behind it says so", () => {
  it("has no return percentage without a starting figure to measure against", () => {
    expect(fundTotalReturn({ liveTotal: 1000, startingCapital: null })).toEqual({
      dollar: null,
      pct: null,
    });
    expect(fundTotalReturn({ liveTotal: 1000, startingCapital: 0 }).pct).toBeNull();
    const real = fundTotalReturn({ liveTotal: 71_226, startingCapital: 70_000 });
    expect(real.dollar).toBeCloseTo(1226, 2);
    expect(real.pct).toBeCloseTo(0.017514, 5);
  });

  it("has no benchmark move without both prices, rather than a flat zero", () => {
    expect(spyReturnSince({ inceptionPrice: null, livePrice: 604 })).toBeNull();
    expect(spyReturnSince({ inceptionPrice: 597.2, livePrice: null })).toBeNull();
    expect(spyReturnSince({ inceptionPrice: 0, livePrice: 604 })).toBeNull();
    expect(spyReturnSince({ inceptionPrice: 500, livePrice: 550 })).toBeCloseTo(0.1, 10);
  });

  it("counts which holdings the total is actually leaning on", () => {
    const holdings = [
      { ticker: "NVDA", shares: 10, cost_basis: 100, status: "open" },
      { ticker: "MSFT", shares: 5, cost_basis: 400, status: "open" },
      { ticker: "TSM", shares: 1, cost_basis: 180, status: "closed" },
    ];
    const quotes = { NVDA: { price: 120 } };
    const coverage = fundQuoteCoverage({ holdings, quotes });
    expect(coverage.priced).toBe(1);
    // Closed holdings are not in the total, so they are not in the count.
    expect(coverage.unpriced).toEqual(["MSFT"]);
  });

  it("keeps n/a as the one way of saying there is no number", () => {
    expect(NO_VALUE).toBe("n/a");
    expect(room).toContain("NO_VALUE");
    // A gain of exactly nothing is not the answer to a missing figure.
    expect(roomCode).not.toMatch(/realized_pnl \?\? 0/);
    expect(roomCode).not.toMatch(/total_return_pct \?\? 0/);
  });
});
