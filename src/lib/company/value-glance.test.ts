import { readFileSync } from "node:fs";
import { join } from "node:path";
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
      estimate: {
        price: 100,
        used: [
          { id: "a", name: "A", source: "a", maker: "arithmetic", price: 100, assumes: "", working: "", weight: 1 },
          { id: "b", name: "B", source: "b", maker: "arithmetic", price: 400, assumes: "", working: "", weight: 1 },
        ],
        dropped: [],
        spread: 3,
        confidence: "mixed",
      },
      spot: 250,
      gap: null,
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


/**
 * THE PICTURE NAMES EVERY PART OF ITSELF WHERE THAT PART STANDS.
 *
 * It drew a grey bar on a slightly darker grey bar, both the same height
 * and shape, and printed the brighter one's two figures at the far left
 * and far right of the row beneath, with its caption under the middle of
 * the panel. Nothing on screen said which bar was the scale and which was
 * the data, and no figure stood anywhere near the thing it named.
 *
 * Read as source rather than rendered, because this suite runs in node and
 * there is no jsdom in the repo. It asserts the rules, not the markup.
 */
describe("the valuation picture", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/company/ValueGlance.tsx"),
    "utf8"
  );

  it("draws the scale as a hairline, so it cannot be mistaken for a reading", () => {
    expect(src).toMatch(/h-px[^"]*rounded-full bg-foreground\/\[0\.12\]/);
  });

  it("anchors the band's own figures and caption to the band", () => {
    expect(src).toMatch(/<Anchored left=\{lowLabel\}/);
    expect(src).toMatch(/<Anchored left=\{highLabel\}/);
    expect(src).toMatch(/<Anchored left=\{bandMiddle\}/);
    // Never back to a spread row pinned to the panel's two edges.
    expect(src).not.toMatch(/items-baseline justify-between[^>]*>\s*<span>\{currency\(low/);
  });

  it("puts the twelve month estimate back on the line as a mark", () => {
    expect(src).toMatch(/blend !== null && blendLabel !== null/);
    expect(src).toMatch(/name="In 12 months"/);
  });

  it("does not stamp the word estimate over that mark", () => {
    expect(src).not.toMatch(/name="Estimate"/);
  });

  it("does not print the same figure again underneath the picture", () => {
    expect(src).not.toMatch(/<MicroLabel>12 month estimate<\/MicroLabel>/);
  });

  /*
    The labels hang from a band of their own rather than off the track, so
    a mark with a note under its price cannot grow upward into the
    subtitle. Measured on the real component before this: the taller mark's
    first line came within 12px of the subtitle on a laptop and 8px on a
    phone, and the two names sat 16px apart vertically. Neither is
    something more `mt-*` fixes, because the space needed depends on how
    many lines the tallest mark happens to have.
  */
  it("hangs the labels from a band of their own, not off the track", () => {
    expect(src).toMatch(/relative h-\[3\.5rem\]/);
    expect(src).toMatch(/"absolute top-0 flex -translate-x-1\/2 flex-col/);
    expect(src).not.toMatch(/absolute bottom-full/);
  });

  /*
    A reader cannot see what "the range of the estimates" is while the
    estimates themselves are not on the picture. Two goes at captioning the
    bar failed for that reason. Drawing each surviving method where it
    landed makes the bar an obvious thing rather than a grey rectangle to
    take on trust.
  */
  it("draws every method as its own tick, so the bar explains itself", () => {
    expect(src).toMatch(/estimates\.map\(\(price\) => \(/);
    expect(src).toMatch(/estimates: number\[\]/);
  });

  it("draws no band, no ticks and no end figures when there is no range", () => {
    // One surviving method made the low and the high the same number, and
    // the two end figures were pushed apart into the same price printed
    // twice, which reads as a fault in the page.
    expect(src).toMatch(/const hasBand = high > low;/);
    expect(src).toMatch(/\{hasBand && \(/);
    expect(src).toMatch(/\{hasBand &&\s*estimates\.map/);
  });

  it("keeps two labels that nearly coincide from printing over each other", () => {
    expect(src).toMatch(/function spread\(/);
    expect(src).toMatch(/LABEL_GAP/);
    expect(src).toMatch(/EDGE_GAP/);
  });
});
