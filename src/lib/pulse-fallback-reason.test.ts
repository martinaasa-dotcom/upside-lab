/**
 * The deterministic Pulse fallback fires whenever the model misses a ticker,
 * and whatever it writes into `moveReason` is what the "Recent range"
 * table prints in its *Why* column -- directly beside a *Today* column
 * holding that name's live percentage.
 *
 * Two of the three branches used to answer that "why" with the percentage
 * itself (`Today move is -5.8%.`), which fails twice over: it restates the
 * number instead of explaining it, and because a check is cached per ticker
 * for an hour while the column is recomputed live, the two drift apart --
 * the report that surfaced this had $AVGO reading "Today move is -5.8%"
 * beside a live +0.4%.
 *
 * A sentence with no figure in it cannot drift, so that is the invariant
 * worth holding: no digits in a fallback reason, ever. Asserting the shape
 * rather than the exact wording leaves the copy free to change.
 */
import { describe, expect, it } from "vitest";

import {
  actionLabel,
  buildFallbackPulseCheck,
  isMoveRestatement,
  normalizePulseCheck,
  pulseLead,
  pulseScanLine,
  rangeSentence,
  rangeStanding,
  rangeWindowWords,
  candidateRange,
  recentRange,
  reconcilePulseCheck,
  shouldAutoPulseTicker,
  type PulseCandidate,
  type PulseCheck,
} from "@/lib/thesis-pulse";
import type { Quote } from "@/lib/types";

function candidate(over: Partial<PulseCandidate> = {}): PulseCandidate {
  return {
    ticker: "AVGO",
    shares: 10,
    buyValue: 1000,
    currentValue: 1200,
    roiPct: 0.2,
    roiDollar: 200,
    todayDollar: 0,
    bookPct: 0.05,
    portfolios: [],
    price: 120,
    regularPct: 0,
    extendedPct: null,
    effectivePct: 0,
    moveLabel: "Today",
    moveSource: "regular",
    rangeLow: null,
    rangeHigh: null,
    rangeDays: 0,
    needsAttention: false,
    isBigMove: false,
    inBook: true,
    ...over,
  };
}

/** One per branch of the fallback, keyed by the action each produces. */
const BRANCHES = {
  trim: candidate({ effectivePct: 0.14, isBigMove: true }),
  add: candidate({ effectivePct: -0.058, needsAttention: true, isBigMove: true }),
  hold: candidate({ effectivePct: 0.004 }),
};

describe("buildFallbackPulseCheck", () => {
  it("reaches every branch", () => {
    for (const [action, input] of Object.entries(BRANCHES)) {
      expect(buildFallbackPulseCheck(input).action).toBe(action);
    }
  });

  it("never puts a figure in the reason, so it cannot drift from the live column", () => {
    for (const [action, input] of Object.entries(BRANCHES)) {
      const { moveReason } = buildFallbackPulseCheck(input);
      expect(moveReason, `${action} branch`).not.toMatch(/\d/);
    }
  });

  it("says why rather than restating the move", () => {
    for (const [action, input] of Object.entries(BRANCHES)) {
      const { moveReason } = buildFallbackPulseCheck(input);
      // The old shape, and any near relative of it.
      expect(moveReason, `${action} branch`).not.toMatch(/\bmove is\b/i);
      // Long enough to be a sentence with a reason in it, not a label.
      expect(moveReason.split(/\s+/).length, `${action} branch`).toBeGreaterThan(6);
    }
  });

  it("still fills in the rest of the check", () => {
    for (const [action, input] of Object.entries(BRANCHES)) {
      const check = buildFallbackPulseCheck(input);
      expect(check.ticker, `${action} branch`).toBe(input.ticker);
      expect(check.thesisStatus, `${action} branch`).toBe("intact");
      expect(check.situation.length, `${action} branch`).toBeGreaterThan(0);
      expect(check.moveReason.trim(), `${action} branch`).not.toBe("");
    }
  });
});

const avgoStale: PulseCheck = {
  ticker: "AVGO",
  situation: ["Down more than a typical day."],
  moveReason: "Today move is -5.8%.",
  thesisStatus: "intact",
  earningsNote: "",
  action: "add",
  trimPct: null,
  addLevel: "around $120",
  verdict: "",
  thesisBreak: "",
};

describe("stale move restatement", () => {
  it("recognises the old fallback why", () => {
    expect(isMoveRestatement("Today move is -5.8%.")).toBe(true);
    expect(isMoveRestatement("Today move is +0.4%.")).toBe(true);
    expect(isMoveRestatement("Down more than a typical day. The stated reason is a separate fact.")).toBe(false);
  });

  it("re-pulses a quiet name whose why is that leftover sentence", () => {
    expect(
      shouldAutoPulseTicker({
        needsAttention: false,
        cachedAt: "2026-01-01T00:00:00Z",
        check: avgoStale,
      })
    ).toBe(true);
  });

  it("does not print the leftover percent next to a live today column", () => {
    const line = pulseScanLine({
      ticker: "AVGO",
      effectivePct: 0.018,
      moveLabel: "Today",
      check: avgoStale,
    });
    expect(line).not.toMatch(/Today move is/i);
    expect(line).not.toMatch(/-5\.8/);
    expect(line).toMatch(/below its recent range/i);
  });
});


/**
 * A row nobody modelled has to say so all the way through.
 *
 * The flag is what the card, the eye and the Sunday letter's stamp all
 * read, and every one of those decisions is made after the row has been
 * normalized and reconciled at least once, so losing it at any hop puts
 * the model's badge back on a fixed rule.
 */
describe("a fallback row is marked as one", () => {
  it("marks every branch", () => {
    for (const [action, input] of Object.entries(BRANCHES)) {
      expect(buildFallbackPulseCheck(input).fallback, action).toBe(true);
    }
  });

  it("survives normalize and reconcile", () => {
    const built = buildFallbackPulseCheck(BRANCHES.add);
    expect(normalizePulseCheck(built).fallback).toBe(true);
    expect(reconcilePulseCheck(built).fallback).toBe(true);
  });

  it("leaves a model-written row unmarked", () => {
    expect(reconcilePulseCheck(avgoStale).fallback).toBe(false);
  });

  it("never invents a price level, including the words around $spot", () => {
    for (const [action, input] of Object.entries(BRANCHES)) {
      expect(buildFallbackPulseCheck(input).addLevel, action).toBe("");
    }
    const noPrice = candidate({
      price: 0,
      effectivePct: -0.09,
      needsAttention: true,
    });
    expect(buildFallbackPulseCheck(noPrice).addLevel).not.toMatch(/spot/i);
  });

  it("is asked again once its cache has aged, and not before", () => {
    const built = buildFallbackPulseCheck(BRANCHES.hold);
    expect(
      shouldAutoPulseTicker({
        needsAttention: false,
        cachedAt: new Date().toISOString(),
        check: built,
      })
    ).toBe(false);
    expect(
      shouldAutoPulseTicker({
        needsAttention: false,
        cachedAt: "2020-01-01T00:00:00Z",
        check: built,
      })
    ).toBe(true);
  });
});

/**
 * A watch verdict means the model saw something in the story worth
 * following. It used to reach the reader as a complaint about missing
 * price history, on a badge coloured as a caution.
 */
describe("watch says what the model meant", () => {
  it("does not blame the data", () => {
    expect(actionLabel("watch")).toBe("Worth watching");
    expect(actionLabel("watch")).not.toMatch(/history/i);
    expect(pulseLead({ action: "watch" })).not.toMatch(/history/i);
    expect(pulseLead({ action: "watch" })).toMatch(/worth watching/i);
  });

  it("keeps the three range tags, which are measured now", () => {
    expect(actionLabel("add")).toMatch(/below its recent range|below recent range/i);
    expect(actionLabel("trim")).toMatch(/above recent range/i);
    expect(actionLabel("hold")).toMatch(/inside recent range/i);
  });

  it("never prints a dollar level in the lead sentence", () => {
    const lead = pulseLead({ action: "add", addLevel: "around $205" } as never);
    expect(lead).not.toMatch(/\$/);
    expect(lead).not.toMatch(/205/);
  });
});

/**
 * The range is measured or it is absent. Nothing on the card may state a
 * low and a high the app did not read off real closes.
 */
function quote(over: Partial<Quote> = {}): Quote {
  return {
    ticker: "AVGO",
    price: 120,
    change: 0,
    changePercent: 0,
    previousClose: 120,
    sparkline: [],
    marketState: "REGULAR",
    preMarketPrice: null,
    preMarketChange: null,
    preMarketChangePercent: null,
    postMarketPrice: null,
    postMarketChange: null,
    postMarketChangePercent: null,
    ...over,
  };
}

describe("recentRange", () => {
  /** `n` dated closes, one calendar day apart, cycling 100 to 136. */
  function bars(n: number, from = new Date("2026-06-01T00:00:00Z")) {
    return Array.from({ length: n }, (_, i) => ({
      date: new Date(from.getTime() + i * 86_400_000)
        .toISOString()
        .slice(0, 10),
      close: 100 + (i % 10) * 4,
    }));
  }

  it("measures from dated closes, and names the window from the dates", () => {
    const r = recentRange(quote({ dailyCloses: bars(21) }));
    expect(r).not.toBeNull();
    expect(r?.low).toBe(100);
    expect(r?.high).toBe(136);
    // Twenty-one bars a day apart span twenty calendar days, not 21 of
    // anything, and it is the span the sentence has to say.
    expect(r?.days).toBe(20);
    expect(rangeWindowWords(r!.days)).toBe("3 weeks");
  });

  /**
   * The whole reason this reads dated bars only. On the running app a
   * quote carries 32 sparkline points over about ninety days and 15 dated
   * closes, so counting sparkline points would have called a ninety-day
   * high and low a one-month range, and a synthesized sparkline has no
   * real high or low at all.
   */
  it("refuses a sparkline, however long", () => {
    const spark = Array.from({ length: 32 }, (_, i) => 100 + (i % 10) * 4);
    expect(recentRange(quote({ sparkline: spark }))).toBeNull();
  });

  it("says nothing at all when the dated history is short", () => {
    expect(recentRange(quote({ dailyCloses: bars(4) }))).toBeNull();
    expect(recentRange(quote())).toBeNull();
    expect(recentRange(null)).toBeNull();
  });

  it("refuses a line flat enough to have no range", () => {
    const flat = bars(20).map((row) => ({ ...row, close: 100 }));
    expect(recentRange(quote({ dailyCloses: flat }))).toBeNull();
  });

  it("never describes a window as longer than it was", () => {
    expect(rangeWindowWords(6)).toBe("6 days");
    expect(rangeWindowWords(20)).toBe("3 weeks");
    expect(rangeWindowWords(23)).toBe("3 weeks");
    expect(rangeWindowWords(24)).toBe("month");
    expect(rangeWindowWords(44)).toBe("month");
    expect(rangeWindowWords(45)).toBe("two months");
    expect(rangeWindowWords(90)).toBe("three months");
  });

  it("places today between the two, and clamps a new high to the end", () => {
    const range = { low: 100, high: 200, days: 60 };
    expect(rangeStanding(150, range)).toBeCloseTo(0.5, 5);
    expect(rangeStanding(100, range)).toBe(0);
    expect(rangeStanding(260, range)).toBe(1);
    expect(rangeStanding(50, range)).toBe(0);
    expect(rangeStanding(150, null)).toBeNull();
  });

  it("states both figures in the sentence, so the bar can be checked", () => {
    const line = rangeSentence(150, { low: 100, high: 200, days: 60 });
    expect(line).toContain("$100.00");
    expect(line).toContain("$200.00");
    expect(line).toContain("$150.00");
    expect(line).toContain("two months");
    expect(rangeSentence(150, null)).toBe("");
  });
});

/**
 * The fixed rule and the bar under it are one card, so they have to agree.
 *
 * The rule used to read the day's move alone, and the card now prints a
 * measured low and high on a bar directly beneath the badge. A company down
 * six per cent today but sitting in the middle of its own three weeks got
 * "Below recent range" over a bar with the dot at the centre, which is the
 * app contradicting itself in plain sight.
 */
describe("the fixed rule reads the range the card draws", () => {
  const withRange = (price: number, low: number, high: number) =>
    candidate({
      price,
      rangeLow: low,
      rangeHigh: high,
      rangeDays: 20,
      effectivePct: -0.06,
      needsAttention: true,
      isBigMove: true,
    });

  it("calls a price mid-range inside it, whatever the day did", () => {
    const check = buildFallbackPulseCheck(withRange(150, 100, 200));
    expect(check.action).toBe("hold");
    expect(actionLabel(check.action)).toMatch(/inside/i);
  });

  it("calls a price at the bottom below it", () => {
    expect(buildFallbackPulseCheck(withRange(105, 100, 200)).action).toBe("add");
  });

  it("calls a price at the top above it, and sizes the take-off", () => {
    const check = buildFallbackPulseCheck(withRange(195, 100, 200));
    expect(check.action).toBe("trim");
    expect(check.trimPct).toBeGreaterThan(0);
  });

  it("still marks itself as nobody's reading", () => {
    expect(buildFallbackPulseCheck(withRange(150, 100, 200)).fallback).toBe(true);
  });

  it("falls back to the move only when no range was measured", () => {
    const noRange = candidate({
      effectivePct: -0.06,
      needsAttention: true,
      isBigMove: true,
    });
    expect(buildFallbackPulseCheck(noRange).action).toBe("add");
  });
});

/**
 * A candidate arrives on the request body, and the route puts its low and
 * high straight into the prompt. On a company the reader has written
 * nothing about, that answer is then cached under the shared key and served
 * to every other holder of it, so nothing off the wire is trusted.
 */
describe("candidateRange checks what it was handed", () => {
  const at = (over: Record<string, unknown>) =>
    candidateRange({
      rangeLow: 100,
      rangeHigh: 200,
      rangeDays: 20,
      ...over,
    } as Parameters<typeof candidateRange>[0]);

  it("takes a real range", () => {
    expect(at({})).toEqual({ low: 100, high: 200, days: 20 });
  });

  it("refuses strings that happen to compare larger", () => {
    expect(at({ rangeLow: "3", rangeHigh: "5" })).toBeNull();
  });

  it("refuses a range that is not one", () => {
    expect(at({ rangeHigh: 100 })).toBeNull();
    expect(at({ rangeLow: 0 })).toBeNull();
    expect(at({ rangeLow: -5 })).toBeNull();
    expect(at({ rangeHigh: Infinity })).toBeNull();
    expect(at({ rangeLow: NaN })).toBeNull();
  });

  it("bounds the window rather than printing whatever arrived", () => {
    expect(at({ rangeDays: 99999 })?.days).toBe(400);
    expect(at({ rangeDays: -4 })?.days).toBe(1);
    expect(at({ rangeDays: "many" })?.days).toBe(1);
  });
});
