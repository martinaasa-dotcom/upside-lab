import { describe, expect, it } from "vitest";
import {
  BASE_STEP,
  MAX_STEP,
  MIN_STEP,
  bandAt,
  bandById,
  buildPlanLadder,
  exitRatio,
  ladderRead,
  stepFor,
} from "@/lib/company/plan-ladder";

/**
 * The ladder is arithmetic on two numbers a reader can already see, so
 * almost every test here is the arithmetic. The two that are not are the
 * ones that matter most: it stands down rather than centring itself on
 * today's price, and nothing it says is an instruction from this app.
 */

/** The reference ladder this was built from: an ordinary large company. */
const REFERENCE = {
  ticker: "GOOGL",
  anchor: 380.59,
  anchorKind: "estimate" as const,
  anchorSaid: "the blended estimate",
  spot: 390,
  // A swing of exactly half the anchor, which is the ordinary one, so the
  // step lands on the reference ladder's own tenth.
  high: 380.59 * 1.25,
  low: 380.59 * 0.75,
};

describe("the bands are the reference ladder's own arithmetic", () => {
  const ladder = buildPlanLadder(REFERENCE)!;

  it("reads a tenth of the anchor off an ordinary swing", () => {
    expect(ladder.step).toBeCloseTo(BASE_STEP, 6);
  });

  it("puts each edge where the reference ladder puts it", () => {
    const at = (id: Parameters<typeof bandById>[1]) => bandById(ladder, id)!;
    // Trim 60%+ is everything at or above 1.2x, so its floor is that edge.
    expect(at("trim-most").from).toBeCloseTo(380.59 * 1.2, 4);
    expect(at("trim-most").to).toBeNull();
    expect(at("trim-some").to).toBeCloseTo(380.59 * 1.2, 4);
    expect(at("trim-some").from).toBeCloseTo(380.59 * 1.1, 4);
    expect(at("hold").to).toBeCloseTo(380.59 * 1.1, 4);
    expect(at("hold").from).toBeCloseTo(380.59 * 0.9, 4);
    expect(at("starter").from).toBeCloseTo(380.59 * 0.8, 4);
    expect(at("full").from).toBeCloseTo(380.59 * 0.7, 4);
    expect(at("exit").from).toBeNull();
  });

  it("leaves no gap and no overlap between one band and the next", () => {
    for (let i = 0; i < ladder.bands.length - 1; i += 1) {
      expect(ladder.bands[i]!.from).toBe(ladder.bands[i + 1]!.to);
    }
  });

  it("puts the floor about half the anchor down, as the references do", () => {
    const exit = bandById(ladder, "exit")!.to!;
    expect(exit / ladder.anchor).toBeCloseTo(0.5, 2);
  });

  it("files today's price under one band and only one", () => {
    expect(ladder.atId).toBe("hold");
    const hits = ladder.bands.filter(
      (b) =>
        (b.from === null || 390 > b.from) && (b.to === null || 390 <= b.to)
    );
    expect(hits).toHaveLength(1);
  });
});

describe("the width comes from how far the company actually travels", () => {
  it("widens for a name that swings twice as far", () => {
    const wide = stepFor({ anchor: 100, low: 50, high: 150 });
    expect(wide.step).toBeCloseTo(0.2, 6);
    expect(wide.said).toMatch(/\$50\.00 to \$150\.00/);
  });

  it("holds the narrowest and widest this app will draw", () => {
    expect(stepFor({ anchor: 100, low: 99, high: 101 }).step).toBe(MIN_STEP);
    expect(stepFor({ anchor: 100, low: 10, high: 400 }).step).toBe(MAX_STEP);
  });

  it("stands down to the reference width when the year is not known", () => {
    const none = stepFor({ anchor: 100 });
    expect(none.step).toBe(BASE_STEP);
    expect(none.said).toMatch(/carried no high and low/i);
  });

  it("puts the floor further down for a name that swings harder", () => {
    expect(exitRatio(MAX_STEP)).toBeLessThan(exitRatio(BASE_STEP));
    expect(exitRatio(MIN_STEP)).toBeGreaterThan(exitRatio(BASE_STEP));
  });
});

describe("a ladder with nothing to hang on is absent, never centred on today", () => {
  it("returns nothing when there is no anchor", () => {
    expect(
      buildPlanLadder({ ...REFERENCE, anchor: null, override: null })
    ).toBeNull();
  });

  it("still draws the levels when there is no price today", () => {
    const ladder = buildPlanLadder({ ...REFERENCE, spot: null })!;
    expect(ladder.atId).toBeNull();
    expect(ladder.bands).toHaveLength(7);
    expect(ladderRead(ladder)).toMatch(/no price/i);
  });
});

describe("every number on it is the reader's to change", () => {
  it("moves one edge and keeps the ladder a ladder", () => {
    const ladder = buildPlanLadder({
      ...REFERENCE,
      override: { edges: { "trim-some": 1.35 } },
    })!;
    expect(bandById(ladder, "trim-some")!.to).toBeCloseTo(380.59 * 1.35, 4);
    expect(bandById(ladder, "trim-most")!.from).toBeCloseTo(380.59 * 1.35, 4);
    expect(ladder.edited).toBe(true);
    const tops = ladder.bands.map((b) => b.to).filter((t): t is number => t !== null);
    expect([...tops].sort((a, b) => b - a)).toEqual(tops);
  });

  it("keeps the bands in order when an edit crosses the one above it", () => {
    const ladder = buildPlanLadder({
      ...REFERENCE,
      // Well above the trim edge over it, which the ladder must absorb
      // rather than draw a band whose floor is over its own ceiling.
      override: { edges: { hold: 1.9 } },
    })!;
    for (const b of ladder.bands) {
      if (b.from !== null && b.to !== null) expect(b.to).toBeGreaterThan(b.from);
    }
  });

  it("moves the whole ladder when the reader types their own anchor", () => {
    const ladder = buildPlanLadder({ ...REFERENCE, override: { anchor: 500 } })!;
    expect(ladder.anchor).toBe(500);
    expect(ladder.anchorKind).toBe("your-own");
    // The bands are multiples of whatever the anchor is, and the width is
    // this company's own swing measured against that same anchor, so a
    // typed anchor moves both at once.
    expect(bandById(ladder, "hold")!.to).toBeCloseTo(500 * (1 + ladder.step), 4);
    expect(bandById(ladder, "hold")!.from).toBeCloseTo(500 * (1 - ladder.step), 4);
  });

  it("ignores an edit that is not a price", () => {
    const ladder = buildPlanLadder({
      ...REFERENCE,
      override: { anchor: 0, edges: { hold: -3 } },
    })!;
    expect(ladder.anchor).toBeCloseTo(380.59, 4);
    expect(bandById(ladder, "hold")!.to).toBeCloseTo(380.59 * 1.1, 4);
    expect(ladder.edited).toBe(false);
  });
});

describe("nothing it says is this app telling anybody what to do", () => {
  const ladder = buildPlanLadder(REFERENCE)!;

  it("names the band and the distance, and claims nothing else", () => {
    const read = ladderRead(ladder);
    expect(read).toMatch(/\$390\.00 today/);
    expect(read).toMatch(/your plan/i);
    expect(read).not.toMatch(
      /\b(you should|we (think|like|recommend)|advise|cheap|expensive|undervalued|overvalued|bargain)\b/i
    );
  });

  it("never says a level was reached when it was not", () => {
    expect(bandAt(ladder.bands, 380.59 * 1.2)).toBe("trim-some");
    expect(bandAt(ladder.bands, 380.59 * 1.2 + 0.01)).toBe("trim-most");
  });
});
