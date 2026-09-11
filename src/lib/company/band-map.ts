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
  /**
   * Today's price, in the reader's own money.
   *
   * The book's own price, which is USD whatever the listing is quoted
   * in (`nativePrice` is the other one), so the whole of this picture
   * is a USD world and the panel's default is right rather than lucky.
   */
  spot: number;
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
  /**
   * Whether the reader actually typed the levels those names reached.
   *
   * NEVER TELL SOMEBODY THEY SET A LEVEL THEY DID NOT SET. The bands
   * are labelled in the plan's own imperative voice ("trim most of it",
   * "add a lot"), and what keeps that honest is that the plan is the
   * reader's. A default this app worked out is not, so a sentence
   * calling it "a level you set" is both false and the one sentence
   * that would make a computed default read as this app's instruction.
   * The alerts have always drawn this distinction; the picture above
   * them did not until it was asked whether it could be flagged.
   */
  reachedEdited: number;
  reachedTotal: number;
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
    /*
      How far through its own band the price has got, which no longer
      places anything and still decides the order of the list on Home:
      the name furthest out of the middle is the one to show first.
    */
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
      spot,
      roiPct:
        typeof row.roiPct === "number" && Number.isFinite(row.roiPct)
          ? row.roiPct
          : null,
      // The level the price is nearest inside this band, which is what
      // a reader wants the moment they have found their name.
      edge: band?.to ?? band?.from ?? null,
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
    reachedEdited: reached.filter((p) => p.edited).length,
    reachedTotal: reached.length,
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
  reachedEdited: 0,
  reachedTotal: 0,
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
  /**
   * How many NAMES the bar can draw, not how many slots it has: the
   * "+N" block is narrower than a name, so whoever measures the bar
   * works out its own room for it and hands back the names that are
   * left. Counting in slots here and in pixels there put the two a
   * block apart, and a 360px phone drew one name where two fit.
   */
  names: number
): { shown: BandMapPoint[]; folded: BandMapPoint[] } {
  if (items.length === 0) return { shown: [], folded: [] };
  if (items.length <= names) return { shown: items, folded: [] };
  const keep = Math.max(names, 1);
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

/**
 * HOW A BAND'S BAR IS DIVIDED BETWEEN THE NAMES IN IT.
 *
 * The bar's own width already carries the band's share of the
 * portfolio, so what is left for the blocks is to divide that bar
 * between themselves: each block grows by its share OF ITS OWN BAND,
 * and the factors sum to one.
 *
 * Growing them by their share of the whole portfolio looks equivalent
 * and is not, and the way it fails is invisible in the markup. Flex
 * distributes only the SUM of the grow factors when that sum is under
 * one, and a band's shares always are: a band holding 55% of the money
 * filled 55% of its own bar and left the rest empty, so the length a
 * reader actually saw went as the SQUARE of the share. Measured on a
 * real book, three names in a 294px bar all sat at their 72px floor
 * with 71px of bar unfilled beside them, and the bars were right only
 * for whichever band happened to be the fullest.
 */
export function barShares(input: {
  /** What the whole band is worth against the portfolio. */
  bandShare: number;
  /** The shares of the holdings actually drawn as blocks. */
  shown: number[];
  /** The shares of the holdings folded into the "+N" block. */
  folded: number[];
}): { grows: number[]; rest: number } {
  const { bandShare } = input;
  const shownSum = input.shown.reduce((s, v) => s + v, 0);
  const foldedSum = input.folded.reduce((s, v) => s + v, 0);
  if (!(bandShare > 0) || shownSum <= 0) {
    // Nothing to divide by: share the bar out evenly rather than
    // leaving it empty, which is what a portfolio worth nothing does.
    const n = input.shown.length + (input.folded.length > 0 ? 1 : 0);
    const even = n > 0 ? 1 / n : 1;
    return {
      grows: input.shown.map(() => even),
      rest: input.folded.length > 0 ? even : 0,
    };
  }
  const rest = Math.min(Math.max(foldedSum / bandShare, 0), 1);
  const drawn = 1 - rest;
  return {
    grows: input.shown.map((v) => (v / shownSum) * drawn),
    rest,
  };
}

/**
 * What the picture says about the names that reached a level, worded so
 * it is true whoever set that level.
 *
 * Kept out of the component and tested, because this is the sentence
 * that decides whether a row of imperative band names reads as the
 * reader's own plan or as this app telling somebody to sell something.
 */
export function readySaid(summary: BandMapSummary): string {
  const { trimNames, addNames, reachedEdited, reachedTotal } = summary;
  if (reachedTotal === 0) {
    return "every name is somewhere in the middle of its own plan";
  }
  /*
    The names, and which end of the ladder they reached, described
    rather than instructed: the bands stopped saying "trim" and "add"
    when they stopped being imperative, so a sentence about them that
    still did would be the app supplying the verb the table refuses to.
  */
  /*
    A LIST OF NAMES TAKES A PLURAL. It read "SHOP, MU, SOFI at the
    bottom of its own plan", which is three companies sharing one plan
    and is not what the picture above it shows.
  */
  const ownPlan = (names: string[]) =>
    names.length === 1 ? "its own plan" : "their own plans";
  const parts: string[] = [];
  if (trimNames.length > 0) {
    parts.push(`${trimNames.join(", ")} at the top of ${ownPlan(trimNames)}`);
  }
  if (addNames.length > 0) {
    parts.push(`${addNames.join(", ")} at the bottom of ${ownPlan(addNames)}`);
  }
  /*
    Whose level it is, said once at the end rather than hung on each
    name: it is the same answer for all of them and repeating it buried
    the names, which are what the reader came to read.
  */
  const whose =
    reachedEdited === reachedTotal
      ? "Levels you set."
      : reachedEdited === 0
        ? "Levels this app worked out, which you have not changed."
        : "Some of those levels are yours, the rest this app worked out.";
  return `${parts.join(", and ")}. ${whose}`;
}
