/**
 * Every holding on one ladder, so a portfolio can be read as a picture
 * rather than as a list of prices.
 *
 * The problem it solves is that each name's plan is in its own money: one
 * company's "consider a trim" is $456 and another's is $1.80, so the
 * prices cannot share an axis. What they can share is the ladder itself.
 * Every band is a multiple of that name's own anchor, so **the band is the
 * common unit**, and a holding's height here is which band it is in plus
 * how far through that band it has got. Two names drawn level are in the
 * same place in their own plans, whatever their prices are.
 *
 * The reading is the one a person expects from a chart: low is a price
 * far under what the estimates say, high is a price far over it. Across,
 * it is how much of the portfolio that holding is, so the corners mean
 * something. **Bottom left** is a small holding whose price is at the
 * bottom of its own plan. **Top right** is a big holding whose price is
 * at the top of one, which is the position a reader would look at first
 * if they were going to trim anything.
 *
 * Nothing here says to do either of those things, and nothing here is a
 * score. Both axes are figures already on other screens, drawn against
 * each other: the plan the reader owns, and the share of their own money.
 */
import {
  bandById,
  isActionableBand,
  positionInBand,
  type LadderBandId,
  type PlanLadder,
} from "@/lib/company/plan-ladder";

export type BandLane = {
  id: LadderBandId;
  label: string;
  /**
   * Where this lane starts and ends, in LANE UNITS: one unit is an
   * ordinary one-step band, and the foot of the ladder is zero. Not a
   * fraction of the whole, because the whole changes when a crowded band
   * is given the height it needs, and a coordinate that moves when
   * another band grows is a coordinate nothing can be placed against.
   */
  from: number;
  to: number;
  actionable: boolean;
  /**
   * How tall this lane is, in those units, which is at least what its
   * band is worth and more when it is crowded.
   *
   * The bands are not the same width: "hold" is two steps and every band
   * either side is one, and the accumulation band at the foot can be ten.
   * Drawn as equal lanes, the two-step band is where most holdings sit
   * and they pile into a strip no taller than the bands with one name in
   * them. Height in proportion to width is both truer and the thing that
   * unpicks the pile, because a taller lane gives the real position
   * inside the band room to separate the names by itself.
   *
   * The open bands at the ends are given a fixed weight rather than their
   * real width, which is infinite at the top and can be most of the
   * ladder at the foot.
   */
  weight: number;
};

export type BandMapPoint = {
  ticker: string;
  bandId: LadderBandId;
  bandLabel: string;
  /** Height on the ladder in lane units, zero at the very bottom. */
  y: number;
  /** This holding's share of the portfolio, as a fraction. */
  share: number;
  /**
   * Where it is drawn across, 0 at the left edge and 1 at the right.
   * The holding's place in the order by size, so the smallest is always
   * on the left and the biggest always on the right, whatever the sizes
   * happen to be. Nothing moves a chip along this axis.
   */
  x: number;
  /**
   * Where the price really is on the ladder, in lane units, before
   * anything moved to keep two chips from covering each other. Always
   * inside the same band as `y`.
   */
  trueY: number;
  value: number;
  spot: number;
  anchor: number;
  /**
   * What this reader is up or down on the holding, as a fraction.
   *
   * Carried so the picture can spend the app's gain and loss pair on the
   * one thing those two colours mean everywhere else in it: money made
   * and money lost. That is a different question from where the price
   * sits on its plan, which is the height, so the two never compete: a
   * name can be up a lot and at the bottom of its plan.
   */
  roiPct: number | null;
  /** The nearest level of that name's own plan, for the label. */
  edge: number | null;
  actionable: boolean;
  /** The reader typed at least one level of this name's plan. */
  edited: boolean;
};

export type BandMap = {
  lanes: BandLane[];
  points: BandMapPoint[];
  /** The largest share on the map, which the across axis is labelled with. */
  topShare: number;
  /** The whole ladder's height, in lane units. */
  units: number;
  /** Holdings left off, because no ladder could be built for them. */
  missing: string[];
};

/**
 * The lanes, head first, which is the order they are drawn in.
 *
 * Taken from a real ladder rather than restated here, so the map cannot
 * end up naming a band the ladder does not have, or ordering them
 * differently from the table on the company's own page.
 */
/** What each band is worth in lane height, against an ordinary one. */
export const LANE_WEIGHTS: Record<LadderBandId, number> = {
  "trim-most": 1,
  "trim-some": 1,
  // Two steps wide, so twice as tall, and the one that needs the room.
  hold: 2,
  starter: 1,
  full: 1,
  // Wide in price and open at the foot in the tightened regime, so a
  // fixed weight rather than its real width, which would swallow the
  // picture.
  "full-aggressive": 1.5,
  exit: 1,
};

export function lanesFrom(
  ladder: PlanLadder,
  /** Extra height per band, in lane units, where one is crowded. */
  crowding: Partial<Record<LadderBandId, number>> = {}
): BandLane[] {
  let from = 0;
  // Foot of the ladder first, so the units run the way the picture does.
  const feetFirst = [...ladder.bands].reverse().map((b) => {
    const weight = Math.max(LANE_WEIGHTS[b.id] ?? 1, crowding[b.id] ?? 0);
    const lane: BandLane = {
      id: b.id,
      label: b.label,
      from,
      to: from + weight,
      actionable: isActionableBand(b.id),
      weight,
    };
    from += weight;
    return lane;
  });
  return feetFirst.reverse();
}

/** The whole ladder's height, in lane units. */
export function ladderUnits(lanes: BandLane[]): number {
  return lanes.reduce((sum, l) => sum + l.weight, 0);
}

/**
 * How high one holding sits: which band, plus how far through it.
 *
 * The band contributes the whole lane and the position inside it the
 * rest, so a name a hair below the top of "hold" and one a hair above the
 * bottom of the band over it are drawn a hair apart, rather than a whole
 * lane apart. That is the property that makes this readable as a scale
 * rather than as seven buckets.
 */
export function ladderHeight(
  ladder: PlanLadder,
  lanes: BandLane[] = lanesFrom(ladder)
): number | null {
  if (ladder.spot === null || ladder.atId === null) return null;
  const lane = lanes.find((l) => l.id === ladder.atId);
  const band = bandById(ladder, ladder.atId);
  if (!lane || !band) return null;
  const within = positionInBand(band, ladder.spot);
  return lane.from + within * (lane.to - lane.from);
}

/**
 * ACROSS IS THE ORDER OF THE HOLDINGS BY SIZE, NOT THE SIZE ITSELF.
 *
 * The first version put a chip at its share of the portfolio against the
 * largest holding, which is the obvious axis and fails on the commonest
 * portfolio there is: ten names at a tenth each land on one spot, and a
 * picture whose whole job is to separate them draws a pile. Any scale
 * that is a function of the value alone does that, because the values
 * really are the same.
 *
 * So the axis is ordinal, and it is labelled as one: smallest on the
 * left, biggest on the right, evenly spaced, which separates every
 * portfolio including that one. **The size itself is not lost** and is
 * not left to be inferred from a position: each chip prints its own
 * share next to its name, which is both exact and easier to read than
 * any spacing.
 */
export function rankAcross(shares: number[]): number[] {
  const n = shares.length;
  if (n === 0) return [];
  if (n === 1) return [0.5];
  const order = shares
    .map((share, i) => ({ share, i }))
    // Ties keep the order they arrived in, which is the value order the
    // caller built, so the axis is stable between renders.
    .sort((a, b) => a.share - b.share || a.i - b.i);
  const out = new Array<number>(n).fill(0);
  order.forEach((p, rank) => {
    out[p.i] = rank / (n - 1);
  });
  return out;
}

/**
 * Up is where the price really is inside its own band, and a chip is
 * moved off that only far enough to stop it covering another one.
 *
 * The lanes are drawn as tall as their band is wide, so the real
 * positions do most of the separating by themselves: seven names in the
 * two-step "hold" band are at seven different heights, and drawn on a
 * lane with the room for it they simply do not touch. What is left after
 * that is nudged, and the nudge is bounded twice over. **It only ever
 * moves a chip up or down**, because across is an ordering and moving a
 * chip along it would put it in the wrong order. And **it never leaves
 * the band**, because the band is the reading: a chip nudged out of its
 * own band would be a picture stating something false, where one nudged
 * within it is the same answer drawn a few pixels off.
 */
export function placeUp(
  chips: Array<{ x: number; y: number; min: number; max: number }>,
  gap: { across: number; up: number }
): number[] {
  const out = chips.map((c) => c.y);
  const taken: Array<{ x: number; y: number }> = [];
  const order = chips
    .map((c, i) => ({ ...c, i }))
    .sort((a, b) => b.y - a.y);
  const clashes = (x: number, y: number) =>
    taken.some(
      (t) => Math.abs(t.x - x) < gap.across && Math.abs(t.y - y) < gap.up
    );
  for (const p of order) {
    let y = p.y;
    if (clashes(p.x, y)) {
      /*
        Down first, because chips are placed from the top down, so the
        room is below. Then up, for one near the foot of its own band.
        Both are held inside `min` and `max`, which are that chip's own
        band: a chip nudged out of its band would be a picture stating
        something false, where one nudged inside it is the same answer
        drawn a few pixels off.
      */
      let found = false;
      for (const dir of [-1, 1]) {
        for (let step = 1; step <= 24 && !found; step += 1) {
          const tryY = p.y + dir * step * (gap.up / 4);
          if (tryY < p.min || tryY > p.max) break;
          if (!clashes(p.x, tryY)) {
            y = tryY;
            found = true;
          }
        }
        if (found) break;
      }
      // Nowhere in the band is clear: the true position stands rather
      // than the chip being pushed somewhere it does not belong.
      if (!found) y = p.y;
    }
    taken.push({ x: p.x, y });
    out[p.i] = y;
  }
  return out;
}

/** How wide a ticker chip is, in pixels, before the axis is divided by it. */
export const CHIP_WIDTH_PX = 92;

/**
 * How many chips deep a band has to be drawn before nothing overlaps.
 *
 * A first-fit scan across the axis: chips within a chip's width of each
 * other cannot share a row, so the deepest stack is how many rows that
 * band needs. Used only to decide how tall to draw the lane. The real
 * placing afterwards is two-dimensional and puts every chip at its own
 * height; this only makes sure there is room for it to.
 */
export function stackDepth(xs: number[], chipWidth: number): number {
  const rows: number[][] = [];
  for (const x of [...xs].sort((a, b) => a - b)) {
    let row = 0;
    while (rows[row]?.some((t) => Math.abs(t - x) < chipWidth)) row += 1;
    (rows[row] ??= []).push(x);
  }
  return rows.length;
}

export function buildBandMap(
  rows: Array<{
    ticker: string;
    ladder: PlanLadder | null;
    /** What the holding is worth today, in the reader's own money. */
    value: number;
    /** Up or down against what they paid, as a fraction. */
    roiPct?: number | null;
  }>,
  opts: { chipWidth?: number; chipHeight?: number } = {}
): BandMap {
  const missing: string[] = [];
  const kept: Array<{
    row: (typeof rows)[number];
    ladder: PlanLadder;
    bandId: LadderBandId;
  }> = [];
  let shape: PlanLadder | null = null;

  const total = rows.reduce(
    (sum, r) => sum + (Number.isFinite(r.value) && r.value > 0 ? r.value : 0),
    0
  );

  for (const row of rows) {
    const { ladder } = row;
    if (!ladder || ladder.atId === null || ladder.spot === null) {
      missing.push(row.ticker.toUpperCase());
      continue;
    }
    shape ??= ladder;
    kept.push({ row, ladder, bandId: ladder.atId });
  }

  if (!shape) {
    return { lanes: [], points: [], topShare: 0, units: 0, missing };
  }

  const shares = kept.map(({ row }) =>
    total > 0 ? Math.max(row.value, 0) / total : 0
  );
  const topShare = shares.reduce((m, v) => Math.max(m, v), 0);

  /*
    Across is the order by size, worked out over the whole map at once
    rather than per band: two names in different bands still have to sit
    in the right order against each other, which is what makes "the
    biggest is on the right" true of the picture and not just of one row.
  */
  const chipWidth = Math.min(Math.max(opts.chipWidth ?? 0.36, 0.01), 1);
  const chipHeight = Math.min(Math.max(opts.chipHeight ?? 0.5, 0.01), 4);
  const edge = chipWidth / 2;
  const xs = rankAcross(shares).map((x) =>
    Math.min(Math.max(x, edge), 1 - edge)
  );

  /*
    A crowded band is given the height it needs before anything is placed
    in it, which is the whole reason the lanes are measured in units of
    an ordinary band rather than in fractions of the picture. Drawn as
    equal lanes, the two-step band where most holdings sit is the one
    that runs out of room first, and the fallback for running out of room
    is chips drawn through each other.
  */
  const crowding: Partial<Record<LadderBandId, number>> = {};
  for (const band of shape.bands) {
    const inBand = kept
      .map((k, i) => ({ k, x: xs[i] ?? 0.5 }))
      .filter(({ k }) => k.bandId === band.id);
    if (inBand.length === 0) continue;
    crowding[band.id] =
      stackDepth(
        inBand.map((b) => b.x),
        chipWidth
      ) * chipHeight;
  }

  const lanes = lanesFrom(shape, crowding);
  const units = ladderUnits(lanes);
  const laneOf = new Map(lanes.map((l) => [l.id, l]));

  const placed = kept.map(({ row, ladder, bandId }, i) => {
    const band = bandById(ladder, bandId);
    return {
      ticker: row.ticker.toUpperCase(),
      bandId,
      bandLabel: band?.label ?? "",
      y: ladderHeight(ladder, lanes) ?? 0,
      share: shares[i] ?? 0,
      value: row.value,
      spot: ladder.spot ?? 0,
      anchor: ladder.anchor,
      roiPct:
        typeof row.roiPct === "number" && Number.isFinite(row.roiPct)
          ? row.roiPct
          : null,
      // The level the price is nearest inside this band, which is what a
      // reader wants the moment they have found their name.
      edge: band?.to ?? band?.from ?? null,
      actionable: isActionableBand(bandId),
      edited: ladder.edited,
    };
  });

  /*
    ONE PASS OVER THE WHOLE LADDER, NOT ONE PER BAND.

    Resolving the crowding band by band looks equivalent and is not: two
    chips a hair either side of a level are in different bands and a few
    pixels apart in the picture, and neither pass can see the other.
    Measured on a real book, that drew two tickers eleven pixels through
    each other. Every chip carries the bounds of its own band, so nothing
    can be nudged out of the band it belongs to.
  */
  const ys = placeUp(
    placed.map((p, i) => {
      const lane = laneOf.get(p.bandId);
      return {
        x: xs[i] ?? 0.5,
        y: p.y,
        min: lane?.from ?? 0,
        max: lane?.to ?? units,
      };
    }),
    { across: chipWidth, up: chipHeight }
  );

  const points: BandMapPoint[] = placed.map((p, i) => ({
    ...p,
    x: xs[i] ?? 0.5,
    y: ys[i] ?? p.y,
    trueY: p.y,
  }));

  return { lanes, points, topShare, units, missing };
}

/**
 * The holdings whose price has reached one of the decisive bands, worst
 * first, for the list on Home.
 *
 * "Worst" here means furthest out of the middle in either direction: the
 * name at the very top of its plan and the name at the very bottom are
 * both things a reader wants to see before a name a step inside either.
 * Size breaks the tie, because the same distance matters more on a
 * holding that is a third of the portfolio.
 */
export function actionableFirst(points: BandMapPoint[]): BandMapPoint[] {
  return points
    .filter((p) => p.actionable)
    .sort((a, b) => {
      const out = Math.abs(b.y - 0.5) - Math.abs(a.y - 0.5);
      return out !== 0 ? out : b.share - a.share;
    });
}
