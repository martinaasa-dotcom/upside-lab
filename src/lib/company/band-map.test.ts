import { describe, expect, it } from "vitest";
import {
  CROWD_AT,
  TINY_SHARE,
  actionableFirst,
  buildBandMap,
} from "@/lib/company/band-map";
import { buildPlanLadder, type PlanLadder } from "@/lib/company/plan-ladder";
import { blocksThatFit } from "@/components/company/BandMap";

/**
 * The map's whole claim is that two names in the same band are in the
 * same place in their own plans, so the tests are mostly about that: a
 * $2 company and a $2,000 one at the same point of their own ladders
 * have to land in the same row, and the row a name lands in has to be
 * the row its own page would put it in.
 *
 * The rest is about the two things the picture must never do, both of
 * which it did in an earlier design: change its own proportions with
 * the portfolio, and drop a holding without saying so.
 */

function ladderAt(spot: number, anchor: number): PlanLadder {
  return buildPlanLadder({
    ticker: "T",
    anchor,
    anchorKind: "target",
    anchorSaid: "the target",
    spot,
    high: anchor * 1.25,
    low: anchor * 0.75,
  })!;
}

/** A holding whose price sits at `at` times its own fair value. */
function holding(ticker: string, at: number, value: number, roiPct = 0.1) {
  const anchor = 100;
  return { ticker, ladder: ladderAt(anchor * at, anchor), value, roiPct };
}

describe("the band is the common unit, not the price", () => {
  it("puts two names of wildly different prices in the same band", () => {
    const map = buildBandMap([
      { ticker: "CHEAP", ladder: ladderAt(2, 2), value: 100 },
      { ticker: "DEAR", ladder: ladderAt(2_000, 2_000), value: 100 },
    ]);
    const bands = map.bands.filter((b) => b.items.length > 0);
    expect(bands).toHaveLength(1);
    expect(bands[0]!.items.map((p) => p.ticker).sort()).toEqual([
      "CHEAP",
      "DEAR",
    ]);
  });

  it("takes its bands from the ladder rather than restating them", () => {
    const ladder = ladderAt(100, 100);
    const map = buildBandMap([{ ticker: "T", ladder, value: 1 }]);
    expect(map.bands.map((b) => b.id)).toEqual(ladder.bands.map((b) => b.id));
    expect(map.bands.map((b) => b.label)).toEqual(
      ladder.bands.map((b) => b.label)
    );
  });

  it("says nothing about a holding it could not build a ladder for", () => {
    const map = buildBandMap([
      { ticker: "ok", ladder: ladderAt(100, 100), value: 1 },
      { ticker: "nope", ladder: null, value: 1 },
    ]);
    expect(map.missing).toEqual(["NOPE"]);
    expect(map.points.map((p) => p.ticker)).toEqual(["OK"]);
  });
});

describe("a band's bar is the money in it", () => {
  it("shares out the portfolio, so the bands add up to all of it", () => {
    const map = buildBandMap([
      holding("A", 1, 60),
      holding("B", 0.85, 30),
      holding("C", 1.3, 10),
    ]);
    const total = map.bands.reduce((s, b) => s + b.share, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(map.bands.find((b) => b.id === "hold")!.share).toBeCloseTo(0.6, 10);
  });

  it("does not divide by a portfolio worth nothing", () => {
    const map = buildBandMap([
      { ticker: "A", ladder: ladderAt(100, 100), value: 0 },
      { ticker: "B", ladder: ladderAt(85, 100), value: 0 },
    ]);
    for (const p of map.points) expect(p.share).toBe(0);
    expect(map.topShare).toBe(0);
  });

  it("puts the biggest holding first inside its own band", () => {
    const map = buildBandMap([
      holding("SMALL", 1, 10),
      holding("BIG", 1.02, 70),
      holding("MID", 0.98, 20),
    ]);
    const hold = map.bands.find((b) => b.id === "hold")!;
    expect(hold.items.map((p) => p.ticker)).toEqual(["BIG", "MID", "SMALL"]);
  });
});

describe("the picture never changes its own proportions", () => {
  it("draws all seven bands whatever the portfolio holds", () => {
    const one = buildBandMap([holding("ONLY", 1, 100)]);
    const many = buildBandMap([
      holding("A", 1, 30),
      holding("B", 1.3, 20),
      holding("C", 0.75, 20),
      holding("D", 0.4, 30),
    ]);
    expect(one.bands).toHaveLength(7);
    expect(many.bands).toHaveLength(7);
    expect(one.bands.map((b) => b.id)).toEqual(many.bands.map((b) => b.id));
  });

  it("keeps an empty band rather than dropping it", () => {
    const map = buildBandMap([holding("ONLY", 1, 100)]);
    const empty = map.bands.filter((b) => b.items.length === 0);
    expect(empty.length).toBe(6);
    for (const b of empty) {
      expect(b.share).toBe(0);
      expect(b.label).toBeTruthy();
    }
  });
});

describe("the crowding cutoff never drops a name silently", () => {
  const crowd = () => [
    ...Array.from({ length: CROWD_AT + 2 }, (_, i) =>
      holding(`BIG${i}`, 1, 100)
    ),
    // Well under the cutoff, and nowhere near an end of its own plan.
    holding("TINY", 1, 1),
  ];

  it("stands a tiny holding down once the picture is crowded", () => {
    const map = buildBandMap(crowd());
    const hold = map.bands.find((b) => b.id === "hold")!;
    expect(hold.items.map((p) => p.ticker)).not.toContain("TINY");
    expect(hold.hidden.map((p) => p.ticker)).toContain("TINY");
    expect(map.summary.hiddenCount).toBe(1);
    expect(map.summary.hiddenShare).toBeGreaterThan(0);
  });

  it("draws every name while the portfolio is small enough", () => {
    const map = buildBandMap([holding("BIG", 1, 100), holding("TINY", 1, 1)]);
    const hold = map.bands.find((b) => b.id === "hold")!;
    expect(hold.items.map((p) => p.ticker)).toEqual(["BIG", "TINY"]);
    expect(map.summary.hiddenCount).toBe(0);
  });

  it("KEEPS A TINY NAME THAT HAS REACHED AN END OF ITS OWN PLAN", () => {
    /*
      The whole reason to open this picture is to find the name that
      reached a level, and a cutoff by size alone throws exactly that
      one away when it is small.
    */
    const rows = [...crowd(), holding("FALLEN", 0.3, 1)];
    const map = buildBandMap(rows);
    const fallen = map.points.find((p) => p.ticker === "FALLEN")!;
    expect(fallen.share).toBeLessThan(TINY_SHARE);
    expect(fallen.actionable).toBe(true);
    const band = map.bands.find((b) => b.id === fallen.bandId)!;
    expect(band.items.map((p) => p.ticker)).toContain("FALLEN");
    expect(band.hidden.map((p) => p.ticker)).not.toContain("FALLEN");
  });

  it("counts a folded name in its band's own share", () => {
    const map = buildBandMap(crowd());
    const hold = map.bands.find((b) => b.id === "hold")!;
    const drawn = hold.items.reduce((s, p) => s + p.share, 0);
    expect(hold.share).toBeGreaterThan(drawn);
    expect(hold.share).toBeCloseTo(
      drawn + hold.hidden.reduce((s, p) => s + p.share, 0),
      10
    );
  });
});

describe("how many blocks fit is a fact about the device", () => {
  it("gives a phone fewer names than a laptop", () => {
    // The bar column at 390px against the same column on a laptop.
    expect(blocksThatFit(326)).toBeLessThan(blocksThatFit(900));
  });

  it("never asks for a block narrower than a ticker needs", () => {
    expect(blocksThatFit(100)).toBe(1);
    expect(blocksThatFit(0)).toBeGreaterThan(0);
  });
});

describe("the summary is figures already on the page", () => {
  it("splits the portfolio around fair value", () => {
    const map = buildBandMap([
      holding("MID", 1, 50),
      holding("LOW", 0.75, 30),
      holding("HIGH", 1.3, 20),
    ]);
    expect(map.summary.aroundFairValue).toBeCloseTo(0.5, 10);
    expect(map.summary.below).toBeCloseTo(0.3, 10);
    expect(map.summary.above).toBeCloseTo(0.2, 10);
    expect(
      map.summary.aroundFairValue + map.summary.below + map.summary.above
    ).toBeCloseTo(1, 10);
  });

  it("names the two ends apart, since they are different answers", () => {
    const map = buildBandMap([
      holding("TRIMME", 1.4, 40),
      holding("ADDME", 0.3, 40),
      holding("QUIET", 1, 20),
    ]);
    expect(map.summary.trimNames).toEqual(["TRIMME"]);
    expect(map.summary.addNames).toEqual(["ADDME"]);
  });

  it("names the biggest holding, not the first one given", () => {
    const map = buildBandMap([
      holding("SMALL", 1, 10),
      holding("BIG", 0.85, 90),
    ]);
    expect(map.summary.biggest?.ticker).toBe("BIG");
  });

  it("is empty rather than wrong when no ladder could be built", () => {
    const map = buildBandMap([{ ticker: "X", ladder: null, value: 10 }]);
    expect(map.summary.biggest).toBeNull();
    expect(map.summary.aroundFairValue).toBe(0);
    expect(map.bands).toEqual([]);
  });
});

describe("the list on Home leads with what is furthest out", () => {
  it("puts the ends of the ladder before the middle, and drops the middle", () => {
    const map = buildBandMap([
      holding("TOP", 1.4, 10),
      holding("MID", 1, 10),
      holding("BOTTOM", 0.3, 10),
    ]);
    const out = actionableFirst(map.points).map((p) => p.ticker);
    expect(out).not.toContain("MID");
    expect(out.sort()).toEqual(["BOTTOM", "TOP"]);
  });

  it("breaks a tie on how much of the portfolio it is", () => {
    const map = buildBandMap([
      holding("SMALL", 1.4, 10),
      holding("BIG", 1.4, 90),
    ]);
    expect(actionableFirst(map.points)[0]!.ticker).toBe("BIG");
  });
});
