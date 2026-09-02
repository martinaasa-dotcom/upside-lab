import type { Holding, Quote } from "@/lib/types";
import type { PortfolioEoyOverrides } from "@/lib/forecast-overrides";
import { forecastThemeForTicker, shapedFallbackPath } from "@/lib/forecast-conviction";
import { cagr, finiteNumber, roundMoney, safeDiv, sumMoney } from "@/lib/money";

/** EOY columns shown after Current: the next 5 years from this one. */
export const FORECAST_YEARS = [2026, 2027, 2028, 2029, 2030] as const;
export type ForecastYear = (typeof FORECAST_YEARS)[number];

/**
 * The two horizons the drawer offers, taken from the range rather than
 * typed beside it.
 *
 * The drawer used to say "End of 2028" and "End of 2030" in its own
 * constants and then read `eoyPrices[2028]` by literal. The range moves,
 * and when it does a literal reads a year that is not in it, so the screen
 * would keep the old heading and show whatever `undefined` falls back to.
 * Naming the positions here means the label and the price it belongs to
 * cannot drift apart, wherever either one is drawn.
 */
export const THREE_YEAR_INDEX = 2;
export const FIVE_YEAR_INDEX = FORECAST_YEARS.length - 1;
export const THREE_YEAR: ForecastYear = FORECAST_YEARS[THREE_YEAR_INDEX];
export const FIVE_YEAR: ForecastYear = FORECAST_YEARS[FIVE_YEAR_INDEX];

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
  /** Price at the end of the third forecast year. */
  threeYearPrice: number;
  threeYearGainPct: number;
  threeYearCagrPct: number;
  /** Price at the end of the last forecast year. */
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
    threeYearPrice,
    threeYearGainPct,
    threeYearCagrPct,
    fiveYearPrice,
    fiveYearGainPct,
    fiveYearCagrPct,
    hasOverrides,
  };
}
