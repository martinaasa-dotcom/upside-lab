import { isCoinSymbol } from "@/lib/coins";
import { STRATEGY } from "@/lib/calculations";
import {
  findLocalHighs,
  nextStrikeFromTarget,
  roundToStrike,
} from "@/lib/market/resistance";
import { fetchNextEarningsDate, resolveYahooListedSymbol } from "@/lib/market/yahoo";
import { dateKeyInTz, daysUntilInTz } from "@/lib/timezone";
import { isMarketCircuitOpen, withMarketCircuit } from "@/lib/market/circuit-breaker";
import { isPlausiblePrice, yahooQuotePayloadSchema } from "@/lib/market/quote-sanitize";
import { realizedVolAnnual } from "@/lib/market/volatility";

type YahooFinanceInstance = InstanceType<
  typeof import("yahoo-finance2").default
>;

let yahoo: YahooFinanceInstance | null = null;

async function getYahoo(): Promise<YahooFinanceInstance> {
  if (yahoo) return yahoo;
  const { default: YahooFinance } = await import("yahoo-finance2");
  yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  return yahoo;
}

export type LocalHighLevel = {
  price: number;
  distancePct: number;
};

export type WritePlan = {
  ticker: string;
  spot: number;
  shares: number;
  contracts: number;
  localHighs: LocalHighLevel[];
  recommendedStockTarget: number;
  stockTargetReason: string;
  earningsDate: string | null;
  daysToEarnings: number | null;
  earningsNote: string;
  recommendedCallPct: number;
  callPctReason: string;
  recommendedExpiration: string;
  daysToExpiry: number;
  expiryReason: string;
  nextStrike: number;
  strikeOtmPct: number;
  estimatedPremiumPerShare: number | null;
  estimatedYield: number | null;
  estimatedPremiumTotal: number | null;
  yieldSource: "live_option" | "estimate";
  writeNow: boolean;
  summary: string;
};

function mid(bid?: number | null, ask?: number | null, last?: number | null) {
  const b = bid ?? 0;
  const a = ask ?? 0;
  const l = last ?? 0;
  if (b > 0 && a > 0) {
    const m = (b + a) / 2;
    const spreadPct = (a - b) / m;
    if (spreadPct > 0.45 && l > 0 && l >= b * 0.25 && l <= a * 1.75) {
      return l;
    }
    return m;
  }
  return l || b || a || 0;
}

function toDateKey(d: Date | string): string {
  return dateKeyInTz(d);
}

/** Local highs above spot, nearest first */
export function listLocalHighsAboveSpot(
  spot: number,
  priceHistory: number[],
  limit = 5
): LocalHighLevel[] {
  if (!spot || spot <= 0) return [];
  const highs = findLocalHighs(priceHistory)
    .filter((h) => h > spot * 1.01)
    .sort((a, b) => a - b);

  const unique: number[] = [];
  for (const h of highs) {
    const rounded = roundToStrike(h);
    if (!unique.some((u) => Math.abs(u - rounded) / spot < 0.015)) {
      unique.push(rounded);
    }
  }

  return unique.slice(0, limit).map((price) => ({
    price,
    distancePct: (price - spot) / spot,
  }));
}

async function fetchSpotAndHistory(ticker: string): Promise<{
  spot: number;
  history: number[];
} | null> {
  if (isMarketCircuitOpen("yahoo")) return null;
  try {
    const yf = await getYahoo();
    const period1 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const symbol = (await resolveYahooListedSymbol(ticker)) ?? ticker;
    const [quoteRaw, chart] = await Promise.all([
      withMarketCircuit("yahoo", () => yf.quote(symbol)),
      yf.chart(symbol, { period1, interval: "1d" }).catch(() => null),
    ]);
    const parsed = yahooQuotePayloadSchema.safeParse(quoteRaw);
    if (!parsed.success) return null;
    const quote = parsed.data;
    // Same fix as fetchQuotesYahoo: regularMarketPrice is stale (last
    // regular-session trade) through an active pre/post-market window —
    // strike/target math has to be grounded in the actually-current price.
    const state = (
      typeof quote.marketState === "string" ? quote.marketState : ""
    ).toUpperCase();
    const rawRegular =
      typeof quote.regularMarketPrice === "number" && quote.regularMarketPrice > 0
        ? quote.regularMarketPrice
        : null;
    const rawPost =
      typeof quote.postMarketPrice === "number" && quote.postMarketPrice > 0
        ? quote.postMarketPrice
        : null;
    const rawPre =
      typeof quote.preMarketPrice === "number" && quote.preMarketPrice > 0
        ? quote.preMarketPrice
        : null;
    const spot =
      (state === "POST" || state === "POSTPOST") && rawPost
        ? rawPost
        : (state === "PRE" || state === "PREPRE") && rawPre
          ? rawPre
          : rawRegular ?? rawPost ?? rawPre ?? 0;
    if (!spot || !isPlausiblePrice(spot)) return null;
    const history =
      chart?.quotes && chart.quotes.length > 1
        ? chart.quotes
            .map((row) => row.close)
            .filter((c): c is number => typeof c === "number" && isPlausiblePrice(c))
        : [spot * 0.92, spot * 0.97, spot, spot * 1.05, spot * 1.1];
    return { spot, history };
  } catch (err) {
    console.error(`Spot/history failed for ${ticker}`, err);
    return null;
  }
}

type ExpCandidate = { exp: Date; days: number; key: string };

async function listExpirations(ticker: string): Promise<ExpCandidate[]> {
  if (isMarketCircuitOpen("yahoo")) return [];
  const yf = await getYahoo();
  const chain = await withMarketCircuit("yahoo", () => yf.options(ticker));
  return (chain.expirationDates ?? [])
    .map((d: Date | string) => {
      const exp = typeof d === "string" ? new Date(d) : d;
      return {
        exp,
        days: daysUntilInTz(exp),
        key: toDateKey(exp),
      };
    })
    .filter((e) => e.days >= 7 && e.days <= STRATEGY.maxDaysExtended)
    .sort((a, b) => a.days - b.days);
}

function pickExpiry(
  expirations: ExpCandidate[],
  daysToEarnings: number | null
): { pick: ExpCandidate | null; reason: string; writeNow: boolean } {
  if (!expirations.length) {
    return {
      pick: null,
      reason: "No listed expiries in the 1 to 6 week window.",
      writeNow: false,
    };
  }

  const preferred = expirations.filter(
    (e) =>
      e.days >= STRATEGY.minDaysPreferred &&
      e.days <= STRATEGY.maxDaysPreferred
  );

  // Earnings inside preferred window → prefer expire before earnings, else after with note
  if (daysToEarnings != null && daysToEarnings > 0) {
    if (daysToEarnings <= 5) {
      const after = expirations.find((e) => e.days > daysToEarnings + 3);
      return {
        pick: after ?? preferred[0] ?? expirations[0],
        reason: `Earnings in ${daysToEarnings}d, prefer post-earnings expiry (or wait).`,
        writeNow: daysToEarnings > 2,
      };
    }

    const before = [...preferred, ...expirations]
      .filter((e) => e.days < daysToEarnings - 1 && e.days >= 10)
      .sort(
        (a, b) =>
          Math.abs(a.days - STRATEGY.targetDays) -
          Math.abs(b.days - STRATEGY.targetDays)
      )[0];

    if (before) {
      return {
        pick: before,
        reason: `Expire before earnings (${daysToEarnings}d out) to avoid IV crush / gap risk.`,
        writeNow: true,
      };
    }

    const after = expirations.find((e) => e.days > daysToEarnings + 2);
    return {
      pick: after ?? preferred[0] ?? expirations[0],
      reason: `No clean pre-earnings 2 to 3 week expiry, use longer dated past earnings (${daysToEarnings}d).`,
      writeNow: true,
    };
  }

  const ideal =
    preferred.sort(
      (a, b) =>
        Math.abs(a.days - STRATEGY.targetDays) -
        Math.abs(b.days - STRATEGY.targetDays)
    )[0] ?? expirations[0];

  return {
    pick: ideal,
    reason: `Prefer ${STRATEGY.minDaysPreferred} to ${STRATEGY.maxDaysPreferred} day tenor (about 2 to 3 weeks).`,
    writeNow: true,
  };
}

function pickStockTarget(
  spot: number,
  highs: LocalHighLevel[]
): { target: number; reason: string } {
  if (!highs.length) {
    const target = roundToStrike(spot * 1.08);
    return {
      target,
      reason: "No clear local high above spot, use ~8% structural target.",
    };
  }

  // Prefer first high that's at least ~3% up (tradable room), else nearest
  const withRoom = highs.find((h) => h.distancePct >= 0.03) ?? highs[0];
  return {
    target: withRoom.price,
    reason: `Next local high / resistance at $${withRoom.price} (${(withRoom.distancePct * 100).toFixed(1)}% above spot).`,
  };
}

export { realizedVolAnnual } from "@/lib/market/volatility";

/** Map realized HV → Call % baseline (safety buffer scales with vol). */
export function callPctFromVolatility(hvAnnual: number | null): {
  callPct: number;
  bucket: "low" | "mid" | "high" | "unknown";
  reason: string;
} {
  if (hvAnnual == null || !Number.isFinite(hvAnnual) || hvAnnual <= 0) {
    return {
      callPct: STRATEGY.defaultCallPct,
      bucket: "unknown",
      reason: `Vol unknown → start ~${(STRATEGY.defaultCallPct * 100).toFixed(0)}%`,
    };
  }

  const hvPct = hvAnnual * 100;
  let callPct: number;
  let bucket: "low" | "mid" | "high";

  if (hvAnnual < 0.28) {
    // Defensive / low-vol: 5–8%
    const t = Math.min(1, Math.max(0, (hvAnnual - 0.12) / 0.16));
    callPct =
      STRATEGY.callPctSafeMin +
      t * (STRATEGY.callPctSafeMax - STRATEGY.callPctSafeMin);
    bucket = "low";
  } else if (hvAnnual < 0.55) {
    // Typical growth
    const t = (hvAnnual - 0.28) / 0.27;
    callPct =
      STRATEGY.callPctSafeMax +
      t * (STRATEGY.callPctMid - STRATEGY.callPctSafeMax);
    bucket = "mid";
  } else {
    // High-beta / speculative → toward ~20%
    const t = Math.min(1, (hvAnnual - 0.55) / 0.45);
    callPct =
      STRATEGY.callPctMid +
      t * (STRATEGY.callPctHighBeta - STRATEGY.callPctMid);
    bucket = "high";
  }

  callPct = Math.min(
    STRATEGY.callPctHighBeta + 0.02,
    Math.max(STRATEGY.callPctSafeMin, callPct)
  );
  callPct = Math.round(callPct * 200) / 200;

  return {
    callPct,
    bucket,
    reason: `HV~${hvPct.toFixed(0)}% → ${bucket}-vol baseline ${(callPct * 100).toFixed(0)}%`,
  };
}

function pickCallPct(params: {
  ticker: string;
  daysToEarnings: number | null;
  expiryDays: number;
  targetDistance: number;
  priceHistory: number[];
}): { callPct: number; reason: string } {
  const { daysToEarnings, expiryDays, targetDistance, priceHistory } = params;
  const hv = realizedVolAnnual(priceHistory);
  const fromHv = callPctFromVolatility(hv);

  // Purely volatility-driven — scales to whatever ticker the user actually
  // holds instead of a fixed per-name preference, so it works the same for
  // every user's book.
  let pct = fromHv.callPct;
  const notes: string[] = [fromHv.reason];

  // Through-earnings risk → widen Call %
  if (
    daysToEarnings != null &&
    daysToEarnings > 0 &&
    daysToEarnings <= expiryDays
  ) {
    pct = Math.min(STRATEGY.callPctMax, pct + 0.04);
    notes.push(
      `earnings inside window (day ${daysToEarnings}) → widen to ${(pct * 100).toFixed(0)}%`
    );
  } else if (daysToEarnings != null && daysToEarnings < expiryDays + 5) {
    pct = Math.min(STRATEGY.callPctMax, pct + 0.02);
    notes.push("earnings soon after expiry → slightly wider Call %");
  }

  // If stock target already far, tighter Call % so strike isn't unreachable
  if (targetDistance >= 0.12) {
    pct = Math.max(STRATEGY.callPctSafeMin, pct - 0.03);
    notes.push("stock target already ≥12% away → tighter Call %");
  } else if (targetDistance < 0.04) {
    pct = Math.min(STRATEGY.callPctMax, pct + 0.02);
    notes.push("stock target close → slightly wider Call % for premium");
  }

  pct = Math.min(STRATEGY.callPctMax, Math.max(STRATEGY.callPctSafeMin, pct));
  pct = Math.round(pct * 200) / 200;

  return {
    callPct: pct,
    reason: notes.join("; "),
  };
}

async function quoteCallPremium(params: {
  ticker: string;
  exp: Date;
  strike: number;
  spot: number;
}): Promise<{ mid: number; yield: number } | null> {
  if (isMarketCircuitOpen("yahoo")) return null;
  try {
    const yf = await getYahoo();
    const detailed = await withMarketCircuit("yahoo", () =>
      yf.options(params.ticker, { date: params.exp })
    );
    const calls = detailed.options?.[0]?.calls ?? [];
    if (!calls.length) return null;

    let best = calls[0];
    let bestDist = Math.abs((best.strike ?? 0) - params.strike);
    for (const c of calls) {
      const dist = Math.abs((c.strike ?? 0) - params.strike);
      if (dist < bestDist) {
        best = c;
        bestDist = dist;
      }
    }

    const m = mid(best.bid, best.ask, best.lastPrice);
    if (m <= 0 || !params.spot) return null;
    return { mid: m, yield: m / params.spot };
  } catch {
    return null;
  }
}

/** Rough IV-agnostic estimate when chain is empty */
function estimateYield(otmPct: number, days: number): number {
  // Base ~5% for 14d at ~15% OTM from target; scale by tenor and OTM
  const tenor = days / STRATEGY.targetDays;
  const otmFactor = Math.max(0.35, 1 - Math.max(0, otmPct - 0.1) * 1.5);
  return STRATEGY.targetYield * tenor * otmFactor;
}

export async function buildWritePlan(params: {
  ticker: string;
  shares: number;
  spot?: number;
  /** Prefer current table Stock Target (manual override) over auto local-high pick */
  stockTarget?: number | null;
  /** Prefer current table Call % (fraction e.g. 0.18, or whole number 18) */
  callPct?: number | null;
}): Promise<WritePlan> {
  const ticker = params.ticker.toUpperCase();
  const contracts = Math.max(0, Math.floor(params.shares / 100));

  const market = await fetchSpotAndHistory(ticker);
  const spot = params.spot && params.spot > 0 ? params.spot : market?.spot ?? 0;
  const history =
    market?.history ??
    (spot > 0
      ? [spot * 0.92, spot * 0.97, spot, spot * 1.05, spot * 1.1]
      : []);

  const localHighs = listLocalHighsAboveSpot(spot, history);
  const modeled = pickStockTarget(spot, localHighs);

  let target = modeled.target;
  let stockTargetReason = modeled.reason;
  if (params.stockTarget != null && params.stockTarget > 0) {
    target = roundToStrike(params.stockTarget);
    stockTargetReason = `Using current table Stock Target $${target} (not re-picking resistance).`;
  }

  const targetDistance = spot > 0 ? (target - spot) / spot : 0;

  const earningsDate = await fetchNextEarningsDate(ticker);
  const daysToEarnings =
    earningsDate != null ? daysUntilInTz(earningsDate) : null;

  let expirations: ExpCandidate[] = [];
  try {
    expirations = await listExpirations(ticker);
  } catch (err) {
    console.error(`Expirations failed for ${ticker}`, err);
  }

  const {
    pick: expiry,
    reason: expiryReason,
    writeNow,
  } = pickExpiry(expirations, daysToEarnings);

  const daysToExpiry = expiry?.days ?? STRATEGY.targetDays;

  let callPct: number;
  let callPctReason: string;
  const rawCall = params.callPct;
  if (rawCall != null && rawCall > 0) {
    callPct = rawCall > 1 ? rawCall / 100 : rawCall;
    callPct = Math.min(STRATEGY.callPctMax, Math.max(STRATEGY.callPctSafeMin, callPct));
    callPct = Math.round(callPct * 200) / 200;
    callPctReason = `Using current table Call % ${(callPct * 100).toFixed(0)}%.`;
  } else {
    const picked = pickCallPct({
      ticker,
      daysToEarnings,
      expiryDays: daysToExpiry,
      targetDistance,
      priceHistory: history,
    });
    callPct = picked.callPct;
    callPctReason = picked.reason;
  }

  const nextStrike = nextStrikeFromTarget(target, callPct);
  const strikeOtmPct = spot > 0 ? (nextStrike - spot) / spot : 0;

  let estimatedPremiumPerShare: number | null = null;
  let estimatedYield: number | null = null;
  let yieldSource: "live_option" | "estimate" = "estimate";

  if (expiry) {
    const live = await quoteCallPremium({
      ticker,
      exp: expiry.exp,
      strike: nextStrike,
      spot,
    });
    if (live) {
      estimatedPremiumPerShare = live.mid;
      estimatedYield = live.yield;
      yieldSource = "live_option";
    }
  }

  if (estimatedYield == null) {
    estimatedYield = estimateYield(strikeOtmPct, daysToExpiry);
    estimatedPremiumPerShare = spot * estimatedYield;
  }

  const estimatedPremiumTotal =
    estimatedPremiumPerShare != null && contracts > 0
      ? estimatedPremiumPerShare * 100 * contracts
      : null;

  let earningsNote = "No upcoming earnings date found.";
  if (daysToEarnings != null && daysToEarnings >= 0) {
    earningsNote = `Next earnings ~${toDateKey(earningsDate!)} (${daysToEarnings}d).`;
  } else if (daysToEarnings != null && daysToEarnings < 0) {
    earningsNote = "Last reported earnings recently; next date unclear.";
  }

  const summary = [
    `${ticker}: target $${target}, Call ${(callPct * 100).toFixed(1)}%, strike ~$${nextStrike}`,
    `exp ${expiry?.key ?? "n/a"} (${daysToExpiry}d)`,
    estimatedYield != null
      ? `yield ~${(estimatedYield * 100).toFixed(2)}%${yieldSource === "estimate" ? " (est.)" : ""}`
      : "yield n/a",
    writeNow ? "write-eligible" : "consider waiting",
  ].join(" · ");

  return {
    ticker,
    spot,
    shares: params.shares,
    contracts,
    localHighs,
    recommendedStockTarget: target,
    stockTargetReason,
    earningsDate: earningsDate ? toDateKey(earningsDate) : null,
    daysToEarnings,
    earningsNote,
    recommendedCallPct: callPct,
    callPctReason,
    recommendedExpiration: expiry?.key ?? "",
    daysToExpiry,
    expiryReason,
    nextStrike,
    strikeOtmPct,
    estimatedPremiumPerShare,
    estimatedYield,
    estimatedPremiumTotal,
    yieldSource,
    writeNow,
    summary,
  };
}

export async function buildWritePlans(
  positions: Array<{
    ticker: string;
    shares: number;
    spot?: number;
    stockTarget?: number | null;
    callPct?: number | null;
  }>
): Promise<WritePlan[]> {
  const plans: WritePlan[] = [];
  for (const p of positions) {
    if (isCoinSymbol(p.ticker)) continue;
    // Sequential to avoid Yahoo rate limits
    plans.push(await buildWritePlan(p));
  }
  return plans;
}
