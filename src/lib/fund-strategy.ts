/**
 * Upside Fund's rules, written as code rather than as a prompt.
 *
 * The first version of the Fund was a language model asked, once a day,
 * whether it wanted to do anything, under a prompt that told it most days
 * the answer should be no. It said no. What it was never shown was the one
 * thing a swing strategy runs on, the shape of each price over the last
 * year, so it could not have found a company at a local low if it had
 * wanted to.
 *
 * So the decisions are arithmetic now, the same arithmetic every day, and
 * the model only writes about them. That keeps the Fund's promise honest in
 * a way a prompt cannot: every buy and every sell carries the figures that
 * triggered it, and a reader can check each one against a chart.
 *
 * The strategy in one paragraph. Own companies that are leading the market
 * (in a long uptrend and ahead of the Nasdaq 100 over six months), and buy
 * them when they have pulled back to a short-term low and just turned up.
 * Sell into strength when they are overbought, half first and the rest on
 * the second push. Cut anything that breaks its stop, loses its long-term
 * trend, or has gone nowhere for three months. Nothing is held past twelve
 * months. Money waiting for the next setup sits in the Nasdaq 100 itself
 * rather than in cash, so a quiet month tracks the benchmark rather than
 * falling behind it, and when the Nasdaq 100 itself is in a downtrend the
 * Fund holds fewer, stronger names and keeps the rest in cash.
 *
 * Nothing here is advice, and nothing here knows the future: a rule that
 * worked on the past is a rule that worked on the past.
 */

import { rsi, sma } from "@/lib/market/indicators";

/** The benchmark, and where uninvested money waits. */
export const FUND_BENCHMARK = "QQQ";

/**
 * Companies the Fund may own: the largest, most traded listings across
 * the market, so a daily close is always a real price. A list of listings,
 * not of opinions, the same argument `research/universe.ts` makes.
 */
export const FUND_UNIVERSE: readonly string[] = [
  // Chips and hardware
  "NVDA", "AMD", "AVGO", "TSM", "MU", "QCOM", "AMAT", "LRCX", "KLAC", "ASML",
  "ANET", "SMCI", "ARM", "MRVL",
  // Software and internet
  "MSFT", "GOOGL", "META", "AMZN", "AAPL", "NFLX", "ORCL", "CRM", "ADBE",
  "NOW", "PLTR", "SHOP", "UBER", "CRWD", "PANW", "DDOG", "NET", "INTU",
  "APP", "MELI", "BKNG", "SPOT",
  // Consumer
  "TSLA", "COST", "WMT", "HD", "LULU", "CMG", "MCD", "NKE",
  // Money
  "JPM", "GS", "V", "MA", "AXP", "COIN",
  // Health
  "LLY", "UNH", "ISRG", "VRTX", "ABBV",
  // Industry and power
  "CAT", "DE", "GE", "HON", "RTX", "LMT", "VST", "CEG", "ETN",
  // Energy
  "XOM", "CVX",
];

/** Every number the rules use, in one place, each with its reason. */
export const FUND_RULES = {
  /** How many companies at most, so one mistake is a tenth of the fund. */
  maxPositions: 10,
  /** Each new holding's target size, as a share of the fund. */
  positionSize: 0.1,
  /** A holding is never allowed to grow past this before it is trimmed. */
  maxPositionSize: 0.2,
  /** Long-term trend: the price must be above this many days' average. */
  trendDays: 200,
  /** Leadership: return over this many days, against the benchmark's. */
  strengthDays: 126,
  /** Short-term low: RSI(14) at or under this in the last few days. */
  oversoldRsi: 40,
  /** ...within this many days, and turning up today. */
  oversoldLookback: 3,
  /** Overbought: sell half here. */
  overboughtRsi: 75,
  /** Stretched: price this far above its 50-day average also counts. */
  stretchedAbove50: 0.18,
  /**
   * Stop: this many typical daily moves under the entry, bounded. Wide on
   * purpose: measured over 2019-2023, stops of 7-15% sold volatile leaders
   * on ordinary noise (180 stop-outs in 917 trades) and 12-25% kept the
   * same names through the dip they were bought for.
   */
  stopMoves: 4,
  minStop: 0.12,
  maxStop: 0.25,
  /** After a gain this large the stop trails the highest close. */
  trailAfter: 0.15,
  trailMoves: 3,
  /** A holding under water after this many trading days is cut. */
  staleDays: 63,
  /** Nothing is held past this many trading days (about twelve months). */
  maxHoldDays: 252,
  /** The long trend counts as broken this far under the 200-day average. */
  trendBreakBelow: 0.97,
  /**
   * A leader must be at least this far ahead of the Nasdaq 100 over the
   * strength window. This is the rule that decided whether the Fund beat
   * the benchmark at all: with no bar it matched QQQ over seven years and
   * lost to it over 2024-2026, and every bar from 5% up beat it on both
   * the years it was tuned on and the years it never saw. 20% is the
   * middle of that plateau, not its best-looking edge.
   */
  minStrength: 0.2,
  /** Sell the rest on a second overbought push, or keep riding the trail. */
  sellRestOnSecondPush: true,
  /** In a Nasdaq downtrend at most this much of the fund is in companies. */
  riskOffExposure: 0.4,
  /** A trade costs this much each way, so the backtest is not free. */
  costPerTrade: 0.0005,
};

export type FundRules = typeof FUND_RULES;
const DEFAULT_RULES: FundRules = FUND_RULES;

export type TickerRead = {
  ticker: string;
  price: number;
  /** Average of the last 50 and 200 closes. */
  sma50: number;
  sma200: number;
  rsi: number;
  rsiPrev: number;
  /** Lowest RSI over the last few days. */
  rsiLow: number;
  /** Return over the strength window, minus the benchmark's. */
  strength: number;
  /** Typical daily move, as a fraction: mean absolute daily return. */
  dailyMove: number;
};

/**
 * Everything the rules need about one company, from its closes alone.
 * Null when there is not a year of history, because a trend cannot be read
 * off less.
 */
export function readTicker(
  ticker: string,
  closes: number[],
  benchCloses: number[],
  R: FundRules = FUND_RULES
): TickerRead | null {
  const FUND_RULES = R;
  const n = closes.length;
  if (n < FUND_RULES.trendDays + 5) return null;
  const window = closes.slice(-(FUND_RULES.trendDays + 30));
  const s50 = sma(window, 50);
  const s200 = sma(window, FUND_RULES.trendDays);
  const r = rsi(window, 14);
  const last = window.length - 1;
  const price = window[last]!;
  const sma50v = s50[last];
  const sma200v = s200[last];
  const rsiNow = r[last];
  const rsiPrev = r[last - 1];
  if (sma50v == null || sma200v == null || rsiNow == null || rsiPrev == null)
    return null;
  let rsiLow = rsiNow;
  for (let k = 1; k < FUND_RULES.oversoldLookback; k += 1) {
    const v = r[last - k];
    if (v != null && v < rsiLow) rsiLow = v;
  }
  const back = FUND_RULES.strengthDays;
  const ret = (xs: number[]) =>
    xs.length > back ? xs[xs.length - 1]! / xs[xs.length - 1 - back]! - 1 : 0;
  const strength = ret(closes) - ret(benchCloses);
  let moves = 0;
  for (let k = last - 19; k <= last; k += 1) {
    moves += Math.abs(window[k]! / window[k - 1]! - 1);
  }
  return {
    ticker,
    price,
    sma50: sma50v,
    sma200: sma200v,
    rsi: rsiNow,
    rsiPrev,
    rsiLow,
    strength,
    dailyMove: moves / 20,
  };
}

/** Is the Nasdaq 100 itself in a long uptrend? */
export function marketIsUp(bench: TickerRead | null): boolean {
  return bench == null ? true : bench.price > bench.sma200;
}

export type FundPosition = {
  ticker: string;
  shares: number;
  /** Average price paid. */
  entryPrice: number;
  /** Trading days held. */
  daysHeld: number;
  /** Highest close since it was bought. */
  peak: number;
  /** Half has already been sold into strength. */
  trimmed: boolean;
};

export type FundOrder = {
  side: "buy" | "sell";
  ticker: string;
  /** Shares to trade; fractional is fine, it is a paper fund. */
  shares: number;
  price: number;
  /** Short machine name for the rule that fired. */
  rule:
    | "entry"
    | "take-half"
    | "take-rest"
    | "stop"
    | "trail"
    | "trend-break"
    | "stale"
    | "time"
    | "oversize"
    | "park"
    | "unpark";
  /** One plain sentence, with the figures, a reader can check. */
  why: string;
};

/** Where this holding's stop sits, as a price. */
export function stopPrice(
  pos: FundPosition,
  read: TickerRead,
  FUND_RULES: FundRules = DEFAULT_RULES
): number {
  const width = Math.min(
    FUND_RULES.maxStop,
    Math.max(FUND_RULES.minStop, FUND_RULES.stopMoves * read.dailyMove)
  );
  const fixed = pos.entryPrice * (1 - width);
  if (pos.peak >= pos.entryPrice * (1 + FUND_RULES.trailAfter)) {
    const trail = pos.peak * (1 - FUND_RULES.trailMoves * read.dailyMove);
    return Math.max(fixed, trail);
  }
  return fixed;
}

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
const usd = (x: number) =>
  `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Why a company qualifies as a buy today, or null. */
export function entrySignal(
  read: TickerRead,
  FUND_RULES: FundRules = DEFAULT_RULES
): string | null {
  if (!(read.price > read.sma200)) return null;
  if (!(read.strength > FUND_RULES.minStrength)) return null;
  if (!(read.rsiLow <= FUND_RULES.oversoldRsi)) return null;
  if (!(read.rsi > read.rsiPrev)) return null;
  return `Above its 200-day average (${usd(read.sma200)}) and ${pct(read.strength)} ahead of the Nasdaq 100 over six months, it pulled back to an RSI of ${read.rsiLow.toFixed(0)} and turned up.`;
}

/** Rank for choosing between qualifying names: leadership first, depth of dip second. */
function entryScore(read: TickerRead, FUND_RULES: FundRules): number {
  return read.strength + (FUND_RULES.oversoldRsi - read.rsiLow) / 100;
}

/**
 * Today's trades.
 *
 * Sells first, then buys with what is free, then whatever is still free is
 * parked in the benchmark (or taken back out of it to pay for a buy). The
 * order matters: a sell on the same day as a buy funds it.
 */
export function planTrades(input: {
  cash: number;
  /** Shares of the benchmark held as parked money. */
  parkedShares: number;
  positions: FundPosition[];
  reads: Record<string, TickerRead>;
  bench: TickerRead | null;
  rules?: FundRules;
}): FundOrder[] {
  const R = input.rules ?? FUND_RULES;
  const orders: FundOrder[] = [];
  const benchPrice = input.bench?.price ?? 0;
  const held = new Map(input.positions.map((p) => [p.ticker, { ...p }]));

  const positionsValue = () =>
    [...held.values()].reduce(
      (s, p) => s + p.shares * (input.reads[p.ticker]?.price ?? p.entryPrice),
      0
    );
  const nav =
    input.cash + input.parkedShares * benchPrice + positionsValue();

  let freeCash = input.cash;
  let parked = input.parkedShares;

  // 1. Sells.
  for (const pos of [...held.values()]) {
    const read = input.reads[pos.ticker];
    if (!read) continue;
    const gain = read.price / pos.entryPrice - 1;
    const stop = stopPrice(pos, read, R);
    const sellAll = (rule: FundOrder["rule"], why: string) => {
      orders.push({ side: "sell", ticker: pos.ticker, shares: pos.shares, price: read.price, rule, why });
      freeCash += pos.shares * read.price * (1 - R.costPerTrade);
      held.delete(pos.ticker);
    };

    if (read.price <= stop) {
      const trailing = pos.peak >= pos.entryPrice * (1 + R.trailAfter);
      sellAll(
        trailing ? "trail" : "stop",
        trailing
          ? `Fell to ${usd(read.price)}, through its trailing stop at ${usd(stop)} under the high of ${usd(pos.peak)}. Selling with ${pct(gain)} kept.`
          : `Fell to ${usd(read.price)}, through its stop at ${usd(stop)}. The dip kept going, so the plan did not work, and it is cut at ${pct(gain)}.`
      );
      continue;
    }
    if (read.price < read.sma200 * R.trendBreakBelow) {
      sellAll(
        "trend-break",
        `Closed at ${usd(read.price)}, more than 3% under its 200-day average of ${usd(read.sma200)}. The long uptrend it was bought for has broken, at ${pct(gain)}.`
      );
      continue;
    }
    if (pos.daysHeld >= R.maxHoldDays) {
      sellAll("time", `Held for twelve months, the longest this fund holds anything, at ${pct(gain)}.`);
      continue;
    }
    if (pos.daysHeld >= R.staleDays && gain < 0) {
      sellAll(
        "stale",
        `Three months in and still ${pct(gain)} under what was paid. The money is worth more in a setup that is working.`
      );
      continue;
    }
    const stretched = read.price > read.sma50 * (1 + R.stretchedAbove50);
    const overbought = read.rsi >= R.overboughtRsi || stretched;
    if (overbought && gain > 0) {
      const reason = read.rsi >= R.overboughtRsi
        ? `RSI of ${read.rsi.toFixed(0)}`
        : `${pct(read.price / read.sma50 - 1)} above its 50-day average`;
      if (!pos.trimmed) {
        const half = pos.shares / 2;
        orders.push({
          side: "sell", ticker: pos.ticker, shares: half, price: read.price, rule: "take-half",
          why: `Overbought (${reason}) at ${usd(read.price)}, ${pct(gain)} over what was paid. Selling half and letting the rest run.`,
        });
        freeCash += half * read.price * (1 - R.costPerTrade);
        pos.shares -= half;
        pos.trimmed = true;
        held.set(pos.ticker, pos);
      } else if (R.sellRestOnSecondPush && read.rsi >= R.overboughtRsi) {
        sellAll(
          "take-rest",
          `Overbought again (${reason}) at ${usd(read.price)}. Selling the rest, ${pct(gain)} over what was paid.`
        );
      }
      continue;
    }
    const value = pos.shares * read.price;
    if (nav > 0 && value > nav * R.maxPositionSize) {
      const excess = (value - nav * R.positionSize) / read.price;
      orders.push({
        side: "sell", ticker: pos.ticker, shares: excess, price: read.price, rule: "oversize",
        why: `Grown to ${pct(value / nav, 0)} of the fund. Selling back to ${pct(R.positionSize, 0)} so one company cannot decide the year.`,
      });
      freeCash += excess * read.price * (1 - R.costPerTrade);
      pos.shares -= excess;
      held.set(pos.ticker, pos);
    }
  }

  // 2. Buys.
  const riskOn = marketIsUp(input.bench);
  const maxExposure = riskOn ? 1 : R.riskOffExposure;
  const candidates = Object.values(input.reads)
    .filter((r) => !held.has(r.ticker) && r.ticker !== FUND_BENCHMARK)
    .filter((r) => entrySignal(r, R) != null)
    .sort((a, b) => entryScore(b, R) - entryScore(a, R));

  const available = () => freeCash + parked * benchPrice;
  for (const read of candidates) {
    if (held.size >= R.maxPositions) break;
    const invested = positionsValue();
    const room = nav * maxExposure - invested;
    const size = Math.min(nav * R.positionSize, room, available() * 0.999);
    if (size < nav * 0.02) break;
    // Pay for it from cash first, then by taking money out of the park.
    if (freeCash < size && benchPrice > 0) {
      const need = size - freeCash;
      const sellParked = Math.min(parked, need / (benchPrice * (1 - R.costPerTrade)));
      if (sellParked > 0) {
        orders.push({
          side: "sell", ticker: FUND_BENCHMARK, shares: sellParked, price: benchPrice, rule: "unpark",
          why: `Taking waiting money out of the Nasdaq 100 to pay for ${read.ticker}.`,
        });
        parked -= sellParked;
        freeCash += sellParked * benchPrice * (1 - R.costPerTrade);
      }
    }
    const spend = Math.min(size, freeCash);
    const shares = (spend * (1 - R.costPerTrade)) / read.price;
    orders.push({
      side: "buy", ticker: read.ticker, shares, price: read.price, rule: "entry",
      why: entrySignal(read, R)!,
    });
    freeCash -= spend;
    held.set(read.ticker, {
      ticker: read.ticker, shares, entryPrice: read.price, daysHeld: 0, peak: read.price, trimmed: false,
    });
  }

  // 3. Park what is still free in the benchmark while it is trending up;
  //    take it out entirely when it is not.
  if (benchPrice > 0) {
    if (riskOn && freeCash > nav * 0.01) {
      const shares = (freeCash * (1 - R.costPerTrade)) / benchPrice;
      orders.push({
        side: "buy", ticker: FUND_BENCHMARK, shares, price: benchPrice, rule: "park",
        why: "Money waiting for the next setup goes into the Nasdaq 100 rather than sitting in cash.",
      });
    } else if (!riskOn && parked > 0) {
      orders.push({
        side: "sell", ticker: FUND_BENCHMARK, shares: parked, price: benchPrice, rule: "unpark",
        why: `The Nasdaq 100 closed under its 200-day average (${usd(input.bench!.sma200)}), so waiting money moves back to cash.`,
      });
    }
  }
  return orders;
}
