/**
 * THE ARITHMETIC BEHIND THE PLAYBOOK.
 *
 * Two figures that change how somebody thinks, both of them worked out
 * here rather than quoted from an article, which is the whole reason they
 * are worth printing. Every investing site in existence carries a version
 * of the missing-the-best-days statistic and almost none of them say which
 * window it covers, so a reader has no way to check it and no way to know
 * whether it was picked because it was flattering. This one is computed
 * from the ten years of index closes the app already fetches for its
 * market reading, it names its own window, and it moves when the market
 * does.
 *
 * The recovery gap is pure arithmetic and needs no data at all. It is here
 * rather than inline in a component because a number this load-bearing
 * deserves a test around it.
 */

/** How much a price has to rise to undo a fall of `fall` (0.5 is half). */
export function riseToRecover(fall: number): number | null {
  if (!Number.isFinite(fall)) return null;
  if (fall <= 0) return 0;
  if (fall >= 1) return null; // Nothing recovers from nothing.
  return fall / (1 - fall);
}

/** Trading days removed, in the order the reader meets them. */
export const BEST_DAY_STEPS = [5, 10, 20, 30] as const;

export type BestDaysStep = {
  /** How many of the window's days were taken out. */
  days: number;
  /** What a pound left alone became, 1 being flat. */
  multiple: number;
};

export type BestDaysRead = {
  /** Trading days in the window. */
  days: number;
  /** Calendar years the window covers, to one decimal. */
  years: number;
  from: string | null;
  to: string | null;
  /** The window's own growth multiple, untouched. */
  full: number;
  /** The same window with the best days taken out. */
  missingBest: BestDaysStep[];
  /** The same window with the worst days taken out. The other half. */
  missingWorst: BestDaysStep[];
  /**
   * Of the ten best days, how many landed within ten trading days of one
   * of the ten worst. This is the figure that keeps the section honest:
   * the best days are not scattered through calm years, they sit inside
   * the same few frightening weeks as the worst ones, so being out of the
   * way of one means being out of the way of the other.
   */
  bestNearWorst: number | null;
};

const NEAR_DAYS = 10;
const CLUSTER_SAMPLE = 10;

/*
  Six decimal places, because the seventeen a float prints are noise here.

  A multiple is a derived quantity rendered as whole dollars and as a yearly
  rate to one decimal, and `5.097025169688991` moves neither: measured, all
  five figures on the panel are identical either way. What the extra digits
  do is travel, and this crosses a route and a `localStorage` write, so they
  are rounded where the number is made rather than where it is drawn.
*/
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function multipleOf(returns: number[]): number {
  let acc = 1;
  for (const r of returns) acc *= 1 + r;
  return round6(acc);
}

/** Indices of the `count` largest (or smallest) daily returns. */
function extremeIndices(
  returns: number[],
  count: number,
  worst: boolean
): number[] {
  return returns
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (worst ? a.r - b.r : b.r - a.r))
    .slice(0, count)
    .map((x) => x.i);
}

function without(returns: number[], drop: number[]): number[] {
  const gone = new Set(drop);
  return returns.filter((_, i) => !gone.has(i));
}

function yearsBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return (b - a) / (365.25 * 24 * 60 * 60 * 1000);
}

/**
 * The read, from daily closes oldest first. `at` is the matching ISO dates
 * where we have them, and the window is named from them rather than
 * guessed from the count of rows, because a count of trading days is not
 * something a reader can check against anything.
 */
export function bestDaysFromCloses(
  closes: number[],
  at?: (string | null)[]
): BestDaysRead | null {
  const clean: number[] = [];
  const cleanAt: (string | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    const c = closes[i];
    if (typeof c === "number" && Number.isFinite(c) && c > 0) {
      clean.push(c);
      cleanAt.push(at?.[i] ?? null);
    }
  }
  // Enough for the largest step to still leave a window worth quoting.
  const biggest = BEST_DAY_STEPS[BEST_DAY_STEPS.length - 1] ?? 30;
  if (clean.length < biggest * 20) return null;

  const returns: number[] = [];
  for (let i = 1; i < clean.length; i++) {
    returns.push(clean[i]! / clean[i - 1]! - 1);
  }

  const from = cleanAt[0] ?? null;
  const to = cleanAt[cleanAt.length - 1] ?? null;
  const years = yearsBetween(from, to);
  if (years == null || years < 3) return null;

  const bestTen = extremeIndices(returns, CLUSTER_SAMPLE, false);
  const worstTen = extremeIndices(returns, CLUSTER_SAMPLE, true);
  const bestNearWorst = bestTen.filter((b) =>
    worstTen.some((w) => Math.abs(w - b) <= NEAR_DAYS)
  ).length;

  return {
    days: returns.length,
    years: Math.round(years * 10) / 10,
    from,
    to,
    full: multipleOf(returns),
    missingBest: BEST_DAY_STEPS.map((n) => ({
      days: n,
      multiple: multipleOf(without(returns, extremeIndices(returns, n, false))),
    })),
    missingWorst: BEST_DAY_STEPS.map((n) => ({
      days: n,
      multiple: multipleOf(without(returns, extremeIndices(returns, n, true))),
    })),
    bestNearWorst,
  };
}

export function isBestDaysRead(v: unknown): v is BestDaysRead {
  if (!v || typeof v !== "object") return false;
  const o = v as BestDaysRead;
  const step = (s: unknown) =>
    Array.isArray(s) &&
    s.every(
      (x) =>
        x &&
        typeof x === "object" &&
        typeof (x as BestDaysStep).days === "number" &&
        typeof (x as BestDaysStep).multiple === "number"
    );
  return (
    typeof o.days === "number" &&
    typeof o.years === "number" &&
    typeof o.full === "number" &&
    step(o.missingBest) &&
    step(o.missingWorst)
  );
}

/** The yearly rate a multiple works out to over a window. */
export function annualFromMultiple(
  multiple: number,
  years: number
): number | null {
  if (!(multiple > 0) || !(years > 0)) return null;
  return Math.pow(multiple, 1 / years) - 1;
}
