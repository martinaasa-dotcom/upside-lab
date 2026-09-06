import { describe, expect, it } from "vitest";
import {
  actionableFirst,
  buildBandMap,
  ladderHeight,
  lanesFrom,
  packLane,
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
    const bottom = ladderAt(1, 100);
    const top = ladderAt(400, 100);
    expect(ladderHeight(bottom)!).toBeLessThan(0.15);
    expect(ladderHeight(top)!).toBeGreaterThan(0.85);
  });

  it("puts a price a hair either side of a level a hair apart", () => {
    const ladder = ladderAt(100, 100);
    const edge = ladder.bands.find((b) => b.id === "hold")!.to!;
    const below = ladderHeight(ladderAt(edge - 0.01, 100))!;
    const above = ladderHeight(ladderAt(edge + 0.01, 100))!;
    expect(above).toBeGreaterThan(below);
    expect(above - below).toBeLessThan(0.05);
  });

  it("takes its lanes from the ladder rather than restating them", () => {
    const ladder = ladderAt(100, 100);
    const lanes = lanesFrom(ladder);
    expect(lanes.map((l) => l.id)).toEqual(ladder.bands.map((b) => b.id));
    // Head first, and the whole axis covered with no gaps.
    expect(lanes[0]!.to).toBeCloseTo(1, 10);
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

describe("across is the share of the portfolio", () => {
  const rows = [
    { ticker: "BIG", ladder: ladderAt(100, 100), value: 600 },
    { ticker: "MID", ladder: ladderAt(60, 100), value: 300 },
    { ticker: "SML", ladder: ladderAt(30, 100), value: 100 },
  ];

  it("works the share out against the whole map", () => {
    const map = buildBandMap(rows);
    const share = Object.fromEntries(
      map.points.map((p) => [p.ticker, p.share])
    );
    expect(share.BIG).toBeCloseTo(0.6, 10);
    expect(share.MID).toBeCloseTo(0.3, 10);
    expect(share.SML).toBeCloseTo(0.1, 10);
  });

  it("ends the axis at the largest holding, not at everything", () => {
    const map = buildBandMap(rows, { chipWidth: 0.1 });
    expect(map.topShare).toBeCloseTo(0.6, 10);
    /*
      The biggest name reaches the right-hand end, less half a chip: a
      chip is centred on its own position, so one drawn at the very end
      would hang half outside the picture. Nothing else is squashed into
      the first tenth, which is what the axis ending at the largest
      holding is for.
    */
    expect(map.points.find((p) => p.ticker === "BIG")!.x).toBeCloseTo(0.95, 6);
    // The share itself is untouched by any of that drawing.
    expect(map.points.find((p) => p.ticker === "BIG")!.share).toBeCloseTo(0.6, 10);
  });

  it("does not divide by a portfolio worth nothing", () => {
    const map = buildBandMap([
      { ticker: "AAA", ladder: ladderAt(100, 100), value: 0 },
    ]);
    expect(map.points[0]!.share).toBe(0);
    expect(Number.isFinite(map.points[0]!.x)).toBe(true);
  });
});

describe("a crowded lane stacks, and never moves a chip along the axis", () => {
  it("puts a chip in the first row with room for it", () => {
    // Three chips on top of each other need three rows; a fourth well
    // clear of them goes back on the first.
    const at = (x: number, y: number) => ({ x, y });
    expect(
      packLane([at(0.5, 0.3), at(0.5, 0.2), at(0.5, 0.1), at(1, 0.3)], 0.2)
    ).toEqual([0, 1, 2, 0]);
  });

  it("leaves chips that were never in each other's way on one row", () => {
    const at = (x: number) => ({ x, y: 0.5 });
    expect(packLane([at(0), at(0.5), at(1)], 0.2)).toEqual([0, 0, 0]);
  });

  it("draws the highest in the band on the highest row", () => {
    // All on top of each other across, so every one needs its own row,
    // and the order of those rows is the order up the band.
    const chips = [
      { x: 0.5, y: 0.1 },
      { x: 0.5, y: 0.9 },
      { x: 0.5, y: 0.5 },
    ];
    expect(packLane(chips, 0.3)).toEqual([2, 0, 1]);
  });

  it("keeps every chip on its own exact share", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      ticker: `T${i}`,
      ladder: ladderAt(100, 100),
      value: 100,
    }));
    const map = buildBandMap(rows, { chipWidth: 0.3 });
    // One band, one height, one share: the only thing that moved is
    // which row of the lane each chip sits on.
    expect(new Set(map.points.map((p) => p.bandId)).size).toBe(1);
    expect(new Set(map.points.map((p) => p.y)).size).toBe(1);
    for (const p of map.points) expect(p.x).toBeCloseTo(0.85, 10);
    expect(new Set(map.points.map((p) => p.row)).size).toBe(6);
    expect(map.laneRows[map.points[0]!.bandId]).toBe(6);
  });

  it("needs fewer rows where the chips are narrower", () => {
    const rows = [0.2, 0.3, 0.45, 0.62, 0.8, 1].map((v, i) => ({
      ticker: `T${i}`,
      ladder: ladderAt(100, 100),
      value: v * 100,
    }));
    const wide = buildBandMap(rows, { chipWidth: 0.3 });
    const narrow = buildBandMap(rows, { chipWidth: 0.08 });
    const rowsUsed = (m: ReturnType<typeof buildBandMap>) =>
      Math.max(...Object.values(m.laneRows));
    expect(rowsUsed(narrow)).toBeLessThan(rowsUsed(wide));
  });

  it("never lets two chips in one row come within a chip of each other", () => {
    const shares = [0.9, 0.92, 0.5, 0.51, 0.2, 1, 0.3, 0.31];
    const map = buildBandMap(
      shares.map((v, i) => ({
        ticker: `T${i}`,
        ladder: ladderAt(100, 100),
        value: v * 1000,
      })),
      { chipWidth: 0.15 }
    );
    const byRow = new Map<number, number[]>();
    for (const p of map.points) {
      byRow.set(p.row, [...(byRow.get(p.row) ?? []), p.x]);
    }
    for (const xs of byRow.values()) {
      const sorted = [...xs].sort((a, b) => a - b);
      for (let i = 0; i < sorted.length - 1; i += 1) {
        expect(sorted[i + 1]! - sorted[i]!).toBeGreaterThanOrEqual(0.15 - 1e-9);
      }
    }
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
