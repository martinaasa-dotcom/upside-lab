/**
 * Stock splits, and why a tracker of real money cannot ignore them.
 *
 * A holding is a share count and a buy price the reader typed in. A split
 * changes the share count without changing what the position is worth, and
 * nothing in this app can know that happened: the price arrives already
 * adjusted, the stored shares do not. Nvidia's 10 for 1 in June 2024 turned
 * 200 shares at $1,096 into 2,000 at $109.60, and a tracker that missed it
 * showed the same reader a position worth a tenth of the truth, down 90%,
 * as a fact, until they noticed and fixed it by hand. That is the exact
 * shape of the accuracy bug this app is least allowed to have.
 *
 * What can be known for certain, and what cannot.
 *
 * That a split happened, when, and at what ratio is a fact, and Yahoo
 * reports it on the same chart call every quote already makes. Whether a
 * particular stored position still needs it applied is not a fact, because
 * a reader may have typed post-split numbers in themselves. So the rule
 * here is deliberately narrow: nothing but a user edit or an import changes
 * `shares`, so a holding whose `updated_at` is older than the split date
 * has certainly not been adjusted, and one touched since certainly cannot
 * be judged from a timestamp. The first case is reported. The second says
 * nothing at all, because a wrong correction on a real book is worse than
 * no correction.
 *
 * Nothing here writes. It answers "what would this position be", and the
 * reader applies it through the same holdings endpoint any edit goes
 * through, with its own ownership check.
 */

/** One split as Yahoo reports it. 10 for 1 is numerator 10, denominator 1. */
export type SplitEvent = {
  /** Effective date, YYYY-MM-DD, in the listing's own market. */
  date: string;
  numerator: number;
  denominator: number;
};

export type SplitAdjustment = {
  ticker: string;
  splits: SplitEvent[];
  /** Compounded, so a 10 for 1 followed by a 2 for 1 is 20. */
  ratio: number;
  shares: number;
  buyPrice: number;
};

function isUsableSplit(split: SplitEvent): boolean {
  return (
    Number.isFinite(split.numerator) &&
    Number.isFinite(split.denominator) &&
    split.numerator > 0 &&
    split.denominator > 0 &&
    split.numerator !== split.denominator &&
    /^\d{4}-\d{2}-\d{2}$/.test(split.date)
  );
}

/**
 * Splits that took effect after a holding was last touched.
 *
 * The comparison is on the date, not the instant. A split is effective at
 * the open in its own market and a row's `updated_at` is UTC, so anything
 * finer than a day is false precision. Same-day is treated as already
 * applied: a reader who edited a position on the day of its split was
 * looking at the new share count while they did it.
 */
export function splitsAfter(
  splits: readonly SplitEvent[],
  lastTouchedIso: string | null | undefined
): SplitEvent[] {
  const touched = lastTouchedIso?.slice(0, 10);
  if (!touched || !/^\d{4}-\d{2}-\d{2}$/.test(touched)) return [];
  return splits
    .filter(isUsableSplit)
    .filter((s) => s.date > touched)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Compounded share multiplier. Below 1 for a reverse split. */
export function splitRatio(splits: readonly SplitEvent[]): number {
  return splits
    .filter(isUsableSplit)
    .reduce((acc, s) => acc * (s.numerator / s.denominator), 1);
}

/**
 * What a position becomes once the splits are applied, or null when there
 * is nothing to apply or the numbers would stop making sense.
 *
 * The value is held exactly: shares multiply by the ratio and the buy price
 * divides by it, so cost basis and every gain figure built on it are
 * unchanged. Share counts are rounded to six places and prices to four,
 * which is what the rest of the app stores, and a reverse split that would
 * round a real position down to nothing is refused rather than guessed at.
 */
export function adjustForSplits(
  position: { shares: number; buyPrice: number },
  splits: readonly SplitEvent[]
): { shares: number; buyPrice: number; ratio: number } | null {
  const usable = splits.filter(isUsableSplit);
  if (usable.length === 0) return null;
  if (!Number.isFinite(position.shares) || !Number.isFinite(position.buyPrice)) {
    return null;
  }
  if (position.shares <= 0 || position.buyPrice <= 0) return null;

  const ratio = splitRatio(usable);
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio === 1) return null;

  const shares = Math.round(position.shares * ratio * 1e6) / 1e6;
  const buyPrice = Math.round((position.buyPrice / ratio) * 1e4) / 1e4;
  if (!(shares > 0) || !(buyPrice > 0)) return null;

  return { shares, buyPrice, ratio };
}

/** "10 for 1", the way a person says it. */
export function splitLabel(split: SplitEvent): string {
  return `${split.numerator} for ${split.denominator}`;
}

/**
 * Every holding in the book whose share count certainly predates a split.
 *
 * `splitsByTicker` is keyed by the ticker as stored on the holding, already
 * uppercased by the caller.
 */
export function pendingSplitAdjustments(
  holdings: readonly {
    id: string;
    ticker: string;
    shares: number;
    buy_price: number;
    updated_at?: string | null;
  }[],
  splitsByTicker: Record<string, SplitEvent[]>
): Record<string, SplitAdjustment> {
  const out: Record<string, SplitAdjustment> = {};
  for (const h of holdings) {
    const key = h.ticker?.trim().toUpperCase();
    if (!key) continue;
    const due = splitsAfter(splitsByTicker[key] ?? [], h.updated_at);
    if (due.length === 0) continue;
    const adjusted = adjustForSplits(
      { shares: h.shares, buyPrice: h.buy_price },
      due
    );
    if (!adjusted) continue;
    out[h.id] = {
      ticker: key,
      splits: due,
      ratio: adjusted.ratio,
      shares: adjusted.shares,
      buyPrice: adjusted.buyPrice,
    };
  }
  return out;
}
