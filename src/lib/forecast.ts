import type { Holding, Quote } from "@/lib/types";
import type { PortfolioEoyOverrides } from "@/lib/forecast-overrides";
import { shapedPathForTicker } from "@/lib/forecast-conviction";
import { cagr, finiteNumber, roundMoney, safeDiv, sumMoney } from "@/lib/money";

/** How many end-of-year columns sit after Current. */
export const FORECAST_YEAR_COUNT = 5;

/**
 * The years the forecast covers: this one and the next four.
 *
 * This was a literal, `[2026, 2027, 2028, 2029, 2030]`, under a comment
 * saying "next 5 years from this year", which it was on the day it was
 * written. On the first of January it stops being one, silently and in the
 * worst possible way: the panel keeps offering an editable price target for
 * the thirty-first of December of a year that has already finished, the
 * model is asked to reason a path to a date in the past, and the five year
 * forecast the landing page sells is four years and a receipt. Nothing
 * fails; the reader is simply shown a column they can do nothing with,
 * forever, and one fewer year than they were promised.
 *
 * Derived once per module load rather than per call. A tab left open across
 * midnight on the thirty-first of December keeps the old list until it is
 * reloaded, which is the right trade: recomputing per call would move the
 * columns out from under an edit in progress, and the wrong year for one
 * night on a tab nobody is looking at costs nothing.
 */
export const FORECAST_YEARS: readonly number[] = (() => {
  const first = new Date().getFullYear();
  return Array.from({ length: FORECAST_YEAR_COUNT }, (_, i) => first + i);
})();

/**
 * A year the forecast covers. Deliberately `number` rather than a union of
 * the literals: the list moves every January, so a type naming this year's
 * five would have to be edited every January too, which is the same bug
 * with a compile error in front of it.
 */
export type ForecastYear = number;

/**
 * The two named horizons, taken from the range rather than typed beside
 * it.
 *
 * The holdings drawer used to say "End of 2028" and "End of 2030" in its own
 * constants and then read `eoyPrices[2028]` by literal. The range moves,
 * and when it does a literal reads a year that is not in it, so the screen
 * would keep the old heading and show whatever `undefined` falls back to.
 * Naming the positions here means the label and the price it belongs to
 * cannot drift apart, wherever either one is drawn.
 */
export const THREE_YEAR_INDEX = 2;
export const FIVE_YEAR_INDEX = FORECAST_YEARS.length - 1;
export const THREE_YEAR: ForecastYear = FORECAST_YEARS[THREE_YEAR_INDEX]!;
export const FIVE_YEAR: ForecastYear = FORECAST_YEARS[FIVE_YEAR_INDEX]!;

export type ForecastRow = {
  ticker: string;
  shares: number;
  currentPrice: number;
  currentValue: number;
  /** EOY mark price per year (Margus/manual override, else temporary spot) */
  eoyPrices: Record<ForecastYear, number>;
  eoyValues: Record<ForecastYear, number>;
  /** True when that year has a Margus/manual override (not placeholder spot) */
  targetedYears: Record<ForecastYear, boolean>;
  /**
   * True when that year's price came from the house account's own saved
   * plan rather than this reader's own. Never true in the same year as
   * `targetedYears`, since a reader's own always answers first.
   */
  houseTargetedYears: Record<ForecastYear, boolean>;
  /** (final EOY stock price − current SP) / current SP */
  gainPct: number | null;
  /** True when every forecast year has an override */
  hasTargets: boolean;
};

export type ForecastModel = {
  years: readonly ForecastYear[];
  rows: ForecastRow[];
  currentTotal: number;
  eoyTotals: Record<ForecastYear, number>;
  /** Portfolio gain to last forecast year */
  gainPct: number | null;
};

function normalizeTickerKey(ticker: string) {
  return ticker.toUpperCase();
}

/**
 * Resolve EOY SP from Margus/manual overrides first, the house account's
 * own saved plan second, and spot last.
 *
 * The "never hardcoded" half of the old comment still holds and is not
 * what this reads: `houseOverrides` is one real account's own figures,
 * written through the same Growth-room field every reader uses, synced
 * from `portfell_house_forecast` and disclosed as exactly that wherever
 * it is drawn — never a table typed into this file. A reader's own
 * override, hand-typed or Margus-filled, always wins over it; a house
 * figure only fills a year nobody here has ever answered.
 */
function priceForYear(
  ticker: string,
  year: ForecastYear,
  spot: number,
  overrides?: PortfolioEoyOverrides,
  houseOverrides?: PortfolioEoyOverrides
): { price: number; targeted: boolean; houseTargeted: boolean } {
  const key = normalizeTickerKey(ticker);
  const override = overrides?.[key]?.[year];
  if (typeof override === "number" && override > 0) {
    return { price: override, targeted: true, houseTargeted: false };
  }
  const houseOverride = houseOverrides?.[key]?.[year];
  if (typeof houseOverride === "number" && houseOverride > 0) {
    return { price: houseOverride, targeted: false, houseTargeted: true };
  }
  return { price: spot, targeted: false, houseTargeted: false };
}

/**
 * True when every holding has a real price for every forecast year,
 * whether that year is the reader's own or the house account's.
 *
 * A house-supplied year counts as covered so the panel does not spend a
 * model call auto-filling a year that already has a real, disclosed
 * figure on it: the reader can still press "Ask Margus" for their own
 * reasoning whenever they want it, but nothing here does that for them
 * behind their back just because the number on screen is not theirs.
 */
export function isForecastFullyCovered(
  tickers: string[],
  overrides?: PortfolioEoyOverrides,
  houseOverrides?: PortfolioEoyOverrides
): boolean {
  if (!tickers.length) return true;
  for (const ticker of tickers) {
    const key = normalizeTickerKey(ticker);
    const row = overrides?.[key];
    const houseRow = houseOverrides?.[key];
    for (const year of FORECAST_YEARS) {
      const p = row?.[year];
      const hp = houseRow?.[year];
      const covered =
        (typeof p === "number" && p > 0) || (typeof hp === "number" && hp > 0);
      if (!covered) return false;
    }
  }
  return true;
}

export function buildForecast(
  holdings: Holding[],
  quotes: Record<string, Quote>,
  cashBalance: number,
  overrides?: PortfolioEoyOverrides,
  /** The house account's own saved plan, read only where this reader has none of their own. */
  houseOverrides?: PortfolioEoyOverrides
): ForecastModel {
  const rows: ForecastRow[] = holdings
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((h) => {
      const quoted = quotes[h.ticker]?.price;
      const spot =
        typeof quoted === "number" && Number.isFinite(quoted)
          ? quoted
          : h.buy_price;
      const eoyPrices = {} as Record<ForecastYear, number>;
      const eoyValues = {} as Record<ForecastYear, number>;
      const targetedYears = {} as Record<ForecastYear, boolean>;
      const houseTargetedYears = {} as Record<ForecastYear, boolean>;
      let targetedCount = 0;
      for (const year of FORECAST_YEARS) {
        const { price, targeted, houseTargeted } = priceForYear(
          h.ticker,
          year,
          spot,
          overrides,
          houseOverrides
        );
        if (targeted) targetedCount += 1;
        eoyPrices[year] = price;
        eoyValues[year] = roundMoney(finiteNumber(h.shares) * price);
        targetedYears[year] = targeted;
        houseTargetedYears[year] = houseTargeted;
      }
      const currentValue = roundMoney(finiteNumber(h.shares) * finiteNumber(spot));
      const lastYear = FORECAST_YEARS[FORECAST_YEARS.length - 1];
      const lastPrice = eoyPrices[lastYear];
      const gainPct = spot !== 0 ? safeDiv(lastPrice - spot, spot) : null;
      return {
        ticker: h.ticker,
        shares: h.shares,
        currentPrice: spot,
        currentValue,
        eoyPrices,
        eoyValues,
        targetedYears,
        houseTargetedYears,
        gainPct,
        hasTargets: targetedCount === FORECAST_YEARS.length,
      };
    });

  const cash = finiteNumber(cashBalance);
  const equityCurrent = sumMoney(rows.map((r) => r.currentValue));
  const currentTotal = roundMoney(equityCurrent + cash);
  const eoyTotals = {} as Record<ForecastYear, number>;
  for (const year of FORECAST_YEARS) {
    eoyTotals[year] = roundMoney(
      sumMoney(rows.map((r) => r.eoyValues[year])) + cash
    );
  }
  const lastYear = FORECAST_YEARS[FORECAST_YEARS.length - 1];
  const gainPct =
    currentTotal !== 0
      ? safeDiv(eoyTotals[lastYear] - currentTotal, currentTotal)
      : null;

  return {
    years: FORECAST_YEARS,
    rows,
    currentTotal,
    eoyTotals,
    gainPct,
  };
}

export type TickerForecastSummary = {
  ticker: string;
  spot: number;
  eoyPrices: Record<ForecastYear, number>;
  eoyGains: Record<ForecastYear, number>;
  targetedYears: Record<ForecastYear, boolean>;
  /**
   * True where a year's price came from the house account's own saved
   * plan rather than this reader's own. Never true in the same year as
   * `targetedYears`.
   */
  houseTargetedYears: Record<ForecastYear, boolean>;
  /** Price at the end of the third forecast year. */
  threeYearPrice: number;
  threeYearGainPct: number;
  threeYearCagrPct: number;
  /** Price at the end of the last forecast year. */
  fiveYearPrice: number;
  fiveYearGainPct: number;
  fiveYearCagrPct: number;
  hasOverrides: boolean;
  /** True where any year came from the house account's own saved plan. */
  hasHouseOverrides: boolean;
};

/**
 * Resolves the exact forecast path for a single ticker matching the Forecast table.
 * Honors manual/Margus overrides, otherwise falls back to the same shape the
 * Growth room falls back to, which is the name's own and not its sector's.
 *
 * **`shapedPathForTicker`, never `shapedFallbackPath`**, and the difference
 * is two rooms disagreeing about one company. This is what `StockRoom` and
 * `holdingLadders` read, so a sector-only shape here against a per-name
 * rate in `ensureCompleteEoyTargets` put two answers in the product for
 * the same ticker. Measured off a $100 spot when the per-name table
 * landed: `INTC` ended at **357** here and at **134** in the Growth room,
 * and `NBIS` at 483 against 567. The ladder those prices anchor drives the
 * price plan and the alerts, so the disagreement reached a reader as two
 * different bands for one holding.
 */
export function resolveTickerForecastPath(
  ticker: string,
  spot: number,
  overrides?: PortfolioEoyOverrides,
  /** The house account's own saved plan, read only where this reader has none of their own. */
  houseOverrides?: PortfolioEoyOverrides
): TickerForecastSummary {
  const normTicker = ticker.toUpperCase();
  const fallback = shapedPathForTicker(spot > 0 ? spot : 1, normTicker);

  const eoyPrices = {} as Record<ForecastYear, number>;
  const eoyGains = {} as Record<ForecastYear, number>;
  const targetedYears = {} as Record<ForecastYear, boolean>;
  const houseTargetedYears = {} as Record<ForecastYear, boolean>;
  let hasOverrides = false;
  let hasHouseOverrides = false;

  for (const year of FORECAST_YEARS) {
    const override = overrides?.[normTicker]?.[year];
    const houseOverride = houseOverrides?.[normTicker]?.[year];
    let price: number;
    if (typeof override === "number" && override > 0) {
      price = override;
      targetedYears[year] = true;
      houseTargetedYears[year] = false;
      hasOverrides = true;
    } else if (typeof houseOverride === "number" && houseOverride > 0) {
      price = houseOverride;
      targetedYears[year] = false;
      houseTargetedYears[year] = true;
      hasHouseOverrides = true;
    } else {
      price = fallback[year] ?? (spot > 0 ? spot : 1);
      targetedYears[year] = false;
      houseTargetedYears[year] = false;
    }
    eoyPrices[year] = price;
    eoyGains[year] = spot > 0 ? safeDiv(price - spot, spot) : 0;
  }

  // Both horizons are positions in the range, never years typed by hand.
  const threeYearPrice = eoyPrices[THREE_YEAR] ?? spot;
  const threeYearGainPct = spot > 0 ? safeDiv(threeYearPrice - spot, spot) : 0;
  const threeYearCagrPct =
    (cagr(spot, threeYearPrice, THREE_YEAR_INDEX + 1) ?? 0) * 100;

  const fiveYearPrice = eoyPrices[FIVE_YEAR] ?? spot;
  const fiveYearGainPct = spot > 0 ? safeDiv(fiveYearPrice - spot, spot) : 0;
  const fiveYearCagrPct =
    (cagr(spot, fiveYearPrice, FIVE_YEAR_INDEX + 1) ?? 0) * 100;

  return {
    ticker: normTicker,
    spot,
    eoyPrices,
    eoyGains,
    targetedYears,
    houseTargetedYears,
    threeYearPrice,
    threeYearGainPct,
    threeYearCagrPct,
    fiveYearPrice,
    fiveYearGainPct,
    fiveYearCagrPct,
    hasHouseOverrides,
    hasOverrides,
  };
}
