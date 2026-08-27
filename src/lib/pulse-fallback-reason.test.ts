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
  buildFallbackPulseCheck,
  isMoveRestatement,
  pulseScanLine,
  shouldAutoPulseTicker,
  type PulseCandidate,
  type PulseCheck,
} from "@/lib/thesis-pulse";

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
      expect(check.verdict.trim(), `${action} branch`).not.toBe("");
      expect(check.situation.length, `${action} branch`).toBeGreaterThan(0);
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
