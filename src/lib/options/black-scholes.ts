/**
 * The arithmetic behind a call's delta, and nothing else.
 *
 * Delta is how much the call's price moves for a dollar of the share, and
 * for anybody who has written a covered call it is also the market's own
 * rough odds that the shares end up being taken at the strike. It is not a
 * figure a feed hands over for free: Yahoo publishes an implied volatility
 * per contract and no greeks, so delta is worked out here from the share
 * price, the strike, the time left and that volatility, with the standard
 * Black-Scholes formula for a European call.
 *
 * Three honest limits, all said out loud wherever a delta is printed:
 * US single-stock options are American and can be exercised early (which
 * matters almost only the day before a dividend), no dividend yield is
 * included because the chain does not carry one, and the rate is a fixed
 * round figure rather than today's Treasury yield. None of the three moves
 * a two-to-six-week delta by more than a couple of hundredths.
 */

/** A round short-term US rate. Moves a few-week delta by well under 0.01. */
export const RISK_FREE_RATE = 0.04;

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

/** A floor on time left, so the last minutes before the bell stay finite. */
const MIN_YEARS = 1 / (365 * 24 * 12);

/** Standard normal cumulative distribution (Abramowitz and Stegun 7.1.26). */
export function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

function d1(spot: number, strike: number, years: number, vol: number, rate: number) {
  return (
    (Math.log(spot / strike) + (rate + (vol * vol) / 2) * years) /
    (vol * Math.sqrt(years))
  );
}

function validInputs(spot: number, strike: number, years: number, vol: number) {
  return (
    Number.isFinite(spot) &&
    Number.isFinite(strike) &&
    Number.isFinite(years) &&
    Number.isFinite(vol) &&
    spot > 0 &&
    strike > 0 &&
    vol > 0
  );
}

/**
 * Delta of a call, between 0 and 1.
 *
 * At or past expiry it is 1 when the share is above the strike and 0 when
 * it is not, which is what the contract actually does at the bell.
 */
export function callDelta(
  spot: number,
  strike: number,
  years: number,
  vol: number,
  rate: number = RISK_FREE_RATE
): number | null {
  if (!validInputs(spot, strike, Math.max(years, 0), vol)) return null;
  if (years <= 0) return spot > strike ? 1 : 0;
  const t = Math.max(years, MIN_YEARS);
  return normCdf(d1(spot, strike, t, vol, rate));
}

/** Fair price of a call per share. */
export function callPrice(
  spot: number,
  strike: number,
  years: number,
  vol: number,
  rate: number = RISK_FREE_RATE
): number | null {
  if (!validInputs(spot, strike, Math.max(years, 0), vol)) return null;
  if (years <= 0) return Math.max(0, spot - strike);
  const t = Math.max(years, MIN_YEARS);
  const a = d1(spot, strike, t, vol, rate);
  const b = a - vol * Math.sqrt(t);
  return spot * normCdf(a) - strike * Math.exp(-rate * t) * normCdf(b);
}

/** The volatility range an implied figure is believed inside. */
export const MIN_VOL = 0.03;
export const MAX_VOL = 4;

/**
 * The volatility at which the formula reproduces the price the market is
 * actually paying, or null when no volatility can.
 *
 * Solved here rather than read off the feed, because the feed's own figure
 * is computed from a last trade that can be days old and comes back as
 * 0.00001 or 3,000% on a quiet contract. A mid quoted today is better
 * evidence than either. Bisection, because the price rises with volatility
 * everywhere and bisection cannot fail to converge.
 */
export function impliedVol(
  price: number,
  spot: number,
  strike: number,
  years: number,
  rate: number = RISK_FREE_RATE
): number | null {
  if (!(price > 0) || !(spot > 0) || !(strike > 0) || !(years > 0)) return null;
  const t = Math.max(years, MIN_YEARS);
  const floor = Math.max(0, spot - strike * Math.exp(-rate * t));
  // A price under what the call is worth if exercised this instant has no
  // volatility that explains it: it is a stale print or a wide market.
  if (price <= floor + 1e-9) return null;
  if (price >= spot) return null;
  let lo = MIN_VOL;
  let hi = MAX_VOL;
  const at = (v: number) => callPrice(spot, strike, t, v, rate) ?? 0;
  if (at(lo) > price || at(hi) < price) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) > price) hi = mid;
    else lo = mid;
    if (hi - lo < 1e-6) break;
  }
  return (lo + hi) / 2;
}

/** Whether a volatility figure from anywhere is one worth using. */
export function isPlausibleVol(vol: number | null | undefined): vol is number {
  return typeof vol === "number" && Number.isFinite(vol) && vol >= MIN_VOL && vol <= MAX_VOL;
}

/**
 * The instant a listed option stops trading: 16:00 in New York on its
 * expiry date, whichever half of the year that falls in.
 *
 * Delta in the last week is driven by hours rather than days, so this is
 * the real bell rather than midnight UTC, which would be wrong by most of a
 * trading day.
 */
export function expiryInstant(expiryKey: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expiryKey.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Try both offsets New York uses and keep the one whose wall clock reads 16.
  for (const offset of [4, 5]) {
    const guess = new Date(Date.UTC(y, mo - 1, d, 16 + offset, 0, 0));
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(guess)
    );
    if (hour === 16) return guess;
  }
  return new Date(Date.UTC(y, mo - 1, d, 20, 0, 0));
}

/** Years from `now` to the expiry bell. Negative once it has passed. */
export function yearsToExpiry(expiryKey: string, now: Date = new Date()): number | null {
  const at = expiryInstant(expiryKey);
  if (!at) return null;
  return (at.getTime() - now.getTime()) / MS_PER_YEAR;
}

/** Calendar days left to the bell, rounded up, never below zero. */
export function daysToExpiry(expiryKey: string, now: Date = new Date()): number | null {
  const at = expiryInstant(expiryKey);
  if (!at) return null;
  const ms = at.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 60 * 60 * 1000));
}
