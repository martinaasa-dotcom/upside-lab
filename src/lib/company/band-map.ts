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
  /** 0 at the foot of the ladder, 1 at the head. Lanes are equal height. */
  from: number;
  to: number;
  actionable: boolean;
};

export type BandMapPoint = {
  ticker: string;
  bandId: LadderBandId;
  bandLabel: string;
  /** Height on the ladder, 0 at the very bottom and 1 at the very top. */
  y: number;
  /** This holding's share of the portfolio, as a fraction. */
  share: number;
  /**
   * Where it is drawn across, 0 at the left edge and 1 at the right.
   * Exactly its share against the largest holding: nothing moves a chip
   * along this axis, because the axis is a figure rather than a layout.
   */
  x: number;
  /**
   * Which row inside its own lane, when more than one is needed to keep
   * two chips from touching. Zero for almost every holding.
   */
  row: number;
  value: number;
  spot: number;
  anchor: number;
  /** The nearest level of that name's own plan, for the label. */
  edge: number | null;
  actionable: boolean;
  /** The reader typed at least one level of this name's plan. */
  edited: boolean;
};

export type BandMap = {
  lanes: BandLane[];
  points: BandMapPoint[];
  /** The largest share on the map, which is what the across axis ends at. */
  topShare: number;
  /** How many rows each lane needs, by band id, so the drawing can size them. */
  laneRows: Record<string, number>;
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
export function lanesFrom(ladder: PlanLadder): BandLane[] {
  const n = ladder.bands.length;
  return ladder.bands.map((b, i) => ({
    id: b.id,
    label: b.label,
    // `bands` runs head to foot, and the axis runs foot to head.
    from: (n - 1 - i) / n,
    to: (n - i) / n,
    actionable: isActionableBand(b.id),
  }));
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
export function ladderHeight(ladder: PlanLadder): number | null {
  if (ladder.spot === null || ladder.atId === null) return null;
  const lanes = lanesFrom(ladder);
  const lane = lanes.find((l) => l.id === ladder.atId);
  const band = bandById(ladder, ladder.atId);
  if (!lane || !band) return null;
  const within = positionInBand(band, ladder.spot);
  return lane.from + within * (lane.to - lane.from);
}

/**
 * Two chips at the same height and nearly the same share overlap, and a
 * ticker drawn over another ticker is worse than one drawn a few pixels
 * from where it belongs.
 *
 * The first version of this nudged them apart sideways, which is the
 * usual answer and is wrong here: the across axis is a real figure, so
 * moving a chip along it prints a share the holding does not have. A
 * lane is stacked instead. Chips go into the first row of the lane where
 * nothing is already in the way, highest in the band first, and the lane
 * grows as tall as it needs to be, so **no chip is ever moved along the
 * axis** and no two ever touch.
 *
 * `chipWidth` is how wide a chip is as a fraction of the axis, which the
 * drawing measures and hands in: it is a fact about the device rather
 * than about the portfolio, which is why it cannot be a constant here.
 * The same portfolio packs into fewer rows on a laptop than on a phone,
 * which is the correct behaviour and the reason this takes a parameter at
 * all.
 */
export function packLane(
  chips: Array<{ x: number; y: number }>,
  chipWidth: number
): number[] {
  const width = Math.min(Math.max(chipWidth, 0.01), 1);
  const rows: number[][] = [];
  const out = new Array<number>(chips.length).fill(0);
  /*
    Highest first, so the row a chip lands on is not arbitrary: within a
    band, the ones nearest the top of that band are drawn nearest the top
    of the lane. Packing in the order the holdings happened to arrive
    would put a name at the very bottom of its band above one at the very
    top of it, which is a picture saying something that is not true.
  */
  const order = chips
    .map((c, i) => ({ ...c, i }))
    .sort((a, b) => b.y - a.y);
  for (const p of order) {
    let row = 0;
    while (
      rows[row] !== undefined &&
      rows[row]!.some((taken) => Math.abs(taken - p.x) < width)
    ) {
      row += 1;
    }
    if (rows[row] === undefined) rows[row] = [];
    rows[row]!.push(p.x);
    out[p.i] = row;
  }
  return out;
}

/** How wide a ticker chip is, in pixels, before the axis is divided by it. */
export const CHIP_WIDTH_PX = 68;

export function buildBandMap(
  rows: Array<{
    ticker: string;
    ladder: PlanLadder | null;
    /** What the holding is worth today, in the reader's own money. */
    value: number;
  }>,
  opts: { chipWidth?: number } = {}
): BandMap {
  const missing: string[] = [];
  const placed: Array<Omit<BandMapPoint, "x" | "row">> = [];
  let lanes: BandLane[] = [];

  const total = rows.reduce(
    (sum, r) => sum + (Number.isFinite(r.value) && r.value > 0 ? r.value : 0),
    0
  );

  for (const row of rows) {
    const { ladder } = row;
    const height = ladder ? ladderHeight(ladder) : null;
    if (!ladder || height === null || ladder.atId === null) {
      missing.push(row.ticker.toUpperCase());
      continue;
    }
    if (lanes.length === 0) lanes = lanesFrom(ladder);
    const band = bandById(ladder, ladder.atId);
    const share = total > 0 ? Math.max(row.value, 0) / total : 0;
    placed.push({
      ticker: row.ticker.toUpperCase(),
      bandId: ladder.atId,
      bandLabel: band?.label ?? "",
      y: height,
      share,
      value: row.value,
      spot: ladder.spot ?? 0,
      anchor: ladder.anchor,
      // The level the price is nearest inside this band, which is what a
      // reader wants the moment they have found their name on the map.
      edge: band?.to ?? band?.from ?? null,
      actionable: isActionableBand(ladder.atId),
      edited: ladder.edited,
    });
  }

  /*
    The across axis ends at the largest holding rather than at 100%, or a
    portfolio of twenty names would draw every chip in the leftmost tenth
    of the picture and the axis would carry no information at all. The
    axis prints the real percentages, so nothing is overstated.
  */
  const topShare = placed.reduce((m, p) => Math.max(m, p.share), 0);
  const scale = topShare > 0 ? topShare : 1;

  const points: BandMapPoint[] = [];
  const laneRows: Record<string, number> = {};
  /*
    A conservative default, because it is only used for the one render
    before the drawing has measured itself: too wide costs a taller lane
    for a frame, too narrow puts two chips on top of each other.
  */
  const chipWidth = Math.min(Math.max(opts.chipWidth ?? 0.36, 0.01), 1);
  const edge = chipWidth / 2;
  for (const lane of lanes) {
    const inLane = placed.filter((p) => p.bandId === lane.id);
    laneRows[lane.id] = 1;
    if (inLane.length === 0) continue;
    /*
      Held half a chip in from each end, HERE rather than in the drawing.
      A chip is centred on its own position, so one at either extreme
      hangs half outside the picture, and the first version pulled it
      back in with CSS after the packing was done: that moved chips the
      packer had already decided were clear of each other, and two of
      them landed on top of each other at 390px. Whatever moves a chip
      has to be the thing that decides which row it goes on.
    */
    const xs = inLane.map((p) =>
      Math.min(Math.max(p.share / scale, edge), 1 - edge)
    );
    const packed = packLane(
      inLane.map((p, i) => ({ x: xs[i] ?? 0, y: p.y })),
      chipWidth
    );
    laneRows[lane.id] = Math.max(...packed) + 1;
    inLane.forEach((p, i) => {
      points.push({ ...p, x: xs[i] ?? 0, row: packed[i] ?? 0 });
    });
  }

  return { lanes, points, topShare, laneRows, missing };
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
