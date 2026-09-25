import {
  getYahoo,
  optionChain,
  optionMid,
  type YahooFinanceInstance,
} from "@/lib/market/covered-call";
import { isMarketCircuitOpen } from "@/lib/market/circuit-breaker";
import { realizedVolAnnual } from "@/lib/market/volatility";
import {
  callDelta,
  callPrice,
  impliedVol,
  isPlausibleVol,
  yearsToExpiry,
} from "@/lib/options/black-scholes";
import {
  WATCH_DELTA,
  type ContractReading,
  type RollIdea,
  type TrackedCallStatus,
  type VolSource,
} from "@/lib/options/tracked-calls";
import { dateKeyInTz } from "@/lib/timezone";

/**
 * What the option market says today about one contract a reader has sold
 * or plans to sell: its price, its volatility and its delta.
 *
 * The strike and the expiry are the reader's, so this reads that exact
 * contract off the chain rather than the nearest one the suggestion would
 * pick. The volatility is taken, in order of how much it is worth, from
 * the price being quoted for this contract today, the feed's own figure
 * for it, the nearest listed strike on the same date, and last the share's
 * own recent daily moves. The source travels with the reading, because a
 * delta worked out from a guessed volatility is a different claim from one
 * the market is quoting, and the panel says which.
 */

type Chain = NonNullable<Awaited<ReturnType<typeof optionChain>>>;
type ChainCall = Chain["options"][number]["calls"][number];

const SAME_STRIKE = 0.005;
/** How far past the current expiry a roll is looked for. */
const ROLL_MAX_DAYS_OUT = 90;
/** How many later expiries a roll search prices. Each is one chain call. */
const ROLL_EXPIRIES = 4;

function toKey(d: Date | string): string {
  return dateKeyInTz(typeof d === "string" ? new Date(d) : d);
}

function asDate(d: Date | string): Date {
  return typeof d === "string" ? new Date(d) : d;
}

function midOf(call: ChainCall): number {
  return optionMid(call.bid, call.ask, call.lastPrice);
}

/** Volatility for one listed call: its own quote first, the feed's second. */
function volOf(
  call: ChainCall,
  spot: number,
  years: number
): { vol: number; source: VolSource } | null {
  const mid = midOf(call);
  const solved = mid > 0 ? impliedVol(mid, spot, call.strike, years) : null;
  if (isPlausibleVol(solved)) return { vol: solved, source: "market" };
  if (isPlausibleVol(call.impliedVolatility)) {
    return { vol: call.impliedVolatility, source: "feed" };
  }
  return null;
}

function nearest(calls: readonly ChainCall[], strike: number): ChainCall | null {
  let best: ChainCall | null = null;
  for (const c of calls) {
    if (!c.strike) continue;
    if (!best || Math.abs(c.strike - strike) < Math.abs(best.strike - strike)) best = c;
  }
  return best;
}

export type ContractAsk = {
  id: string;
  ticker: string;
  strike: number;
  expiry: string;
  spot: number;
  status: TrackedCallStatus;
  /** Daily closes, oldest first, for the last-resort volatility. */
  closes?: number[];
};

function historyVol(closes: number[] | undefined): number | null {
  if (!closes || closes.length < 8) return null;
  const v = realizedVolAnnual(closes);
  return isPlausibleVol(v) ? v : null;
}

function fromVol(
  ask: ContractAsk,
  years: number,
  vol: number | null,
  source: VolSource | null
): ContractReading {
  const mid = vol != null ? callPrice(ask.spot, ask.strike, years, vol) : null;
  return {
    id: ask.id,
    ticker: ask.ticker,
    strike: ask.strike,
    expiry: ask.expiry,
    spot: ask.spot,
    mid: mid != null && mid > 0 ? mid : null,
    bid: null,
    ask: null,
    vol,
    volSource: vol != null ? source : null,
    delta: vol != null ? callDelta(ask.spot, ask.strike, years, vol) : null,
    quoted: false,
    roll: null,
    rollSearched: false,
  };
}

export async function readContract(ask: ContractAsk): Promise<ContractReading> {
  const years = yearsToExpiry(ask.expiry);
  if (years == null || !(ask.spot > 0)) return fromVol(ask, 0, null, null);

  if (years <= 0) {
    // At the bell the contract is worth what exercising it is worth.
    return {
      ...fromVol(ask, 0, null, null),
      mid: Math.max(0, ask.spot - ask.strike),
      delta: ask.spot > ask.strike ? 1 : 0,
    };
  }

  const fallback = () => fromVol(ask, years, historyVol(ask.closes), "history");
  if (isMarketCircuitOpen("yahoo")) return fallback();

  try {
    const yf = await getYahoo();
    const top = await optionChain(yf, ask.ticker);
    if (!top) return fallback();
    const expiries = (top.expirationDates ?? []).map(asDate);
    const match = expiries.find((d) => toKey(d) === ask.expiry);
    if (!match) return fallback();
    const chain = await optionChain(yf, ask.ticker, match);
    const calls = (chain?.options?.[0]?.calls ?? []).filter((c) => c.strike > 0);
    if (!calls.length) return fallback();

    const exact = calls.find((c) => Math.abs(c.strike - ask.strike) < SAME_STRIKE);
    let reading: ContractReading;
    if (exact && midOf(exact) > 0) {
      const mid = midOf(exact);
      const v = volOf(exact, ask.spot, years);
      reading = {
        id: ask.id,
        ticker: ask.ticker,
        strike: ask.strike,
        expiry: ask.expiry,
        spot: ask.spot,
        mid,
        bid: exact.bid ?? null,
        ask: exact.ask ?? null,
        vol: v?.vol ?? null,
        volSource: v?.source ?? null,
        delta: v ? callDelta(ask.spot, ask.strike, years, v.vol) : null,
        quoted: true,
        roll: null,
        rollSearched: false,
      };
      if (!v) {
        // A quoted price no volatility explains (a stale print deep in the
        // money): the price is still real, and delta falls back to history.
        const hv = historyVol(ask.closes);
        if (hv != null) {
          reading.vol = hv;
          reading.volSource = "history";
          reading.delta = callDelta(ask.spot, ask.strike, years, hv);
        }
      }
    } else {
      // Not a listed strike, or listed with no quote: borrow the nearest
      // listed strike's volatility, which on one expiry differs by little.
      const near = nearest(
        calls.filter((c) => c !== exact && midOf(c) > 0),
        ask.strike
      );
      const v = near ? volOf(near, ask.spot, years) : null;
      reading = v
        ? fromVol(ask, years, v.vol, "neighbour")
        : fallback();
    }

    if (
      ask.status === "sold" &&
      reading.delta != null &&
      reading.delta >= WATCH_DELTA &&
      reading.mid != null
    ) {
      reading.roll = await findRoll(yf, ask, expiries, reading.mid);
      reading.rollSearched = true;
    }
    return reading;
  } catch (err) {
    console.error(`Contract read failed for ${ask.ticker} ${ask.strike} ${ask.expiry}`, err);
    return fallback();
  }
}

type RollCandidate = RollIdea & { days: number };

/**
 * A roll up and out the chain can fill today, priced at the middle of
 * today's quotes.
 *
 * Preference, in order: the earliest later expiry on which some higher
 * strike pays for its own buyback, and on that expiry the highest such
 * strike, since the point of rolling up is to give the shares more room.
 * Failing that, the same strike further out for a credit. Failing that,
 * the cheapest higher strike, described as costing money, because "there
 * is no roll that pays" is worth knowing too.
 */
async function findRoll(
  yf: YahooFinanceInstance,
  ask: ContractAsk,
  expiries: Date[],
  closeMid: number
): Promise<RollIdea | null> {
  const currentYears = yearsToExpiry(ask.expiry) ?? 0;
  const later = expiries
    .map((d) => ({ d, key: toKey(d) }))
    .filter(({ key }) => key > ask.expiry)
    .map((e) => ({ ...e, years: yearsToExpiry(e.key) ?? 0 }))
    .filter(
      (e) =>
        e.years > currentYears &&
        e.years * 365 <= currentYears * 365 + ROLL_MAX_DAYS_OUT
    )
    .slice(0, ROLL_EXPIRIES);

  let out: RollCandidate | null = null;
  let cheapestDebit: RollCandidate | null = null;

  for (const exp of later) {
    let chain: Awaited<ReturnType<typeof optionChain>>;
    try {
      chain = await optionChain(yf, ask.ticker, exp.d);
    } catch {
      continue;
    }
    const calls = (chain?.options?.[0]?.calls ?? []).filter(
      (c) => c.strike >= ask.strike - SAME_STRIKE && midOf(c) > 0
    );
    let bestUp: RollCandidate | null = null;
    for (const c of calls) {
      const newMid = midOf(c);
      const net = newMid - closeMid;
      const v = volOf(c, ask.spot, exp.years);
      const cand: RollCandidate = {
        strike: c.strike,
        expiry: exp.key,
        newMid,
        closeMid,
        net,
        delta: v ? callDelta(ask.spot, c.strike, exp.years, v.vol) : null,
        kind: c.strike > ask.strike + SAME_STRIKE ? "up-and-out" : "out",
        days: Math.round(exp.years * 365),
      };
      if (cand.kind === "up-and-out") {
        if (net >= 0 && (!bestUp || cand.strike > bestUp.strike)) bestUp = cand;
        if (net < 0 && (!cheapestDebit || net > cheapestDebit.net)) cheapestDebit = cand;
      } else if (net >= 0 && !out) {
        out = cand;
      }
    }
    if (bestUp) return strip(bestUp);
  }
  if (out) return strip(out);
  return cheapestDebit ? strip(cheapestDebit) : null;
}

function strip(c: RollCandidate): RollIdea {
  const { days: _days, ...idea } = c;
  void _days;
  return idea;
}
