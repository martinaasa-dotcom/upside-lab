import { describe, expect, it } from "vitest";
import {
  LANE_WEIGHTS,
  ladderUnits,
  stackDepth,
  actionableFirst,
  buildBandMap,
  ladderHeight,
  lanesFrom,
  placeUp,
  rankAcross,
} from "@/lib/company/band-map";
import { buildPlanLadder, type PlanLadder } from "@/lib/company/plan-ladder";

/**
 * The map's whole claim is that two names drawn level are in the same
 * place in their own plans, so the tests are mostly about that: a $2
 * company and a $2,000 one at the same point of their own ladders have to
 * land on the same line.
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

describe("the ladder is the common unit, not the price", () => {
  it("draws two names of wildly different prices level", () => {
    const cheap = ladderAt(2, 2);
    const dear = ladderAt(2_000, 2_000);
    expect(ladderHeight(cheap)).toBeCloseTo(ladderHeight(dear)!, 10);
  });

  it("runs from the foot of the ladder to its head", () => {
    const units = Object.values(LANE_WEIGHTS).reduce((a, b) => a + b, 0);
    const bottom = ladderAt(1, 100);
    const top = ladderAt(400, 100);
    expect(ladderHeight(bottom)!).toBeLessThan(units * 0.15);
    expect(ladderHeight(top)!).toBeGreaterThan(units * 0.85);
  });

  it("puts a price a hair either side of a level a hair apart", () => {
    const ladder = ladderAt(100, 100);
    const edge = ladder.bands.find((b) => b.id === "hold")!.to!;
    const below = ladderHeight(ladderAt(edge - 0.01, 100))!;
    const above = ladderHeight(ladderAt(edge + 0.01, 100))!;
    expect(above).toBeGreaterThan(below);
    // Well under one ordinary lane, which is the unit here.
    expect(above - below).toBeLessThan(0.3);
  });

  it("takes its lanes from the ladder rather than restating them", () => {
    const ladder = ladderAt(100, 100);
    const lanes = lanesFrom(ladder);
    expect(lanes.map((l) => l.id)).toEqual(ladder.bands.map((b) => b.id));
    // Head first, and the whole axis covered with no gaps.
    expect(lanes[0]!.to).toBeCloseTo(ladderUnits(lanes), 10);
    expect(lanes[lanes.length - 1]!.from).toBeCloseTo(0, 10);
    for (let i = 0; i < lanes.length - 1; i += 1) {
      expect(lanes[i]!.from).toBeCloseTo(lanes[i + 1]!.to, 10);
    }
  });

  it("says nothing about a holding it could not build a ladder for", () => {
    const map = buildBandMap([
      { ticker: "AAA", ladder: ladderAt(100, 100), value: 100 },
      { ticker: "BBB", ladder: null, value: 100 },
    ]);
    expect(map.points.map((p) => p.ticker)).toEqual(["AAA"]);
    expect(map.missing).toEqual(["BBB"]);
  });
});

describe("across is the order by size, so nothing can pile up", () => {
  const rows = [
    { ticker: "BIG", ladder: ladderAt(100, 100), value: 600 },
    { ticker: "MID", ladder: ladderAt(60, 100), value: 300 },
    { ticker: "SML", ladder: ladderAt(30, 100), value: 100 },
  ];

  it("still works the real share out, for the label", () => {
    const map = buildBandMap(rows);
    const share = Object.fromEntries(
      map.points.map((p) => [p.ticker, p.share])
    );
    expect(share.BIG).toBeCloseTo(0.6, 10);
    expect(share.MID).toBeCloseTo(0.3, 10);
    expect(share.SML).toBeCloseTo(0.1, 10);
    expect(map.topShare).toBeCloseTo(0.6, 10);
  });

  it("puts the smallest on the left and the biggest on the right", () => {
    const map = buildBandMap(rows, { chipWidth: 0.1 });
    const x = Object.fromEntries(map.points.map((p) => [p.ticker, p.x]));
    expect(x.SML).toBeLessThan(x.MID!);
    expect(x.MID).toBeLessThan(x.BIG!);
  });

  it("separates a portfolio where every holding is the same size", () => {
    // Ten names at a tenth each. Any scale that is a function of the
    // value alone draws them on one spot, which is the case this axis
    // exists for.
    const same = Array.from({ length: 10 }, (_, i) => ({
      ticker: `T${i}`,
      ladder: ladderAt(100, 100),
      value: 100,
    }));
    const xs = buildBandMap(same, { chipWidth: 0.05 }).points
      .map((p) => p.x)
      .sort((a, b) => a - b);
    expect(new Set(xs).size).toBe(10);
    for (let i = 0; i < xs.length - 1; i += 1) {
      expect(xs[i + 1]! - xs[i]!).toBeGreaterThan(0.05);
    }
  });

  it("spaces the ranks evenly and holds them inside the picture", () => {
    expect(rankAcross([5, 1, 3])).toEqual([1, 0, 0.5]);
    expect(rankAcross([7])).toEqual([0.5]);
    expect(rankAcross([])).toEqual([]);
    const map = buildBandMap(rows, { chipWidth: 0.2 });
    for (const p of map.points) {
      expect(p.x).toBeGreaterThanOrEqual(0.1 - 1e-9);
      expect(p.x).toBeLessThanOrEqual(0.9 + 1e-9);
    }
  });

  it("does not divide by a portfolio worth nothing", () => {
    const map = buildBandMap([
      { ticker: "AAA", ladder: ladderAt(100, 100), value: 0 },
    ]);
    expect(map.points[0]!.share).toBe(0);
    expect(Number.isFinite(map.points[0]!.x)).toBe(true);
  });
});

describe("up is the real position in the band, and stays in the band", () => {
  it("gives a two-step band twice the height of a one-step one", () => {
    expect(LANE_WEIGHTS.hold).toBe(2);
    const lanes = lanesFrom(ladderAt(100, 100));
    expect(lanes.find((l) => l.id === "hold")!.weight).toBe(2);
    expect(lanes.find((l) => l.id === "starter")!.weight).toBe(1);
  });

  it("leaves a chip exactly where the price is when nothing is in the way", () => {
    const map = buildBandMap(
      [
        { ticker: "AAA", ladder: ladderAt(103, 100), value: 100 },
        { ticker: "BBB", ladder: ladderAt(97, 100), value: 50 },
      ],
      { chipWidth: 0.05, chipHeight: 0.05 }
    );
    for (const p of map.points) expect(p.y).toBeCloseTo(p.trueY, 10);
  });

  it("moves a chip off its true height only to stop it covering another", () => {
    // Same band, same height, adjacent in the order: something has to
    // give, and it is the height, never the order.
    const map = buildBandMap(
      [
        { ticker: "AAA", ladder: ladderAt(100, 100), value: 100 },
        { ticker: "BBB", ladder: ladderAt(100, 100), value: 100 },
      ],
      { chipWidth: 1, chipHeight: 0.4 }
    );
    const [a, b] = map.points;
    expect(Math.abs(a!.y - b!.y)).toBeGreaterThan(0);
    for (const p of map.points) expect(p.trueY).toBeCloseTo(a!.trueY, 10);
  });

  it("gives a crowded band the height it needs before placing anything", () => {
    // Eight names all in one band and all near each other across, so the
    // band has to grow: drawn at its ordinary height they would be
    // stacked through each other.
    const crowd = Array.from({ length: 8 }, (_, i) => ({
      ticker: `T${i}`,
      ladder: ladderAt(100 + i * 0.01, 100),
      value: 100,
    }));
    const map = buildBandMap(crowd, { chipWidth: 1, chipHeight: 0.5 });
    const hold = map.lanes.find((l) => l.id === "hold")!;
    expect(hold.weight).toBeGreaterThan(LANE_WEIGHTS.hold);
    expect(hold.weight).toBeGreaterThanOrEqual(8 * 0.5);
    // And with the room, nothing had to sit on anything else.
    const ys = [...map.points.map((p) => p.y)].sort((a, b) => a - b);
    for (let i = 0; i < ys.length - 1; i += 1) {
      expect(ys[i + 1]! - ys[i]!).toBeGreaterThanOrEqual(0.5 - 1e-9);
    }
  });

  it("counts how deep a band has to stack, and no deeper", () => {
    expect(stackDepth([0.1, 0.9], 0.2)).toBe(1);
    expect(stackDepth([0.1, 0.15, 0.2], 0.2)).toBe(3);
    expect(stackDepth([], 0.2)).toBe(0);
  });

  it("holds a chip inside the bounds it was given", () => {
    const ys = placeUp(
      [
        { x: 0.5, y: 0.5, min: 0.5, max: 0.5 },
        { x: 0.5, y: 0.5, min: 0.5, max: 0.5 },
      ],
      { across: 0.5, up: 0.5 }
    );
    // Nowhere to go, so the true position stands rather than the chip
    // being pushed out of the band it belongs to.
    expect(ys).toEqual([0.5, 0.5]);
  });

  it("separates two chips a hair either side of a level", () => {
    // Different bands, a few pixels apart: resolving band by band cannot
    // see this pair at all, which is the fault this test holds shut.
    const ladder = ladderAt(100, 100);
    const edge = ladder.bands.find((b) => b.id === "hold")!.to!;
    const map = buildBandMap(
      [
        { ticker: "OVER", ladder: ladderAt(edge + 0.01, 100), value: 100 },
        { ticker: "UNDER", ladder: ladderAt(edge - 0.01, 100), value: 101 },
      ],
      { chipWidth: 1, chipHeight: 0.6 }
    );
    const [a, b] = map.points;
    expect(a!.bandId).not.toBe(b!.bandId);
    // A chip's height, which is what they have to clear each other by,
    // and is in the same lane units the placing works in.
    expect(Math.abs(a!.y - b!.y)).toBeGreaterThanOrEqual(0.6 - 1e-9);
  });

  it("never moves a chip out of its own band", () => {
    const crowd = Array.from({ length: 9 }, (_, i) => ({
      ticker: `T${i}`,
      ladder: ladderAt(100, 100),
      value: 100 + i,
    }));
    const map = buildBandMap(crowd, { chipWidth: 1, chipHeight: 0.9 });
    // The map's own lanes, not a fresh set: a crowded band is drawn
    // taller than its ordinary height, and the bounds a chip was held
    // inside are the ones the picture actually uses.
    for (const p of map.points) {
      const lane = map.lanes.find((l) => l.id === p.bandId)!;
      expect(p.y).toBeGreaterThanOrEqual(lane.from - 1e-9);
      expect(p.y).toBeLessThanOrEqual(lane.to + 1e-9);
    }
  });

  it("keeps chips clear of each other when the band has the room", () => {
    const chips = [
      { x: 0.5, y: 0.5, min: 0, max: 1 },
      { x: 0.5, y: 0.5, min: 0, max: 1 },
      { x: 0.5, y: 0.5, min: 0, max: 1 },
    ];
    const ys = placeUp(chips, { across: 0.2, up: 0.2 });
    const sorted = [...ys].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i += 1) {
      expect(sorted[i + 1]! - sorted[i]!).toBeGreaterThanOrEqual(0.2 - 1e-9);
    }
  });

  it("leaves chips far apart across each other alone", () => {
    const ys = placeUp(
      [
        { x: 0, y: 0.5, min: 0, max: 1 },
        { x: 1, y: 0.5, min: 0, max: 1 },
      ],
      { across: 0.2, up: 0.2 }
    );
    expect(ys).toEqual([0.5, 0.5]);
  });
});

describe("the list on Home leads with what is furthest out", () => {
  it("puts the ends of the ladder before the middle, and drops the middle", () => {
    const map = buildBandMap([
      { ticker: "TOP", ladder: ladderAt(400, 100), value: 100 },
      { ticker: "MIDDLE", ladder: ladderAt(100, 100), value: 100 },
      { ticker: "BOTTOM", ladder: ladderAt(20, 100), value: 100 },
    ]);
    const out = actionableFirst(map.points).map((p) => p.ticker);
    expect(out).not.toContain("MIDDLE");
    expect(out).toContain("TOP");
    expect(out).toContain("BOTTOM");
  });

  it("breaks a tie on how much of the portfolio it is", () => {
    const map = buildBandMap([
      { ticker: "SMALL", ladder: ladderAt(400, 100), value: 100 },
      { ticker: "LARGE", ladder: ladderAt(400, 100), value: 900 },
    ]);
    expect(actionableFirst(map.points)[0]!.ticker).toBe("LARGE");
  });
});
