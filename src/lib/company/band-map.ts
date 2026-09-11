/**
 * Every holding on one ladder, so a portfolio can be read as a picture
 * rather than as a list of prices.
 *
 * The problem it solves is that each name's plan is in its own money:
 * one company's "trim a little" is $456 and another's is $1.80, so the
 * prices cannot share an axis. What they can share is the ladder
 * itself. Every band is a multiple of that name's own fair value, so
 * **the band is the common unit**, and two names in the same band are
 * in the same place in their own plans whatever their prices are.
 *
 * **The picture is a bar per band and each block in it is one holding.**
 * The bar's length is how much of the reader's money is in that band,
 * which is the reading nothing else in the app gives: a portfolio with
 * most of its money under fair value looks different at a glance from
 * one with most of its money above. That replaced a scatter whose
 * height was the exact position inside a band and whose lanes grew
 * with whatever happened to be crowded, whose faults were all the same
 * fault: a picture whose proportions changed with the portfolio. Rows
 * are a fixed height now, chips cannot overlap because they are laid
 * out rather than placed, and a band nothing is in is drawn quieter
 * rather than drawn taller or dropped.
 *
 * Nothing here is a score and nothing here says to do anything. Both
 * readings are figures already on other screens: the plan the reader
 * owns, and the share of their own money.
 */
import {
  isActionableBand,
  positionInBand,
  type LadderBandId,
  type PlanLadder,
} from "@/lib/company/plan-ladder";

export type BandMapPoint = {
  ticker: string;
  bandId: LadderBandId;
  bandLabel: string;
  /** This holding's share of the portfolio, as a fraction. */
  share: number;
  value: number;
  spot: number;
  anchor: number;
  /**
   * What this reader is up or down on the holding, as a fraction.
   *
   * The picture spends the app's gain and loss pair on the one thing
   * those two colours mean everywhere else in it, money made and money
   * lost, and spends it on a single dot rather than on the whole chip:
   * a tinted pill plus a tinted border plus an accent ring is three
   * signals fighting over one object, which is what made the first
   * version look muddy. Where the price sits against the plan is the
   * row it is in, so the two readings never compete.
   */
  roiPct: number | null;
  /** The nearest level of that name's own plan, for the label. */
  edge: number | null;
  /**
   * The two prices this band runs between, and where in it the price
   * actually sits, as a fraction. Null on the open bands at either end,
   * which have no width to be a fraction of.
   */
  bandFrom: number | null;
  bandTo: number | null;
  withinBand: number | null;
  actionable: boolean;
  /** The reader typed at least one level of this name's plan. */
  edited: boolean;
  /**
   * Height on the whole ladder, 0 at the foot and 1 at the head, which
   * is which band it is in plus how far through that band it has got.
   *
   * The picture no longer draws with this: it is what orders the list
   * on Home, where the name furthest out of the middle in either
   * direction is the one a reader most wants to see first.
   */
  y: number;
};

export type BandMapBand = {
  id: LadderBandId;
  label: string;
  /** Where this band sits against fair value, as multiples of it. */
  fromRatio: number | null;
  toRatio: number | null;
  actionable: boolean;
  /** Every holding in this band, biggest first. */
  items: BandMapPoint[];
  /** What this band is worth against the whole portfolio, hidden included. */
  share: number;
};

export type BandMapSummary = {
  /** Share of the portfolio priced inside the fair value band. */
  aroundFairValue: number;
  /** Share priced under it, and over it. */
  below: number;
  above: number;
  /** Names that reached an end of their own plan, by which end. */
  trimNames: string[];
  addNames: string[];
  /** The biggest holding, which is the one worth naming out loud. */
  biggest: BandMapPoint | null;
};

export type BandMap = {
  bands: BandMapBand[];
  points: BandMapPoint[];
  summary: BandMapSummary;
  /** The largest share on the map. */
  topShare: number;
  /** Holdings left off, because no ladder could be built for them. */
  missing: string[];
};

/**
 * Under this share of the portfolio a holding is a rounding error, and
 * the picture says "small" rather than "more" when it folds a run of
 * them away. It decides a word and nothing else: which names are drawn
 * is `foldToFit`, and it is decided by room.
 */
export const TINY_SHARE = 0.03;

/** Which end of the plan an actionable band sits at. */
const TRIM_END = new Set<LadderBandId>(["trim-most", "trim-some"]);

export function buildBandMap(
  rows: Array<{
    ticker: string;
    ladder: PlanLadder | null;
    /** What the holding is worth today, in the reader's own money. */
    value: number;
    /** Up or down against what they paid, as a fraction. */
    roiPct?: number | null;
  }>
): BandMap {
  const missing: string[] = [];
  const kept: Array<{ row: (typeof rows)[number]; ladder: PlanLadder }> = [];
  let shape: PlanLadder | null = null;

  for (const row of rows) {
    const { ladder } = row;
    if (!ladder || ladder.atId === null || ladder.spot === null) {
      missing.push(row.ticker.toUpperCase());
      continue;
    }
    shape ??= ladder;
    kept.push({ row, ladder });
  }

  if (!shape) {
    return {
      bands: [],
      points: [],
      summary: EMPTY_SUMMARY,
      topShare: 0,
      missing,
    };
  }

  const total = kept.reduce(
    (sum, { row }) =>
      sum + (Number.isFinite(row.value) && row.value > 0 ? row.value : 0),
    0
  );

  /*
    The ladder runs head first, so the foot of it is the last band. A
    holding's height is how many whole bands sit under it plus how far
    through its own it has got, over the number of bands, which puts
    every name on one 0 to 1 scale whatever its prices are.
  */
  const order = shape.bands.map((b) => b.id);
  const lanes = order.length;

  const points: BandMapPoint[] = kept.map(({ row, ladder }) => {
    const bandId = ladder.atId!;
    const band = ladder.bands.find((b) => b.id === bandId) ?? null;
    const spot = ladder.spot!;
    const within =
      band && band.from !== null && band.to !== null
        ? positionInBand(band, spot)
        : null;
    const fromFoot = lanes - 1 - order.indexOf(bandId);
    return {
      ticker: row.ticker.toUpperCase(),
      bandId,
      bandLabel: band?.label ?? "",
      share: total > 0 ? Math.max(row.value, 0) / total : 0,
      value: row.value,
      spot,
      anchor: ladder.anchor,
      roiPct:
        typeof row.roiPct === "number" && Number.isFinite(row.roiPct)
          ? row.roiPct
          : null,
      // The level the price is nearest inside this band, which is what
      // a reader wants the moment they have found their name.
      edge: band?.to ?? band?.from ?? null,
      bandFrom: band?.from ?? null,
      bandTo: band?.to ?? null,
      withinBand: within,
      actionable: isActionableBand(bandId),
      edited: ladder.edited,
      y: (fromFoot + (within ?? 0.5)) / lanes,
    };
  });

  const biggestFirst = (a: BandMapPoint, b: BandMapPoint) => b.share - a.share;

  /*
    Biggest first, and EVERY name in the band. How many of them can
    actually be drawn is a fact about the device rather than about the
    portfolio, so the view measures its own bar and calls `foldToFit`.
  */
  const bands: BandMapBand[] = shape.bands.map((b) => {
    const mine = points.filter((p) => p.bandId === b.id).sort(biggestFirst);
    return {
      id: b.id,
      label: b.label,
      fromRatio: b.fromRatio,
      toRatio: b.toRatio,
      actionable: isActionableBand(b.id),
      items: mine,
      share: mine.reduce((s, p) => s + p.share, 0),
    };
  });

  const holdAt = order.indexOf("hold");
  const shareWhere = (test: (p: BandMapPoint) => boolean) =>
    points.filter(test).reduce((s, p) => s + p.share, 0);
  const reached = points.filter((p) => p.actionable);

  const summary: BandMapSummary = {
    aroundFairValue: shareWhere((p) => p.bandId === "hold"),
    // Below fair value is further down the ladder, which is later in
    // the band order, since the bands run head first.
    below: shareWhere((p) => order.indexOf(p.bandId) > holdAt),
    above: shareWhere((p) => order.indexOf(p.bandId) < holdAt),
    trimNames: reached
      .filter((p) => TRIM_END.has(p.bandId))
      .sort(biggestFirst)
      .map((p) => p.ticker),
    addNames: reached
      .filter((p) => !TRIM_END.has(p.bandId))
      .sort(biggestFirst)
      .map((p) => p.ticker),
    biggest: points.slice().sort(biggestFirst)[0] ?? null,
  };

  return {
    bands,
    points,
    summary,
    topShare: points.reduce((m, p) => Math.max(m, p.share), 0),
    missing,
  };
}

const EMPTY_SUMMARY: BandMapSummary = {
  aroundFairValue: 0,
  below: 0,
  above: 0,
  trimNames: [],
  addNames: [],
  biggest: null,
};

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

/**
 * WHICH NAMES A BAND CAN ACTUALLY DRAW, AND WHICH FOLD AWAY.
 *
 * Folding is decided by **room**, never by size alone, and that is the
 * correction rather than a detail. A cutoff that dropped everything
 * under a few per cent of the portfolio read well on a crowded band and
 * was nonsense on a quiet one: measured on a book with one holding at
 * 69%, the band holding two names worth 1.5% and 0.2% folded BOTH of
 * them and drew "+2 small" over a bar with room for six, so a reader
 * could not see what was in their own band without hovering it. Room is
 * the only thing that actually forces a name out.
 *
 * Size still decides WHICH name goes, because the blocks are ordered
 * biggest first and folding takes from the end, so the smallest are the
 * ones that fold. The one name that jumps the queue is **a holding at
 * an end of its own plan**, kept however small it is: that is the row
 * the reader opened this picture to find, and it is exactly the row an
 * ordering by size alone throws away first.
 */
export function foldToFit(
  items: BandMapPoint[],
  room: number
): { shown: BandMapPoint[]; folded: BandMapPoint[] } {
  if (items.length === 0) return { shown: [], folded: [] };
  if (items.length <= room) return { shown: items, folded: [] };
  // One slot goes to the "+N" block that stands for the folded names.
  const keep = Math.max(room - 1, 1);
  const ranked = [...items].sort(
    (a, b) =>
      Number(b.actionable) - Number(a.actionable) || b.share - a.share
  );
  const kept = new Set(ranked.slice(0, keep));
  return {
    // Filtered rather than taken from `ranked`, so what is drawn stays
    // in the band's own biggest-first order however it was chosen.
    shown: items.filter((p) => kept.has(p)),
    folded: items.filter((p) => !kept.has(p)),
  };
}
