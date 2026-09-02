import { describe, expect, it } from "vitest";
import {
  marketOrYou,
  marketOrYouLine,
  standoutLine,
} from "@/lib/market-or-you";

const percent = (n: number) => `${(Math.abs(n) * 100).toFixed(1)}%`;

const HOLDINGS = [
  { ticker: "$AAPL", label: "Apple", todayPct: -0.012 },
  { ticker: "$VOO", todayPct: -0.011 },
  { ticker: "$NVDA", label: "Nvidia", todayPct: -0.062 },
];

describe("reading the day", () => {
  it("says nothing at all without both figures", () => {
    expect(marketOrYou({ marketPct: null, yoursPct: -0.02, holdings: [] })).toBeNull();
    expect(marketOrYou({ marketPct: -0.01, yoursPct: null, holdings: [] })).toBeNull();
    expect(marketOrYouLine(null, "The S&P 500", percent)).toBeNull();
  });

  it("calls an ordinary day an ordinary day", () => {
    const split = marketOrYou({
      marketPct: -0.012,
      yoursPct: -0.013,
      holdings: [],
    })!;
    expect(split.read).toBe("with");
    expect(marketOrYouLine(split, "The S&P 500", percent)).toContain(
      "moved with the market"
    );
  });

  it("notices when the reader's own companies moved further", () => {
    const split = marketOrYou({
      marketPct: -0.008,
      yoursPct: -0.031,
      holdings: [],
    })!;
    expect(split.read).toBe("more");
    expect(marketOrYouLine(split, "The S&P 500", percent)).toContain(
      "moved further than the market"
    );
  });

  it("notices when the market did most of it", () => {
    const split = marketOrYou({
      marketPct: -0.031,
      yoursPct: -0.009,
      holdings: [],
    })!;
    expect(split.read).toBe("less");
  });

  it("calls out a day that went the other way", () => {
    const split = marketOrYou({
      marketPct: -0.02,
      yoursPct: 0.015,
      holdings: [],
    })!;
    expect(split.read).toBe("against");
    expect(marketOrYouLine(split, "The S&P 500", percent)).toContain("unusual");
  });

  it("says both barely moved rather than comparing two rounding errors", () => {
    const split = marketOrYou({
      marketPct: 0.0004,
      yoursPct: -0.0009,
      holdings: [],
    })!;
    expect(split.read).toBe("quiet");
    expect(marketOrYouLine(split, "The S&P 500", percent)).toBe(
      "The S&P 500 and your portfolio both barely moved today."
    );
  });
});

describe("the holdings that stood out", () => {
  it("names the ones that did something the market did not", () => {
    const split = marketOrYou({
      marketPct: -0.011,
      yoursPct: -0.02,
      holdings: HOLDINGS,
    })!;
    expect(split.standouts.map((s) => s.ticker)).toEqual(["$NVDA"]);
    expect(standoutLine(split, percent)).toBe(
      "Nvidia (down 6.2%) did something the market did not."
    );
  });

  it("says nothing when every holding moved with the market", () => {
    const split = marketOrYou({
      marketPct: -0.011,
      yoursPct: -0.012,
      holdings: HOLDINGS.slice(0, 2),
    })!;
    expect(split.standouts).toEqual([]);
    expect(standoutLine(split, percent)).toBeNull();
  });

  it("names at most two and counts the rest", () => {
    const many = [
      { ticker: "$A", todayPct: -0.08 },
      { ticker: "$B", todayPct: 0.07 },
      { ticker: "$C", todayPct: -0.06 },
      { ticker: "$D", todayPct: 0.05 },
    ];
    const split = marketOrYou({
      marketPct: 0,
      yoursPct: -0.01,
      holdings: many,
    })!;
    const line = standoutLine(split, percent)!;
    expect(line).toContain("$A");
    expect(line).toContain("$B");
    expect(line).toContain("2 others did too.");
  });

  it("uses the company's name where it has one", () => {
    const split = marketOrYou({
      marketPct: 0,
      yoursPct: -0.06,
      holdings: HOLDINGS,
    })!;
    const line = standoutLine(split, percent)!;
    expect(line).toContain("Nvidia");
    expect(line).not.toContain("$NVDA");
  });
});

describe("what it refuses to say", () => {
  it("never splits the day into a market part and a yours part", () => {
    // Doing that needs an assumption about how a portfolio tracks an index,
    // which is invisible to the reader and wrong for anybody who is not
    // holding the index. Everything here is two figures side by side.
    const source = String(marketOrYouLine) + String(standoutLine);
    expect(source).not.toMatch(/beta|regress|expected move/i);
  });

  it("never advises, predicts, or uses a dash as a clause break", () => {
    const splits = [
      marketOrYou({ marketPct: -0.02, yoursPct: -0.05, holdings: HOLDINGS })!,
      marketOrYou({ marketPct: 0.02, yoursPct: -0.01, holdings: HOLDINGS })!,
      marketOrYou({ marketPct: -0.012, yoursPct: -0.012, holdings: [] })!,
    ];
    for (const split of splits) {
      const text = `${marketOrYouLine(split, "The S&P 500", percent)} ${standoutLine(split, percent) ?? ""}`;
      expect(text).not.toMatch(/should|buy|sell|will |expect|likely/i);
      expect(text).not.toMatch(/[—–]/);
    }
  });
});
