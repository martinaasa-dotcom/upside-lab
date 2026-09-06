import { describe, expect, it } from "vitest";
import {
  BASE_STEP,
  MIN_STEP_FAR_BELOW,
  ladderFloor,
  isFarBelow,
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
  it("widens for a name that swings twice as far, but only by two fifths", () => {
    const wide = stepFor({ anchor: 100, low: 50, high: 150 });
    // Twice the ordinary swing, so the step is BASE + 40% of BASE, which
    // is the ceiling. A name swinging twice as far does not get bands
    // twice as wide: the references put a flat tenth on two companies
    // whose volatility is nothing like each other's.
    expect(wide.step).toBeCloseTo(MAX_STEP, 6);
    expect(wide.said).toMatch(/\$50\.00 to \$150\.00/);
  });

  it("holds the narrowest and widest this app will draw", () => {
    expect(stepFor({ anchor: 100, low: 99, high: 101 }).step).toBe(MIN_STEP);
    expect(stepFor({ anchor: 100, low: 10, high: 400 }).step).toBe(MAX_STEP);
  });

  it("keeps every step within a couple of points of the reference tenth", () => {
    // The bounds are the design, not an accident: a ladder half again as
    // wide as the references' is not the same ladder.
    for (const [low, high] of [
      [1, 999],
      [99, 101],
      [40, 60],
      [10, 500],
    ] as const) {
      const { step } = stepFor({ anchor: 100, low, high });
      expect(Math.abs(step - BASE_STEP)).toBeLessThanOrEqual(0.05);
    }
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


/**
 * THE FOUR REFERENCE LADDERS, WHICH ARE WHERE THIS MODEL CAME FROM.
 *
 * Two of them (an ordinary large company near its estimate) fix the
 * shape and the tenth-of-the-anchor step; the other two, whose price sits
 * far under the anchor, are why `FAR_BELOW_STEP_FACTOR` and `ladderFloor`
 * exist at all. If a change to this file stops reproducing them, it is a
 * different model and it needs a different argument behind it.
 *
 * The low fed in is each reference's own exit level, which is the whole
 * claim being tested: those four floors are prices the share has traded
 * at, not a fraction of anything. The high is a plausible year, since the
 * tables do not carry one.
 */
describe("the four reference ladders come back out", () => {
  const REFERENCES = [
    {
      name: "an ordinary large company at its estimate",
      anchor: 380.59,
      spot: 390,
      low: 176.94,
      high: 410,
      edges: [456.71, 418.65, 342.53, 304.47, 266.41, 176.94],
      farBelow: false,
    },
    {
      name: "one a little under its estimate",
      anchor: 290.18,
      spot: 215,
      low: 147.66,
      high: 320,
      edges: [348.22, 319.2, 261.16, 232.14, 203.13, 147.66],
      farBelow: false,
    },
    {
      name: "one a long way under it",
      anchor: 1447.875,
      spot: 620,
      low: 434,
      high: 1300,
      edges: [1541.95, 1494.91, 1400.84, 1353.8, 1306.76, 434],
      farBelow: true,
    },
    {
      name: "another a long way under it",
      anchor: 109.585,
      spot: 62,
      low: 58.87,
      high: 100,
      edges: [117.67, 113.63, 105.54, 101.49, 97.44, 58.87],
      farBelow: true,
    },
  ] as const;

  for (const r of REFERENCES) {
    it(`lands on the published levels for ${r.name}`, () => {
      const ladder = buildPlanLadder({
        ticker: "TEST",
        anchor: r.anchor,
        anchorKind: "estimate",
        anchorSaid: "the estimate",
        spot: r.spot,
        high: r.high,
        low: r.low,
      })!;
      expect(ladder.farBelow).toBe(r.farBelow);
      // The floor is the reference's own, exactly, because it is a price
      // rather than a ratio.
      expect(bandById(ladder, "exit")!.to).toBeCloseTo(r.low, 6);
      const mine = ladder.bands.slice(1).map((b) => b.to!);
      mine.forEach((price, i) => {
        const published = r.edges[i]!;
        const off = Math.abs(price - published) / published;
        expect(off, `edge ${i}: ${price.toFixed(2)} against ${published}`).toBeLessThan(0.05);
      });
    });
  }

  it("tightens the bands only where the price is below the ladder", () => {
    expect(isFarBelow({ anchor: 100, spot: 69, ordinaryStep: 0.1 })).toBe(true);
    expect(isFarBelow({ anchor: 100, spot: 71, ordinaryStep: 0.1 })).toBe(false);
    // No price is not a reason to redraw the ladder.
    expect(isFarBelow({ anchor: 100, spot: null, ordinaryStep: 0.1 })).toBe(false);
  });

  it("never tightens below the floor set for that regime", () => {
    const ladder = buildPlanLadder({
      ticker: "TEST",
      anchor: 100,
      anchorKind: "estimate",
      anchorSaid: "x",
      spot: 20,
      high: 101,
      low: 99,
    })!;
    expect(ladder.step).toBeGreaterThanOrEqual(MIN_STEP_FAR_BELOW);
    expect(ladder.stepSaid).toMatch(/long way under the anchor/i);
  });
});

describe("the floor is a price the share has traded at, or it says it is not", () => {
  it("takes the year's low when it is clear of the band above it", () => {
    const floor = ladderFloor({ anchor: 100, step: 0.1, low: 40 });
    expect(floor).toEqual({ price: 40, fromYear: true });
  });

  it("stands down to the ratio when the low is not clear of that band", () => {
    // The accumulation band starts at 70 here, so a low of 68 would put
    // two levels a reader cannot tell apart at the bottom of the ladder.
    const floor = ladderFloor({ anchor: 100, step: 0.1, low: 68 });
    expect(floor.fromYear).toBe(false);
    expect(floor.price).toBeCloseTo(50, 6);
  });

  it("stands down to the ratio when there is no year on file", () => {
    expect(ladderFloor({ anchor: 100, step: 0.1 }).fromYear).toBe(false);
    expect(ladderFloor({ anchor: 100, step: 0.1, low: 0 }).fromYear).toBe(false);
  });

  it("names the window it read the low over, never a year it did not", () => {
    const months = buildPlanLadder({
      ticker: "TEST",
      anchor: 100,
      anchorKind: "target",
      anchorSaid: "x",
      spot: 95,
      high: 120,
      low: 30,
      windowSaid: "the last few months",
    })!;
    expect(months.floorSaid).toMatch(/over the last few months/i);
    expect(months.floorSaid).not.toMatch(/\bin a year\b/i);
  });

  it("says which of the two it did", () => {
    const fromYear = buildPlanLadder({
      ticker: "TEST",
      anchor: 100,
      anchorKind: "estimate",
      anchorSaid: "x",
      spot: 95,
      high: 120,
      low: 30,
    })!;
    expect(fromYear.floorFromYear).toBe(true);
    expect(fromYear.floorSaid).toMatch(/lowest it has actually traded over the last year/i);
    const fromRatio = buildPlanLadder({
      ticker: "TEST",
      anchor: 100,
      anchorKind: "estimate",
      anchorSaid: "x",
      spot: 95,
      high: 120,
      low: null,
    })!;
    expect(fromRatio.floorFromYear).toBe(false);
    expect(fromRatio.floorSaid).toMatch(/no low over the last year/i);
  });
});
