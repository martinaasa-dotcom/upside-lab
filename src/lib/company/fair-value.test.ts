import { describe, expect, it } from "vitest";
import {
  blendFairValue,
  fairValueRead,
  gapSentence,
  type FairValueMethod,
} from "@/lib/company/fair-value";
import { makeOrdinaryFacts } from "@/lib/company/facts-fixture";

/**
 * Three properties, and each of them is a way this card could quietly turn
 * into a recommendation engine.
 *
 * A method may not be silently dropped, because a disappearing estimate is
 * the same class of bug as the forecast floor: an adjustment the reader
 * cannot see and would object to. The blend may not be nudged towards the
 * current price, in either direction, because a number that always agrees
 * with the market is not an estimate. And no output may contain a verdict
 * word, because the whole design is that the reader draws the conclusion.
 */

const facts = makeOrdinaryFacts;

function method(over: Partial<FairValueMethod> = {}): FairValueMethod {
  return {
    id: "x",
    name: "A method",
    maker: "arithmetic",
    price: 100,
    assumes: "something",
    working: "somehow",
    weight: 0.25,
    ...over,
  };
}

describe("nothing disappears", () => {
  it("keeps a thrown-out method in the result with the reason on it", () => {
    const blend = blendFairValue([
      method({ id: "a", price: 100 }),
      method({ id: "b", price: 110 }),
      method({ id: "c", price: 5_000 }),
    ]);
    expect(blend.used.map((m) => m.id)).toEqual(["a", "b"]);
    expect(blend.dropped).toHaveLength(1);
    expect(blend.dropped[0]?.id).toBe("c");
    expect(blend.dropped[0]?.dropped).toBeTruthy();
  });

  it("throws nothing out when there are too few methods to judge one", () => {
    /*
      Two methods far apart are a disagreement, not an error. With nothing
      to be the majority, dropping one would be this app picking a side.
    */
    const blend = blendFairValue([
      method({ id: "a", price: 10 }),
      method({ id: "b", price: 900 }),
    ]);
    expect(blend.dropped).toHaveLength(0);
    expect(blend.used).toHaveLength(2);
  });

  it("says how thin it is rather than presenting one method as a blend", () => {
    expect(blendFairValue([method()]).confidence).toBe("thin");
    expect(
      blendFairValue([method({ id: "a" }), method({ id: "b" })]).confidence
    ).toBe("mixed");
    expect(
      blendFairValue(
        ["a", "b", "c", "d"].map((id) => method({ id, price: 100 }))
      ).confidence
    ).toBe("broad");
  });

  it("has no answer rather than a guess when nothing could be run", () => {
    const blend = blendFairValue([]);
    expect(blend.price).toBeNull();
    expect(blend.confidence).toBe("none");
  });
});

describe("the blend is the weighted average and nothing else", () => {
  it("weights exactly as it says on each method", () => {
    const blend = blendFairValue([
      method({ id: "a", price: 100, weight: 0.75 }),
      method({ id: "b", price: 200, weight: 0.25 }),
    ]);
    expect(blend.price).toBeCloseTo(125, 6);
  });

  it("is never pulled towards today's price", () => {
    /*
      A fair value that always lands near the market is a fair value that
      says nothing. Only the analysts' average can run here, it says a
      quarter of today's price, and the blend has to say the same rather
      than splitting the difference with the market.
    */
    const read = fairValueRead(
      facts({
        price: 400,
        analystTargetMean: 100,
        analystTargetLow: 90,
        analystTargetHigh: 110,
        epsNextYear: null,
        epsForward: null,
        forwardPe: null,
        epsGrowthNextYear: null,
        epsGrowthThisYear: null,
        revenueGrowth: null,
      })
    );
    expect(read.estimate.price).toBeCloseTo(100, 6);
    expect(read.gap).toBeCloseTo(-0.75, 6);
  });

  it("never prices a fast-growing company off the market's average multiple", () => {
    /*
      THE FAULT THIS FILE SHIPPED TWICE, IN TWO DIFFERENT METHODS.

      A company growing earnings at 104% a year, valued at the market's
      long-run multiple of 20, comes out at a fraction of its share price
      with the arithmetic perfectly sound and the premise nonsense. On AMD
      it produced $151 against a price of $478 and dragged the headline
      figure to $223. A page carrying a number like that does not read as
      conservative, it reads as fabricated, and it costs the credibility
      of every honest figure beside it.

      The method is deleted rather than down-weighted, so the assertion is
      that nothing survives which prices this company anywhere near the
      market's yardstick.
    */
    const amdLike = facts({
      price: 477.57,
      epsTrailing: 3.92,
      epsThisYear: 7.57,
      epsNextYear: 15.45,
      epsGrowthNextYear: 1.04,
      revenueGrowth: 0.5,
      analystTargetMean: 613.84,
      analystTargetLow: 365,
      analystTargetHigh: 1250,
      analystCount: 49,
    });
    const read = fairValueRead(amdLike);
    expect(read.estimate.price).not.toBeNull();
    // Nothing that survives may sit anywhere near the market-multiple
    // answer, which for this company would have been about $151.
    for (const method of read.estimate.used) {
      expect(method.price, method.name).toBeGreaterThan(300);
    }
    expect(read.estimate.price!).toBeGreaterThan(400);
  });

  it("has no method that multiplies earnings by the market average", () => {
    // Named rather than inferred, so re-adding it fails here first.
    const read = fairValueRead(makeOrdinaryFacts());
    for (const method of [...read.estimate.used, ...read.estimate.dropped]) {
      expect(method.id, method.name).not.toMatch(/^earnings-/);
      expect(method.name.toLowerCase()).not.toContain("average company");
    }
  });

  it("lets an estimate land below today's price", () => {
    const read = fairValueRead(facts({ price: 1_000, analystTargetMean: 200 }));
    expect(read.estimate.price).toBeLessThan(1_000);
  });
});

describe("no method is run on a figure that is not there", () => {
  it("runs nothing when the feed carried nothing", () => {
    const read = fairValueRead(
      facts({
        price: null,
        epsTrailing: null,
        epsForward: null,
        epsThisYear: null,
        epsNextYear: null,
        epsGrowthThisYear: null,
        epsGrowthNextYear: null,
        revenueGrowthNextYear: null,
        trailingPe: null,
        forwardPe: null,
        freeCashFlow: null,
        sharesOutstanding: null,
        analystTargetMean: null,
        revenueGrowth: null,
      })
    );
    expect(read.estimate.price).toBeNull();
    expect(read.estimate.price).toBeNull();
    expect(read.gap).toBeNull();
  });

  it("counts an analyst average for more when more of them published", () => {
    const many = fairValueRead(facts({ analystCount: 20 }));
    const one = fairValueRead(facts({ analystCount: 1 }));
    const weightOf = (r: ReturnType<typeof fairValueRead>) =>
      r.estimate.used.find((m) => m.id === "consensus")?.weight ?? 0;
    expect(weightOf(many)).toBeGreaterThan(weightOf(one));
  });

  it("names the model as a model wherever its number is used", () => {
    const read = fairValueRead(facts(), { modelYearOne: 150 });
    const fromModel = read.estimate.used.find((m) => m.id === "model");
    expect(fromModel?.maker).toBe("model");
    expect(fromModel?.assumes.toLowerCase()).toContain("model");
  });
});

describe("nothing here reaches a verdict", () => {
  const VERDICTS =
    /\b(cheap|expensive|undervalued|overvalued|bargain|buy|sell|hold|avoid|recommend)\b/i;

  it("keeps verdict words out of every sentence a reader sees", () => {
    const read = fairValueRead(facts(), { modelYearOne: 150 });
    const sentences = [
      ...read.estimate.used,
      ...read.estimate.used,
      ...read.estimate.dropped,
      ...read.estimate.dropped,
    ].flatMap((m) => [m.name, m.assumes, m.working, m.dropped ?? ""]);
    sentences.push(gapSentence(read.gap, read.estimate.price) ?? "");
    sentences.push(gapSentence(read.gap, read.estimate.price) ?? "");
    for (const line of sentences) {
      expect(line, line).not.toMatch(VERDICTS);
    }
  });

  it("states the gap as a fact rather than a judgement", () => {
    expect(gapSentence(0.3, 100)).toContain("above");
    expect(gapSentence(-0.3, 100)).toContain("below");
    expect(gapSentence(0.01, 100)).toContain("within a few percent");
    expect(gapSentence(null, null)).toBeNull();
  });

  it("uses no em dash anywhere, the way every reader surface must not", () => {
    const read = fairValueRead(facts(), { modelYearOne: 150 });
    for (const m of [...read.estimate.used, ...read.estimate.used]) {
      expect(`${m.name}${m.assumes}${m.working}`).not.toMatch(/[—–]/);
    }
  });

  /*
    THE ANALYSTS ARE WEIGHTED BY HOW MUCH THEY AGREE, NEVER BY WHO THEY ARE.

    The feed publishes an average, a high, a low and a count and no names,
    so there is nothing to weight an individual analyst by; and leaning
    towards the ones who agree with a house view would be that house view
    wearing their research as a costume. Agreement is measurable and
    directionless, so that is what moves the weight.
  */
  it("leans less on a consensus whose members disagree with each other", () => {
    const tight = fairValueRead(
      facts({ analystTargetLow: 190, analystTargetHigh: 230 }),
      { modelYearOne: 150 }
    );
    const contested = fairValueRead(
      facts({ analystTargetLow: 60, analystTargetHigh: 320 }),
      { modelYearOne: 150 }
    );
    const weightOf = (r: typeof tight) =>
      r.estimate.used.find((m) => m.id === "consensus")?.weight ?? 0;
    expect(weightOf(tight)).toBeGreaterThan(0);
    expect(weightOf(contested)).toBeLessThan(weightOf(tight));
    // Both still count. A contested consensus is worth less, never nothing.
    expect(weightOf(contested)).toBeGreaterThan(0);
  });

  it("says out loud when it has discounted a contested consensus", () => {
    const contested = fairValueRead(
      facts({ analystTargetLow: 60, analystTargetHigh: 320 }),
      { modelYearOne: 150 }
    );
    const method = contested.estimate.used.find((m) => m.id === "consensus");
    expect(method?.assumes).toContain("counts for less");
  });
});
