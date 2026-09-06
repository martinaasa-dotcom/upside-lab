/**
 * One place builds a price plan for a holding, so the map, the list on
 * Home and the alerts cannot draw three different ladders for one name.
 *
 * The three surfaces reach it from different directions: the map wants
 * every holding in one portfolio with what each is worth, the list wants
 * every holding a reader owns anywhere, and the alerts want whichever of
 * those has reached an end of its plan. All three need the same anchor,
 * the same step and the same window, and the day they stop agreeing is
 * the day a reader is told on one screen that a level was reached and on
 * another that it was not.
 */
import { FORECAST_YEARS, resolveTickerForecastPath } from "@/lib/forecast";
import type { PortfolioEoyOverrides } from "@/lib/forecast-overrides";
import { anchorForHolding } from "@/lib/company/ladder-anchor";
import {
  buildPlanLadder,
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
  }>;
  overrides?: PortfolioEoyOverrides;
  ladders?: LadderOverrides;
}): HoldingLadderRow[] {
  const firstYear = FORECAST_YEARS[0];
  const out: HoldingLadderRow[] = [];
  const seen = new Set<string>();

  for (const row of input.rows) {
    const ticker = row.ticker.toUpperCase();
    /*
      One row per name. A reader holding the same company in two
      portfolios has one plan for it, and drawing it twice would put two
      chips on top of each other saying the same thing.
    */
    if (seen.has(ticker)) continue;
    seen.add(ticker);

    const spot = row.spot;
    if (firstYear == null || typeof spot !== "number" || !(spot > 0)) {
      out.push({ ticker, ladder: null, value: row.value });
      continue;
    }
    const closes = (row.closes ?? []).filter(
      (n) => Number.isFinite(n) && n > 0
    );
    const high = closes.length > 1 ? Math.max(...closes) : null;
    const low = closes.length > 1 ? Math.min(...closes) : null;
    const path = resolveTickerForecastPath(ticker, spot, input.overrides);
    const anchor = anchorForHolding({
      target: path.eoyPrices[firstYear] ?? null,
      targetIsYours: Boolean(path.targetedYears[firstYear]),
      rangeMid: high !== null && low !== null ? (high + low) / 2 : null,
      windowSaid: HOLDING_WINDOW_SAID,
    });
    if (!anchor) {
      out.push({ ticker, ladder: null, value: row.value });
      continue;
    }
    out.push({
      ticker,
      value: row.value,
      ladder: buildPlanLadder({
        ticker,
        anchor: anchor.price,
        anchorKind: anchor.kind,
        anchorSaid: anchor.said,
        spot,
        high,
        low,
        windowSaid: HOLDING_WINDOW_SAID,
        override: input.ladders?.[ticker] ?? null,
      }),
    });
  }
  return out;
}
