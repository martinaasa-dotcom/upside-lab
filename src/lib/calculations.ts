import { sheetCashBalance } from "@/lib/cash-balance";
import { isCoinSymbol } from "@/lib/coins";
import { nextStrikeFromTarget, resolveStockTarget } from "@/lib/market/resistance";
import { repriceCandidate } from "@/lib/options/reprice";
import { finiteNumber, mean, roundMoney, safeDiv, sumMoney } from "@/lib/money";
import type {
  CoveredCallRow,
  EnrichedHolding,
  Holding,
  OptionCandidate,
  Portfolio,
  PortfolioSnapshot,
  Quote,
} from "./types";

export function enrichHoldings(
  holdings: Holding[],
  quotes: Record<string, Quote>,
  cashBalance: number
): EnrichedHolding[] {
  const withValues = holdings.map((h) => {
    const quote = quotes[h.ticker] ?? null;
    const price = Number.isFinite(quote?.price) ? quote!.price : h.buy_price;
    const buyValue = roundMoney(h.shares * h.buy_price);
    const currentValue = roundMoney(h.shares * price);
    const roiDollar = roundMoney(currentValue - buyValue);
    const roiPct = safeDiv(price - h.buy_price, h.buy_price);
    return {
      ...h,
      quote,
      buyValue,
      currentValue,
      roiPct,
      roiDollar,
      pctOfTotal: 0,
    };
  });

  const equityTotal = sumMoney(withValues.map((h) => h.currentValue));
  const total = roundMoney(equityTotal + finiteNumber(cashBalance));

  return withValues.map((h) => ({
    ...h,
    pctOfTotal: safeDiv(h.currentValue, total),
  }));
}

/** Always 1 contract per 100 shares */
export function contractsFromShares(shares: number): number {
  return Math.max(0, Math.floor(shares / 100));
}

export function buildCoveredCallRows(
  holdings: Holding[],
  quotes: Record<string, Quote>,
  optionsByTicker: Record<string, OptionCandidate | null>,
  /** The expiry the reader picked per holding, before the scan has priced it. */
  expiryByHolding: Record<string, string | null> = {}
): CoveredCallRow[] {
  return holdings
    .filter((holding) => !isCoinSymbol(holding.ticker))
    .map((holding) => {
    const quote = quotes[holding.ticker];
    const spot = finiteNumber(quote?.price ?? holding.buy_price);
    const totalValue = roundMoney(holding.shares * spot);
    const scanned = optionsByTicker[holding.ticker] ?? null;
    const contracts = contractsFromShares(holding.shares);

    const history = quote?.sparkline?.length
      ? quote.sparkline
      : [spot * 0.92, spot * 0.97, spot, spot * 1.05, spot * 1.1];

    // Stock target = manual override, else next resistance above spot
    const modeled = resolveStockTarget(spot, history);
    const stockTarget =
      holding.stock_target_override != null && holding.stock_target_override > 0
        ? holding.stock_target_override
        : modeled;

    // Next strike = Call % away from stock target
    const nextStrike =
      stockTarget > 0
        ? nextStrikeFromTarget(stockTarget, holding.target_call_pct)
        : null;

    // An edited strike or expiry is priced at once from the last scan's
    // volatility, and the scan that follows replaces it with the market's.
    const wantExpiry =
      expiryByHolding[holding.id] ?? scanned?.expiration ?? null;
    const option =
      scanned && nextStrike && wantExpiry && contracts > 0
        ? repriceCandidate(scanned, {
            spot,
            strike: nextStrike,
            expiry: wantExpiry,
            contracts,
          })
        : scanned;

    // Distance = spot → stock target (not the same as Call %)
    const targetDistance =
      spot > 0 && stockTarget > 0 ? safeDiv(stockTarget - spot, spot) : null;

    const premium =
      option && contracts > 0
        ? roundMoney(option.mid * 100 * contracts)
        : null;

    return {
      holding,
      spot,
      totalValue,
      yield3w: option?.yield3w ?? null,
      premium,
      targetCall: holding.target_call_pct,
      stockTarget: stockTarget || null,
      targetDistance,
      nextStrike,
      expiration: option?.expiration ?? wantExpiry,
      contracts,
      option,
    };
  });
}

export function buildSnapshot(
  portfolio: Portfolio,
  holdings: Holding[],
  quotes: Record<string, Quote>,
  optionsByTicker: Record<string, OptionCandidate | null>,
  expiryByHolding: Record<string, string | null> = {}
): PortfolioSnapshot {
  // Default sort: largest % of total first
  const cash = sheetCashBalance(portfolio);
  const enriched = enrichHoldings(holdings, quotes, cash).sort(
    (a, b) => b.pctOfTotal - a.pctOfTotal
  );

  // CC table follows the same order
  const holdingsInViewOrder = enriched.map(
    (e) => holdings.find((h) => h.id === e.id)!
  );
  const coveredCallRows = buildCoveredCallRows(
    holdingsInViewOrder,
    quotes,
    optionsByTicker,
    expiryByHolding
  );

  const buyValue = sumMoney(enriched.map((h) => h.buyValue));
  const currentValue = roundMoney(
    sumMoney(enriched.map((h) => h.currentValue)) +
      cash
  );
  // Cost-weighted portfolio return: Σ(P&L) / Σ(cost) — not a simple average of row ROI%
  const roiDollar = sumMoney(enriched.map((h) => h.roiDollar));
  const roiPct = safeDiv(roiDollar, buyValue);
  const premiumTotal = sumMoney(coveredCallRows.map((r) => r.premium ?? 0));
  const yield3wAvg = mean(
    coveredCallRows
      .map((r) => r.yield3w)
      .filter((v): v is number => v !== null && Number.isFinite(v))
  );

  return {
    portfolio,
    holdings: enriched,
    coveredCallRows,
    totals: {
      buyValue,
      currentValue,
      roiDollar,
      roiPct,
      yield3wAvg,
      premiumTotal,
      unrealizedProfits: roiDollar,
    },
  };
}

export const STRATEGY = {
  /**
   * Call % is volatility-scaled (not a flat safety default).
   * Soft floors/ceilings for proposals; AI must still pick per-ticker.
   */
  callPctSafeMin: 0.05,
  callPctSafeMax: 0.08,
  callPctMid: 0.14,
  callPctHighBeta: 0.2,
  callPctMax: 0.28,
  /** Soft starting Call % only when vol is unknown */
  defaultCallPct: 0.14,
  /**
   * The default expiry is the first listed date at least this many days
   * out, never nearer (`defaultExpiryFrom`). A call a few days short of
   * three weeks pays for fewer days than the 3-week column prices it
   * against and gives the shares less room, so the rule rounds up to the
   * next listed date rather than to the nearest one.
   */
  minDaysToExpiry: 21,
  /** Kept equal to the floor: the tenor the estimate and the yield scale on. */
  targetDays: 21,
  /**
   * How far ahead the write plan lists expiries. Wide enough that a chain
   * listing only monthly dates still has one past the three-week floor,
   * so the rule never has to fall back to a nearer date.
   */
  maxDaysExtended: 60,
  targetYield: 0.05,
  minYield: 0.03,
  /*
    A fact about the venue, in the venue's own time.

    This used to read "16:45 to 18:00 EEST", which is one reader's clock and
    wrong for most of the year even for him: Estonia is on EET from late
    October to late March, and for the three or four weeks a year when the
    EU and the US change clocks on different weekends the instant is wrong
    too, because the New York open moves under it. It is printed to every
    reader and handed to the model as a rule, and a reader in London or
    Chicago was being told to place an order at a time that means nothing
    where they are.

    New York time is the honest form: the window is defined by the opening
    bell, so it is fixed against the exchange and only ever needs converting
    once, by whoever is reading it.
  */
  executionWindow: "09:45 to 11:00 in New York",
} as const;

