import { describe, expect, it } from "vitest";
import {
  analystSpread,
  earningsRamp,
  fairValueRead,
  impliedGrowth,
  valueGlance,
} from "@/lib/company/fair-value";
import { fundOverlap, overlapSentence } from "@/lib/company/fund-overlap";
import { makeFacts, makeOrdinaryFacts } from "@/lib/company/facts-fixture";
import { MARKET_EARNINGS_MULTIPLE } from "@/lib/company/scale";

/**
 * The block at the top of the page is the one somebody acts on, so it is
 * the one place where a wrong word is a real problem. Two properties hold
 * everything else up: **it never instructs**, and **it never overstates
 * what the numbers settled**.
 */

const INSTRUCTIONS =
  /\b(buy|sell|hold|avoid|should|recommend|advise|we (think|like)|worth (buying|owning)|cheap|expensive|undervalued|overvalued|bargain|opportunity)\b/i;

describe("the read at the top never tells anybody what to do", () => {
  const cases = [
    ["above every estimate", makeOrdinaryFacts({ price: 5_000 })],
    ["below every estimate", makeOrdinaryFacts({ price: 1 })],
    ["inside the range", makeOrdinaryFacts({ price: 110 })],
    ["nothing to go on", makeFacts()],
  ] as const;

  for (const [name, facts] of cases) {
    it(`stays descriptive when the price is ${name}`, () => {
      const glance = valueGlance(fairValueRead(facts));
      expect(glance.read, glance.read).not.toMatch(INSTRUCTIONS);
      expect(glance.nextQuestion, glance.nextQuestion).not.toMatch(INSTRUCTIONS);
      expect(glance.read.length).toBeGreaterThan(20);
      expect(glance.nextQuestion.length).toBeGreaterThan(20);
    });
  }

  it("says where the price sits, which is a fact rather than a verdict", () => {
    expect(valueGlance(fairValueRead(makeOrdinaryFacts({ price: 5_000 }))).position).toBe("above");
    expect(valueGlance(fairValueRead(makeOrdinaryFacts({ price: 1 }))).position).toBe("below");
    expect(valueGlance(fairValueRead(makeFacts())).position).toBe("unknown");
  });

  it("admits a wide range instead of calling it agreement", () => {
    /*
      Measured on AMD the methods ran from $151 to $618, and almost any
      price is inside a range that wide. Reporting that as though it
      settled something is the most flattering possible reading of a set
      of methods that plainly disagree.
    */
    const wide = valueGlance({
      today: {
        price: 100,
        used: [
          { id: "a", name: "A", maker: "arithmetic", price: 100, assumes: "", working: "", weight: 1 },
          { id: "b", name: "B", maker: "arithmetic", price: 400, assumes: "", working: "", weight: 1 },
        ],
        dropped: [],
        spread: 3,
        confidence: "mixed",
      },
      ahead: { price: null, used: [], dropped: [], spread: null, confidence: "none" },
      spot: 250,
      gapToday: null,
      gapAhead: null,
    });
    expect(wide.read).toContain("disagree");
    expect(wide.nextQuestion).toContain("settles nothing");
  });
});

describe("what the price is assuming", () => {
  it("is the growth that brings the multiple back to the market's", () => {
    // 40x now, five years to reach 20x: 2^(1/5) - 1, about 14.9%.
    const facts = makeOrdinaryFacts({ price: 400, epsNextYear: 10 });
    const implied = impliedGrowth(facts)!;
    expect(implied.rate).toBeCloseTo(Math.pow(2, 1 / 5) - 1, 6);
    expect(implied.years).toBe(5);
    expect(implied.basis).toBe("next year");
  });

  it("has nothing to say when the price is already ordinary", () => {
    /*
      There is no bet to size on a company trading at or below what the
      market ordinarily pays, and inventing one would be this app finding
      drama in an unremarkable price.
    */
    const facts = makeOrdinaryFacts({
      price: 10 * MARKET_EARNINGS_MULTIPLE - 1,
      epsNextYear: 10,
    });
    expect(impliedGrowth(facts)).toBeNull();
  });

  it("refuses rather than guessing when there is no earnings estimate", () => {
    expect(
      impliedGrowth(makeFacts({ price: 100, epsNextYear: null, epsThisYear: null }))
    ).toBeNull();
  });
});

describe("how much the analysts disagree", () => {
  it("measures the spread against the share price", () => {
    const spread = analystSpread(
      makeOrdinaryFacts({
        price: 100,
        analystTargetLow: 80,
        analystTargetHigh: 200,
        analystCount: 30,
      })
    )!;
    expect(spread.width).toBeCloseTo(1.2, 6);
    expect(spread.toLow).toBeCloseTo(-0.2, 6);
    expect(spread.toHigh).toBeCloseTo(1.0, 6);
    // Wider than the share price itself: the average is the midpoint of
    // an argument rather than a settled view.
    expect(spread.contested).toBe(true);
  });

  it("does not call a tight consensus contested", () => {
    const spread = analystSpread(
      makeOrdinaryFacts({ price: 100, analystTargetLow: 95, analystTargetHigh: 120 })
    )!;
    expect(spread.contested).toBe(false);
  });

  it("stands down when the feed has no range", () => {
    expect(
      analystSpread(makeOrdinaryFacts({ analystTargetLow: null }))
    ).toBeNull();
  });
});

describe("the earnings ramp", () => {
  it("reads last year, this year and next in order", () => {
    const ramp = earningsRamp(
      makeOrdinaryFacts({ epsTrailing: 4, epsThisYear: 8, epsNextYear: 16 })
    )!;
    expect(ramp.steps.map((s) => s.eps)).toEqual([4, 8, 16]);
    expect(ramp.total).toBeCloseTo(3, 6);
  });

  it("needs at least two points to be a ramp", () => {
    expect(
      earningsRamp(makeFacts({ epsTrailing: 4, epsThisYear: null, epsNextYear: null }))
    ).toBeNull();
  });

  it("shows a falling ramp as falling", () => {
    const ramp = earningsRamp(
      makeOrdinaryFacts({ epsTrailing: 10, epsThisYear: 8, epsNextYear: 6 })
    )!;
    expect(ramp.total).toBeLessThan(0);
  });
});

describe("how much of a fund you already own", () => {
  const HOLDINGS = [
    { symbol: "NVDA", weight: 0.08 },
    { symbol: "AAPL", weight: 0.07 },
    { symbol: "MSFT", weight: 0.06 },
    { symbol: "AMZN", weight: 0.04 },
  ];

  it("adds up the weight of the ones you hold", () => {
    const overlap = fundOverlap(HOLDINGS, ["nvda", "MSFT", "KO"])!;
    expect(overlap.shared.map((h) => h.symbol)).toEqual(["NVDA", "MSFT"]);
    expect(overlap.sharedWeight).toBeCloseTo(0.14, 6);
    expect(overlap.checked).toBe(4);
  });

  it("says nothing when you hold none of them", () => {
    expect(overlapSentence(fundOverlap(HOLDINGS, ["KO"]))).toBeNull();
  });

  it("says nothing at all when the reader has no portfolio", () => {
    expect(fundOverlap(HOLDINGS, [])).toBeNull();
  });

  it("claims only the holdings it actually checked", () => {
    /*
      The feed publishes a top ten and a broad fund holds hundreds, so a
      sentence saying "of the fund" would be a quiet overstatement of what
      was looked at.
    */
    const sentence = overlapSentence(fundOverlap(HOLDINGS, ["NVDA", "AAPL"]))!;
    expect(sentence).toContain("4 largest holdings");
    expect(sentence).not.toMatch(INSTRUCTIONS);
  });
});
