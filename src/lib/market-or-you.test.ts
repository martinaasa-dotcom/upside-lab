import { describe, expect, it } from "vitest";
import {
  marketOrYou,
  marketOrYouLine,
  standoutLine,
  swarmChipWidth,
  swarmLayout,
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


describe("the market-against-you picture", () => {
  const holdings = [
    { ticker: "NKE", label: "$NKE", todayPct: -0.0067 },
    { ticker: "KO", label: "$KO", todayPct: -0.0037 },
    { ticker: "AMZN", label: "$AMZN", todayPct: 0.0025 },
    { ticker: "NVDA", label: "$NVDA", todayPct: 0.0029 },
    { ticker: "DIS", label: "$DIS", todayPct: 0.0055 },
    { ticker: "VOO", label: "$VOO", todayPct: 0.0068 },
    { ticker: "AAPL", label: "$AAPL", todayPct: 0.0154 },
    { ticker: "MSFT", label: "$MSFT", todayPct: 0.04 },
  ];
  const split = marketOrYou({ marketPct: 0.005, yoursPct: 0.008, holdings })!;

  for (const trackPx of [270, 390, 1060]) {
    it(`never draws two chips over each other at ${trackPx}px`, () => {
      const { marks } = swarmLayout(split, holdings, { trackPx });
      const byLane = new Map<number, { left: number; right: number }[]>();
      for (const m of marks) {
        const w = swarmChipWidth(m.label, m.standout, "+4.0%");
        const box = { left: m.x * trackPx - w / 2, right: m.x * trackPx + w / 2 };
        const lane = byLane.get(m.lane) ?? [];
        for (const other of lane) {
          expect(box.left >= other.right || box.right <= other.left).toBe(true);
        }
        lane.push(box);
        byLane.set(m.lane, lane);
        // And never half off the card.
        expect(box.left).toBeGreaterThanOrEqual(-0.5);
        expect(box.right).toBeLessThanOrEqual(trackPx + 0.5);
      }
    });
  }

  it("puts no move at the middle and the scale is symmetric", () => {
    const { xOf } = swarmLayout(split, holdings, { trackPx: 1000 });
    expect(xOf(0)).toBeCloseTo(0.5);
    expect(xOf(0.01) - 0.5).toBeCloseTo(0.5 - xOf(-0.01));
  });

  it("marks exactly the companies the sentence names", () => {
    const { marks } = swarmLayout(split, holdings, { trackPx: 1000 });
    expect(marks.filter((m) => m.standout).map((m) => m.ticker)).toEqual(
      split.standouts.map((s) => s.ticker)
    );
  });
});

describe("the sentence names the session it read", () => {
  it("says Friday rather than today when the figures are Friday's close", () => {
    const split = { marketPct: 0.005, yoursPct: 0.006, read: "with" as const, standouts: [] };
    const line = marketOrYouLine(split, "The S&P 500", (n) => `${(n * 100).toFixed(1)}%`, "on Friday");
    expect(line).toContain("was up 0.5% on Friday, and your portfolio was up");
    expect(line).not.toContain("today");
  });
});
