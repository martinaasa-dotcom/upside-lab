import { callDelta, callPrice, yearsToExpiry } from "@/lib/options/black-scholes";
import type { OptionCandidate } from "@/lib/types";

/**
 * The premium column is a rate over three weeks, so two calls to different
 * dates can be compared on one line. A premium of $2 on a $100 share over
 * six weeks is 1% per three weeks, not 2%: the column printed the raw
 * premium over the price for months under a heading that promised a fixed
 * period, which read as the long-dated call paying far better than it did.
 */
export const YIELD_WINDOW_DAYS = 21;

export function threeWeekYield(
  mid: number,
  spot: number,
  daysToExpiry: number
): number {
  if (!(mid > 0) || !(spot > 0)) return 0;
  return (mid / spot) * (YIELD_WINDOW_DAYS / Math.max(1, daysToExpiry));
}

const SAME_STRIKE = 0.005;

/**
 * A scanned call moved to a different strike or expiry before the next
 * scan has answered.
 *
 * The scan takes a round trip to the option chain, and the table used to
 * blank the row's premium and delta for the whole of it, so editing a
 * strike looked like breaking it. The volatility the chain quoted a moment
 * ago moves very little between neighbouring strikes and dates, so the row
 * is priced from it at once and marked `estimated`; the scan then replaces
 * it with the market's own figure. A candidate with no volatility behind it
 * cannot be moved honestly and comes back null, which draws `n/a` until the
 * scan lands rather than the old strike's premium beside the new strike.
 */
export function repriceCandidate(
  option: OptionCandidate,
  want: { spot: number; strike: number; expiry: string; contracts: number }
): OptionCandidate | null {
  const sameStrike = Math.abs(option.strike - want.strike) < SAME_STRIKE;
  const sameExpiry = option.expiration === want.expiry;
  if (sameStrike && sameExpiry) return option;
  const vol = option.vol;
  if (vol == null || !(want.spot > 0) || !(want.strike > 0)) return null;
  const years = yearsToExpiry(want.expiry);
  if (years == null || years <= 0) return null;
  const mid = callPrice(want.spot, want.strike, years, vol);
  const delta = callDelta(want.spot, want.strike, years, vol);
  if (mid == null || !(mid > 0)) return null;
  const days = Math.max(1, Math.round(years * 365));
  return {
    ...option,
    strike: want.strike,
    expiration: want.expiry,
    mid,
    bid: mid,
    ask: mid,
    otmPct: (want.strike - want.spot) / want.spot,
    yield3w: threeWeekYield(mid, want.spot, days),
    premium: mid * 100 * want.contracts,
    contracts: want.contracts,
    daysToExpiry: days,
    delta,
    listedStrike: null,
    estimated: true,
  };
}

/**
 * What typing a strike into the table changes on the holding.
 *
 * The strike is worked out as target plus Call %, so a typed strike keeps
 * the target where it is and moves the Call % to land on it. The target is
 * written down too, because a suggested target moves with the price
 * history and would otherwise drag the strike the reader just chose along
 * with it. Call % cannot go below zero, so a strike under the target moves
 * the target down to meet it.
 */
export function strikeEditPatch(
  strike: number,
  target: number | null
): { target_call_pct: number; stock_target_override: number } | null {
  if (!(strike > 0) || !Number.isFinite(strike)) return null;
  const base = target != null && target > 0 ? target : strike;
  if (strike <= base) {
    return { target_call_pct: 0, stock_target_override: round2(strike) };
  }
  const pct = strike / base - 1;
  if (pct > 1) {
    return { target_call_pct: 1, stock_target_override: round2(strike / 2) };
  }
  return {
    target_call_pct: Math.round(pct * 10_000) / 10_000,
    stock_target_override: round2(base),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
