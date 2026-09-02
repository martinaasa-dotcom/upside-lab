import { sheetCashBalance } from "@/lib/cash-balance";
import { enrichHoldings } from "@/lib/calculations";
import {
  finiteNumber,
  roundMoney,
  safeDiv,
  sumMoney,
  weightedMean,
} from "@/lib/money";
import type { Holding, Portfolio, Quote } from "@/lib/types";

export const OVERVIEW_TAB_ID = "__overview__";
export const COMPOUND_TAB_ID = "__compound__";
export const LAB_TAB_ID = "__lab__";
export const PULSE_TAB_ID = "__pulse__";
export const SEASONALITY_TAB_ID = "__seasonality__";
/** Mobile-only: the Alerts tab. Not a desktop meta-tab. */
export const ALERTS_TAB_ID = "__alerts__";

export type SheetScore = {
  portfolio: Portfolio;
  buyValue: number;
  equityValue: number;
  totalValue: number;
  roiDollar: number;
  roiPct: number;
  todayDollar: number;
  todayPct: number | null;
  holdingCount: number;
};

/** One row per ticker, rolled up across every portfolio that owns it. */
export type TickerScore = {
  ticker: string;
  portfolios: string[];
  portfolioIds: string[];
  shares: number;
  buyValue: number;
  currentValue: number;
  roiDollar: number;
  roiPct: number;
  todayDollar: number;
  todayPct: number | null;
  price: number;
  sparkline: number[];
};

export type OverviewModel = {
  sheets: SheetScore[];
  tickers: TickerScore[];
  winners: TickerScore[];
  losers: TickerScore[];
  todayWinners: TickerScore[];
  todayLosers: TickerScore[];
  topHoldings: TickerScore[];
  totals: {
    buyValue: number;
    equityValue: number;
    cash: number;
    totalValue: number;
    roiDollar: number;
    roiPct: number;
    todayDollar: number;
    todayPct: number | null;
    sheetCount: number;
    positionCount: number;
    uniqueTickers: number;
  };
};

/**
 * Today's dollar move for a position.
 *
 * The percentage is measured against yesterday's close, so it has to be
 * applied to what the position was worth *then*, not what it's worth now.
 * Multiplying today's value by the percent understates the move by exactly
 * that percent (a -3.4% day on a $125k position came out $150 short), which
 * is why this backs out the prior close first.
 */
export function todayDollarFor(
  currentValue: number,
  changePercent: number | null | undefined
): { dollar: number; pct: number | null } {
  if (
    !Number.isFinite(currentValue) ||
    changePercent === null ||
    changePercent === undefined ||
    !Number.isFinite(changePercent)
  ) {
    return {
      dollar: 0,
      pct: typeof changePercent === "number" && Number.isFinite(changePercent)
        ? changePercent
        : null,
    };
  }
  // A -100% day would mean yesterday's close divides to zero; nothing
  // sensible to report, and the percent still stands on its own.
  if (changePercent <= -1) return { dollar: 0, pct: changePercent };
  const priorValue = currentValue / (1 + changePercent);
  if (!Number.isFinite(priorValue)) return { dollar: 0, pct: changePercent };
  return { dollar: roundMoney(currentValue - priorValue), pct: changePercent };
}

export function buildOverview(
  portfolios: Portfolio[],
  holdings: Holding[],
  quotes: Record<string, Quote>
): OverviewModel {
  const sheets: SheetScore[] = portfolios.map((portfolio) => {
    const rows = holdings.filter((h) => h.portfolio_id === portfolio.id);
    const cash = sheetCashBalance(portfolio);
    const enriched = enrichHoldings(rows, quotes, cash);
    const buyValue = sumMoney(enriched.map((h) => h.buyValue));
    const equityValue = sumMoney(enriched.map((h) => h.currentValue));
    const roiDollar = sumMoney(enriched.map((h) => h.roiDollar));
    const todayMoves = enriched.map((h) =>
      todayDollarFor(h.currentValue, h.quote?.changePercent)
    );
    const todayDollar = sumMoney(todayMoves.map((t) => t.dollar));
    const todayPct = weightedMean(
      enriched.flatMap((h, i) => {
        const pct = todayMoves[i]!.pct;
        if (pct === null) return [];
        return [{ value: pct, weight: h.currentValue }];
      })
    );
    return {
      portfolio,
      buyValue,
      equityValue,
      totalValue: roundMoney(equityValue + cash),
      roiDollar,
      roiPct: safeDiv(roiDollar, buyValue),
      todayDollar,
      todayPct,
      holdingCount: enriched.length,
    };
  });

  const byTicker = new Map<
    string,
    {
      portfolios: Set<string>;
      portfolioIds: Set<string>;
      shares: number;
      buyValue: number;
      currentValue: number;
      roiDollar: number;
      todayDollar: number;
      quote: Quote | null;
    }
  >();

  for (const portfolio of portfolios) {
    const rows = holdings.filter((h) => h.portfolio_id === portfolio.id);
    const enriched = enrichHoldings(rows, quotes, sheetCashBalance(portfolio));
    for (const h of enriched) {
      const key = h.ticker.toUpperCase();
      const existing = byTicker.get(key) ?? {
        portfolios: new Set<string>(),
        portfolioIds: new Set<string>(),
        shares: 0,
        buyValue: 0,
        currentValue: 0,
        roiDollar: 0,
        todayDollar: 0,
        quote: h.quote,
      };
      existing.portfolios.add(portfolio.name);
      existing.portfolioIds.add(portfolio.id);
      existing.shares += finiteNumber(h.shares);
      existing.buyValue = roundMoney(existing.buyValue + h.buyValue);
      existing.currentValue = roundMoney(existing.currentValue + h.currentValue);
      existing.roiDollar = roundMoney(existing.roiDollar + h.roiDollar);
      existing.todayDollar = roundMoney(
        existing.todayDollar +
          todayDollarFor(h.currentValue, h.quote?.changePercent).dollar
      );
      if (h.quote) existing.quote = h.quote;
      byTicker.set(key, existing);
    }
  }

  const tickers: TickerScore[] = [...byTicker.entries()].map(([ticker, row]) => {
    const todayPct = row.quote?.changePercent ?? null;
    return {
      ticker,
      portfolios: [...row.portfolios].sort(),
      portfolioIds: [...row.portfolioIds],
      shares: row.shares,
      buyValue: row.buyValue,
      currentValue: row.currentValue,
      roiDollar: row.roiDollar,
      roiPct: safeDiv(row.roiDollar, row.buyValue),
      todayDollar: row.todayDollar,
      todayPct,
      price:
        row.quote?.price ??
        (row.shares > 0 ? safeDiv(row.currentValue, row.shares) : 0),
      sparkline: row.quote?.sparkline ?? [],
    };
  });

  const byRoi = [...tickers].sort((a, b) => b.roiPct - a.roiPct);
  const byToday = [...tickers]
    .filter((t) => t.todayPct !== null)
    .sort((a, b) => (b.todayPct ?? 0) - (a.todayPct ?? 0));
  const byValue = [...tickers].sort((a, b) => b.currentValue - a.currentValue);

  const buyValue = sumMoney(sheets.map((x) => x.buyValue));
  const equityValue = sumMoney(sheets.map((x) => x.equityValue));
  const cash = sumMoney(portfolios.map((p) => sheetCashBalance(p)));
  const roiDollar = sumMoney(sheets.map((x) => x.roiDollar));
  const todayDollar = sumMoney(sheets.map((x) => x.todayDollar));
  const todayPct = weightedMean(
    tickers.flatMap((t) =>
      t.todayPct !== null ? [{ value: t.todayPct, weight: t.currentValue }] : []
    )
  );

  const totals = {
    buyValue,
    equityValue,
    cash,
    totalValue: roundMoney(equityValue + cash),
    roiDollar,
    roiPct: safeDiv(roiDollar, buyValue),
    todayDollar,
    todayPct,
    sheetCount: portfolios.length,
    positionCount: holdings.length,
    uniqueTickers: tickers.length,
  };

  const sortedSheets = [...sheets].sort((a, b) => b.totalValue - a.totalValue);

  return {
    sheets: sortedSheets,
    tickers: byValue,
    winners: byRoi.filter((t) => t.roiPct > 0).slice(0, 5),
    losers: byRoi.filter((t) => t.roiPct < 0).slice(-5).reverse(),
    todayWinners: byToday.filter((t) => (t.todayPct ?? 0) > 0).slice(0, 5),
    todayLosers: byToday.filter((t) => (t.todayPct ?? 0) < 0).slice(-5).reverse(),
    topHoldings: byValue.slice(0, 10),
    totals,
  };
}
