import { describe, expect, it } from "vitest";
import {
  blendFairValue,
  fairValueRead,
  gapSentence,
  type FairValueMethod,
} from "@/lib/company/fair-value";
import { makeOrdinaryFacts } from "@/lib/company/facts-fixture";
import { MARKET_EARNINGS_MULTIPLE } from "@/lib/company/scale";

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
      The failure this guards is the tempting one: a fair value that always
      lands near the market is a fair value that says nothing. Only the
      earnings method can run here, it says a quarter of today's price, and
      the blend has to say the same rather than splitting the difference
      with the market.
    */
    const read = fairValueRead(
      facts({
        price: 400,
        epsTrailing: 10,
        epsForward: 10,
        epsThisYear: 10,
        epsNextYear: 10,
        epsGrowthThisYear: null,
        epsGrowthNextYear: null,
        revenueGrowthNextYear: null,
        revenueGrowth: null,
        freeCashFlow: null,
      })
    );
    expect(read.today.price).toBeCloseTo(10 * MARKET_EARNINGS_MULTIPLE, 0);
    expect(read.gapToday).toBeGreaterThan(0.9);
  });

  it("lets an estimate land below today's price", () => {
    const read = fairValueRead(facts({ price: 1_000, analystTargetMean: 200 }));
    expect(read.ahead.price).toBeLessThan(1_000);
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
    expect(read.today.price).toBeNull();
    expect(read.ahead.price).toBeNull();
    expect(read.gapToday).toBeNull();
  });

  it("counts an analyst average for more when more of them published", () => {
    const many = fairValueRead(facts({ analystCount: 20 }));
    const one = fairValueRead(facts({ analystCount: 1 }));
    const weightOf = (r: ReturnType<typeof fairValueRead>) =>
      r.ahead.used.find((m) => m.id === "consensus")?.weight ?? 0;
    expect(weightOf(many)).toBeGreaterThan(weightOf(one));
  });

  it("names the model as a model wherever its number is used", () => {
    const read = fairValueRead(facts(), { modelYearOne: 150 });
    const fromModel = read.ahead.used.find((m) => m.id === "model");
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
      ...read.today.used,
      ...read.ahead.used,
      ...read.today.dropped,
      ...read.ahead.dropped,
    ].flatMap((m) => [m.name, m.assumes, m.working, m.dropped ?? ""]);
    sentences.push(gapSentence(read.gapToday, read.today.price) ?? "");
    sentences.push(gapSentence(read.gapAhead, read.ahead.price) ?? "");
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
    for (const m of [...read.today.used, ...read.ahead.used]) {
      expect(`${m.name}${m.assumes}${m.working}`).not.toMatch(/[—–]/);
    }
  });
});
