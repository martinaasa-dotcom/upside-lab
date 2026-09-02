import type { Holding, Quote } from "@/lib/types";
import type { PortfolioEoyOverrides } from "@/lib/forecast-overrides";
import { forecastThemeForTicker, shapedFallbackPath } from "@/lib/forecast-conviction";
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
 * Resolve EOY SP from Margus/manual overrides only.
 * Never use hardcoded house baselines — missing years stay at spot until the model fills them.
 */
function priceForYear(
  ticker: string,
  year: ForecastYear,
  spot: number,
  overrides?: PortfolioEoyOverrides
): { price: number; targeted: boolean } {
  const key = normalizeTickerKey(ticker);
  const override = overrides?.[key]?.[year];
  if (typeof override === "number" && override > 0) {
    return { price: override, targeted: true };
  }
  return { price: spot, targeted: false };
}

/** True when every holding has a positive override for every forecast year. */
export function isForecastFullyCovered(
  tickers: string[],
  overrides?: PortfolioEoyOverrides
): boolean {
  if (!tickers.length) return true;
  for (const ticker of tickers) {
    const key = normalizeTickerKey(ticker);
    const row = overrides?.[key];
    if (!row) return false;
    for (const year of FORECAST_YEARS) {
      const p = row[year];
      if (!(typeof p === "number" && p > 0)) return false;
    }
  }
  return true;
}

export function buildForecast(
  holdings: Holding[],
  quotes: Record<string, Quote>,
  cashBalance: number,
  overrides?: PortfolioEoyOverrides
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
      let targetedCount = 0;
      for (const year of FORECAST_YEARS) {
        const { price, targeted } = priceForYear(
          h.ticker,
          year,
          spot,
          overrides
        );
        if (targeted) targetedCount += 1;
        eoyPrices[year] = price;
        eoyValues[year] = roundMoney(finiteNumber(h.shares) * price);
        targetedYears[year] = targeted;
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
  /** EOY 2028 (3-year horizon from 2026) price */
  threeYearPrice: number;
  threeYearGainPct: number;
  threeYearCagrPct: number;
  /** EOY 2030 (terminal 5-year horizon) price */
  fiveYearPrice: number;
  fiveYearGainPct: number;
  fiveYearCagrPct: number;
  hasOverrides: boolean;
};

/**
 * Resolves the exact forecast path for a single ticker matching the Forecast table.
 * Honors manual/Margus overrides, otherwise falls back to the exact same theme shape.
 */
export function resolveTickerForecastPath(
  ticker: string,
  spot: number,
  overrides?: PortfolioEoyOverrides
): TickerForecastSummary {
  const normTicker = ticker.toUpperCase();
  const theme = forecastThemeForTicker(normTicker);
  const fallback = shapedFallbackPath(spot > 0 ? spot : 1, theme);

  const eoyPrices = {} as Record<ForecastYear, number>;
  const eoyGains = {} as Record<ForecastYear, number>;
  const targetedYears = {} as Record<ForecastYear, boolean>;
  let hasOverrides = false;

  for (const year of FORECAST_YEARS) {
    const override = overrides?.[normTicker]?.[year];
    let price: number;
    if (typeof override === "number" && override > 0) {
      price = override;
      targetedYears[year] = true;
      hasOverrides = true;
    } else {
      price = fallback[year] ?? (spot > 0 ? spot : 1);
      targetedYears[year] = false;
    }
    eoyPrices[year] = price;
    eoyGains[year] = spot > 0 ? safeDiv(price - spot, spot) : 0;
  }

  // 3-year horizon = EOY 2028 (index 2 in FORECAST_YEARS [2026, 2027, 2028, 2029, 2030])
  const threeYearPrice = eoyPrices[2028] ?? eoyPrices[FORECAST_YEARS[2]] ?? spot;
  const threeYearGainPct = spot > 0 ? safeDiv(threeYearPrice - spot, spot) : 0;
  const threeYearCagrPct = (cagr(spot, threeYearPrice, 3) ?? 0) * 100;

  // 5-year terminal horizon = EOY 2030 (index 4)
  const fiveYearPrice =
    eoyPrices[2030] ?? eoyPrices[FORECAST_YEARS[FORECAST_YEARS.length - 1]] ?? spot;
  const fiveYearGainPct = spot > 0 ? safeDiv(fiveYearPrice - spot, spot) : 0;
  const fiveYearCagrPct = (cagr(spot, fiveYearPrice, 5) ?? 0) * 100;

  return {
    ticker: normTicker,
    spot,
    eoyPrices,
    eoyGains,
    targetedYears,
    threeYearPrice,
    threeYearGainPct,
    threeYearCagrPct,
    fiveYearPrice,
    fiveYearGainPct,
    fiveYearCagrPct,
    hasOverrides,
  };
}
