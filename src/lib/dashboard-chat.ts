import type { CcChatContext } from "@/lib/ai/cc-advisor";
import type { ForecastPlan } from "@/lib/forecast-plan";
import { loadWatchlist } from "@/lib/watchlist";
import type { PulseCheck } from "@/lib/thesis-pulse";
import type { Holding, Portfolio, PortfolioSnapshot, Quote } from "@/lib/types";

export function bookFingerprint(ps: Portfolio[], hs: Holding[]) {
  return JSON.stringify([
    ps.map((p) => [p.id, p.cash_balance, p.name]),
    hs.map((h) => [
      h.id,
      h.ticker,
      h.shares,
      h.buy_price,
      h.target_call_pct,
      h.stock_target_override,
    ]),
  ]);
}

export function extendedHoursFromQuote(q: Quote | null | undefined) {
  if (!q) {
    return {
      marketState: null as string | null,
      preMarketPrice: null as number | null,
      preMarketChange: null as number | null,
      preMarketChangePercent: null as number | null,
      postMarketPrice: null as number | null,
      postMarketChange: null as number | null,
      postMarketChangePercent: null as number | null,
    };
  }
  return {
    marketState: q.marketState,
    preMarketPrice: q.preMarketPrice,
    preMarketChange: q.preMarketChange,
    preMarketChangePercent: q.preMarketChangePercent,
    postMarketPrice: q.postMarketPrice,
    postMarketChange: q.postMarketChange,
    postMarketChangePercent: q.postMarketChangePercent,
  };
}

export function margusChatContext(input: {
  portfolio: Portfolio | null;
  snapshot: PortfolioSnapshot | null;
  hideOptions: boolean;
  marketState: string | null;
  eurUsd: number | null;
  gbpUsd: number | null;
  convictions: CcChatContext["convictions"];
  pulseByTicker: Record<string, PulseCheck>;
  forecastPlan: ForecastPlan | null;
}): CcChatContext {
  const watchlist = loadWatchlist();
  const {
    portfolio,
    snapshot,
    hideOptions,
    marketState,
    eurUsd,
    gbpUsd,
    convictions,
    pulseByTicker,
    forecastPlan,
  } = input;
  if (!portfolio || !snapshot) {
    return {
      portfolioName: "Your portfolio",
      cashBalance: 0,
      adviseOnly: true,
      hideOptions,
      eurUsd,
      gbpUsd,
      watchlist,
      convictions,
      pulseByTicker,
      forecastPlan: null,
      holdings: [],
      rows: [],
      marketState,
      totals: {
        cost: 0,
        value: 0,
        roiPct: 0,
        roiDollar: 0,
        yield2wAvg: 0,
        premiumTotal: 0,
      },
    };
  }
  return {
    portfolioName: portfolio.name,
    cashBalance: portfolio.cash_balance,
    classroom: Boolean(portfolio.classroom_community_id),
    hideOptions,
    eurUsd,
    gbpUsd,
    watchlist,
    convictions,
    pulseByTicker,
    forecastPlan,
    holdings: snapshot.holdings.map((h) => ({
      ticker: h.ticker,
      shares: h.shares,
      buyPrice: h.buy_price,
      price: h.quote?.price ?? h.buy_price,
      cost: h.buyValue,
      value: h.currentValue,
      roiPct: h.roiPct,
      roiDollar: h.roiDollar,
      pctOfTotal: h.pctOfTotal,
      todayPct: h.quote?.changePercent ?? null,
      ...extendedHoursFromQuote(h.quote),
    })),
    rows: hideOptions
      ? []
      : snapshot.coveredCallRows.map((r) => ({
          ticker: r.holding.ticker,
          spot: r.spot,
          callPct: r.targetCall,
          stockTarget: r.stockTarget,
          distance: r.targetDistance,
          nextStrike: r.nextStrike,
          contracts: r.contracts,
          yield2w: r.yield2w,
          premium: r.premium,
          expiration: r.expiration,
        })),
    marketState,
    totals: {
      cost: snapshot.totals.buyValue,
      value: snapshot.totals.currentValue,
      roiPct: snapshot.totals.roiPct,
      roiDollar: snapshot.totals.roiDollar,
      yield2wAvg: snapshot.totals.yield2wAvg,
      premiumTotal: snapshot.totals.premiumTotal,
    },
  };
}
