import { describe, expect, it } from "vitest";
import {
  TINY_SHARE,
  actionableFirst,
  barShares,
  buildBandMap,
  foldToFit,
  readySaid,
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
  it("draws every band whatever the portfolio holds", () => {
    const one = buildBandMap([holding("ONLY", 1, 100)]);
    const many = buildBandMap([
      holding("A", 1, 30),
      holding("B", 1.3, 20),
      holding("C", 0.75, 20),
      holding("D", 0.4, 30),
    ]);
    // Six since the three bands about adding became two.
    expect(one.bands).toHaveLength(6);
    expect(many.bands).toHaveLength(6);
    expect(one.bands.map((b) => b.id)).toEqual(many.bands.map((b) => b.id));
  });

  it("keeps an empty band rather than dropping it", () => {
    const map = buildBandMap([holding("ONLY", 1, 100)]);
    const empty = map.bands.filter((b) => b.items.length === 0);
    expect(empty.length).toBe(5);
    for (const b of empty) {
      expect(b.share).toBe(0);
      expect(b.label).toBeTruthy();
    }
  });
});

describe("a name folds away because the bar ran out of room", () => {
  const band = (n: number) =>
    buildBandMap(
      Array.from({ length: n }, (_, i) => holding(`N${i}`, 1, 100 - i))
    ).bands.find((b) => b.id === "hold")!.items;

  it("draws every name while the bar has room for them", () => {
    const { shown, folded } = foldToFit(band(4), 6);
    expect(shown).toHaveLength(4);
    expect(folded).toEqual([]);
  });

  it("DRAWS A SMALL NAME WHEN THE BAND HAS THE ROOM FOR IT", () => {
    /*
      The fault this replaced: a cutoff on size alone folded two names
      worth 1.5% and 0.2% away and drew "+2 small" over a bar with room
      for six, so a reader could not see what was in their own band.
    */
    const map = buildBandMap([
      holding("HUGE", 1.3, 400_000),
      holding("SMALL", 0.85, 9_000),
      holding("TINY", 0.85, 1_400),
    ]);
    const starter = map.bands.find((b) => b.id === "starter")!;
    for (const p of starter.items) expect(p.share).toBeLessThan(TINY_SHARE);
    const { shown, folded } = foldToFit(starter.items, 6);
    expect(shown.map((p) => p.ticker)).toEqual(["SMALL", "TINY"]);
    expect(folded).toEqual([]);
  });

  it("keeps a slot for the block that stands for the folded ones", () => {
    const { shown, folded } = foldToFit(band(10), 4);
    // Three names drawn and a "+7", which is the four slots the bar has.
    expect(shown).toHaveLength(3);
    expect(folded).toHaveLength(7);
  });

  it("folds the smallest, since the biggest is what a reader looks for", () => {
    const { shown, folded } = foldToFit(band(10), 4);
    for (const kept of shown) {
      for (const gone of folded) {
        expect(kept.share).toBeGreaterThanOrEqual(gone.share);
      }
    }
  });

  it("draws what it keeps in the band's own biggest first order", () => {
    const { shown } = foldToFit(band(10), 4);
    const shares = shown.map((p) => p.share);
    expect([...shares].sort((a, b) => b - a)).toEqual(shares);
  });

  it("KEEPS A TINY NAME THAT HAS REACHED AN END OF ITS OWN PLAN", () => {
    /*
      The whole reason to open this picture is to find the name that
      reached a level, and folding by size alone throws exactly that one
      away first when it is small.
    */
    const rows = [
      ...Array.from({ length: 9 }, (_, i) => holding(`BIG${i}`, 1, 100)),
      holding("FALLEN", 0.3, 1),
    ];
    const map = buildBandMap(rows);
    const fallen = map.points.find((p) => p.ticker === "FALLEN")!;
    expect(fallen.actionable).toBe(true);
    expect(fallen.share).toBeLessThan(TINY_SHARE);

    const quiet = map.bands.find((b) => b.id === "hold")!;
    const itsBand = map.bands.find((b) => b.id === fallen.bandId)!;
    // Its own band draws it even squeezed down to two slots.
    expect(
      foldToFit(itsBand.items, 2).shown.map((p) => p.ticker)
    ).toContain("FALLEN");
    // And the crowded band it is not in still folds by size.
    expect(foldToFit(quiet.items, 3).folded.length).toBeGreaterThan(0);
  });

  it("counts every name in its band's own share, drawn or folded", () => {
    const map = buildBandMap([
      holding("A", 1, 90),
      holding("B", 1, 6),
      holding("C", 1, 4),
    ]);
    const hold = map.bands.find((b) => b.id === "hold")!;
    const { folded } = foldToFit(hold.items, 2);
    expect(folded.length).toBeGreaterThan(0);
    expect(hold.share).toBeCloseTo(1, 10);
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

describe("a band's blocks divide its own bar, and fill it", () => {
  const sums = (r: { grows: number[]; rest: number }) =>
    r.grows.reduce((s, v) => s + v, 0) + r.rest;

  it("GROWS BY THE SHARE OF THE BAND, NEVER OF THE PORTFOLIO", () => {
    /*
      The fault this replaced is invisible in the markup: flex gives out
      only the SUM of the grow factors when that sum is under one, and a
      band's portfolio shares always are. A band holding 55% of the money
      filled 55% of its own bar and left the rest empty, so the length a
      reader saw went as the square of the share.
    */
    const r = barShares({ bandShare: 0.55, shown: [0.25, 0.21, 0.09], folded: [] });
    expect(sums(r)).toBeCloseTo(1, 10);
    // And in proportion to each other inside the band.
    expect(r.grows[0]! / r.grows[1]!).toBeCloseTo(0.25 / 0.21, 10);
  });

  it("fills the bar whatever the band is worth", () => {
    for (const bandShare of [0.01, 0.06, 0.5, 1]) {
      const r = barShares({
        bandShare,
        shown: [bandShare * 0.7, bandShare * 0.3],
        folded: [],
      });
      expect(sums(r)).toBeCloseTo(1, 10);
    }
  });

  it("gives the folded block the room its own names came to", () => {
    const r = barShares({
      bandShare: 0.4,
      shown: [0.3],
      folded: [0.07, 0.03],
    });
    expect(r.rest).toBeCloseTo(0.25, 10);
    expect(sums(r)).toBeCloseTo(1, 10);
  });

  it("shares a bar out evenly rather than leaving it empty", () => {
    // A portfolio worth nothing: every share is zero and the bar still
    // has to be filled by the names that are in it.
    const r = barShares({ bandShare: 0, shown: [0, 0], folded: [] });
    expect(sums(r)).toBeCloseTo(1, 10);
    expect(r.grows).toEqual([0.5, 0.5]);
  });

  it("never asks for more than a whole bar", () => {
    const r = barShares({ bandShare: 0.1, shown: [0.02], folded: [0.5] });
    expect(r.rest).toBeLessThanOrEqual(1);
    expect(sums(r)).toBeCloseTo(1, 10);
  });
});

describe("the picture never claims a level was the reader's when it was not", () => {
  /*
    The bands are labelled in the plan's own imperative voice: "trim
    most of it", "add a lot". What keeps six imperatives beside somebody
    real holdings honest is that the plan is theirs, so the one sentence
    this panel must never get wrong is whose level was reached. A
    default this app worked out is not a level anybody set, and saying
    it was is both false and the sentence that turns a computed default
    into this app's instruction.
  */
  const reached = (edited: boolean) => {
    const map = buildBandMap([
      { ...holding("TOP", 1.4, 50), ladder: editedTo(ladderAt(140, 100), edited) },
      holding("QUIET", 1, 50),
    ]);
    return map.summary;
  };

  function editedTo(ladder: PlanLadder, edited: boolean): PlanLadder {
    return { ...ladder, edited };
  }

  it("says the app worked it out when the reader has changed nothing", () => {
    const said = readySaid(reached(false));
    expect(said).toContain("Levels this app worked out, which you have not changed.");
    expect(said).not.toContain("you set");
  });

  it("says the reader set it only when they actually did", () => {
    expect(readySaid(reached(true))).toContain("Levels you set.");
  });

  it("stands on neither claim when the names disagree", () => {
    const map = buildBandMap([
      { ...holding("A", 1.4, 40), ladder: editedTo(ladderAt(140, 100), true) },
      { ...holding("B", 0.3, 40), ladder: editedTo(ladderAt(30, 100), false) },
      holding("QUIET", 1, 20),
    ]);
    const said = readySaid(map.summary);
    expect(said).toContain("Some of those levels are yours");
    expect(said).not.toContain("Levels you set.");
  });

  it("says nothing about levels when no name has reached one", () => {
    const map = buildBandMap([holding("QUIET", 1, 100)]);
    expect(readySaid(map.summary)).toBe(
      "every name is somewhere in the middle of its own plan"
    );
  });

  it("NEVER TELLS ANYBODY WHAT TO DO, whoever set the level", () => {
    /*
      The band's own name may be imperative, because it is the reader's
      plan completing the sentence "at this price, my plan says ...".
      This app's own sentence about it may not be.
    */
    const BANNED = [
      "you should",
      "we recommend",
      "recommended",
      "buy now",
      "sell now",
      "time to",
      "consider selling",
      "consider buying",
      "worth buying",
      "worth selling",
      "undervalued",
      "overvalued",
      "cheap",
      "expensive",
    ];
    for (const edited of [true, false]) {
      const said = readySaid(reached(edited)).toLowerCase();
      for (const word of BANNED) expect(said).not.toContain(word);
    }
  });
});
