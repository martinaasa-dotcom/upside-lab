/**
 * One place builds a price ladder for a holding, so the map, the list on
 * Home, the alerts and the Circle cannot draw four different ladders for
 * one name.
 *
 * The surfaces reach it from different directions: the map wants every
 * holding in one portfolio with what each is worth, the list wants every
 * holding a reader owns anywhere, the alerts want whichever of those has
 * reached an end of its ladder, and the Circle wants every company the
 * room holds between them with nobody's own plan in it. All of them need
 * the same anchor, the same step and the same window, and the day they
 * stop agreeing is the day a reader is told on one screen that a level
 * was reached and on another that it was not.
 *
 * THE ANCHOR IS THE COMPANY'S, NOT THE HOLDING'S, and that is what makes
 * the Circle and the holdings page comparable at last: `anchors` is the
 * blended twelve-month estimate the server publishes per company
 * (`loadCompanyAnchors`), identical for every reader, so a name reads the
 * same in a circle, in a book, on Home and on its own research page. What
 * stays per reader is the part that is genuinely theirs: the levels on
 * the ladder, and an anchor they typed over the top of it.
 */
import { anchorForHolding } from "@/lib/company/ladder-anchor";
import {
  ANCHOR_WINDOW_SAID,
  type CompanyAnchors,
} from "@/lib/company/company-anchor-types";
import {
  buildPlanLadder,
  type LadderOverride,
  type LadderOverrides,
  type PlanLadder,
} from "@/lib/company/plan-ladder";

/**
 * The price history a browser already holds is about three months, not a
 * year, and the ladder is told so rather than left to imply otherwise.
 */
export const HOLDING_WINDOW_SAID = "the last few months";

export type HoldingLadderRow = {
  ticker: string;
  ladder: PlanLadder | null;
  value: number;
  /** Up or down against what this reader paid, as a fraction. */
  roiPct?: number | null;
};

export function holdingLadders(input: {
  rows: Array<{
    ticker: string;
    /** Today's price, or null where this browser has no quote yet. */
    spot: number | null | undefined;
    /** The closes this browser holds, for how far the name travels. */
    closes?: number[] | null;
    /** What the holding is worth today, in the reader's own money. */
    value: number;
    /** Up or down against what they paid, as a fraction. */
    roiPct?: number | null;
  }>;
  /**
   * What each company looks worth, the same reading for everybody. A
   * ticker with no entry falls back to the range this browser can see,
   * which is what every ladder did before there was a shared answer.
   */
  anchors?: CompanyAnchors;
  ladders?: LadderOverrides;
  /**
   * The house account's own ladder edits, read for a ticker only when
   * this reader has none of their own -- never for the house account
   * itself, since `ladders` already answers first there and a figure
   * never falls back to itself.
   */
  houseLadders?: Record<string, LadderOverride>;
}): HoldingLadderRow[] {
  const out: HoldingLadderRow[] = [];
  const seen = new Set<string>();

  for (const row of input.rows) {
    const ticker = row.ticker.toUpperCase();
    /*
      One row per name. A reader holding the same company in two
      portfolios has one ladder for it, and drawing it twice would put two
      chips on top of each other saying the same thing.
    */
    if (seen.has(ticker)) continue;
    seen.add(ticker);

    const spot = row.spot;
    if (typeof spot !== "number" || !(spot > 0)) {
      out.push({ ticker, ladder: null, value: row.value, roiPct: row.roiPct });
      continue;
    }
    const closes = (row.closes ?? []).filter(
      (n) => Number.isFinite(n) && n > 0
    );
    const ownHigh = closes.length > 1 ? Math.max(...closes) : null;
    const ownLow = closes.length > 1 ? Math.min(...closes) : null;
    const shared = input.anchors?.[ticker] ?? null;
    const anchor = anchorForHolding({
      estimate: shared,
      rangeMid: ownHigh !== null && ownLow !== null ? (ownHigh + ownLow) / 2 : null,
      windowSaid: HOLDING_WINDOW_SAID,
    });
    if (!anchor) {
      out.push({ ticker, ladder: null, value: row.value });
      continue;
    }
    /*
      THE WINDOW COMES WITH THE ANCHOR, OR TWO ROOMS AGREE ABOUT WHAT A
      COMPANY IS WORTH AND DISAGREE ABOUT HOW WIDE ITS BANDS ARE.

      The high and the low set the step and the floor, so the shared
      reading ships its own year alongside its price and both are used
      together. The browser's own closes, about three months of them, are
      what is left for a name the feed could not answer about, which is
      the same pair that has always drawn those ladders.
    */
    const sharedWindow = shared?.high != null && shared.low != null;
    const high = sharedWindow ? shared.high : ownHigh;
    const low = sharedWindow ? shared.low : ownLow;
    const windowSaid = sharedWindow ? ANCHOR_WINDOW_SAID : HOLDING_WINDOW_SAID;
    out.push({
      ticker,
      value: row.value,
      roiPct: row.roiPct,
      ladder: buildPlanLadder({
        ticker,
        anchor: anchor.price,
        anchorKind: anchor.kind,
        anchorSaid: anchor.said,
        spot,
        high,
        low,
        windowSaid,
        override: input.ladders?.[ticker] ?? null,
        houseOverride: input.houseLadders?.[ticker] ?? null,
      }),
    });
  }
  return out;
}
