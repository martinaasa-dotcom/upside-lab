/**
 * Was it the whole market, or was it your companies?
 *
 * This is the question the product exists to answer, and until now no
 * screen stated the one number it needs: what the market itself did today.
 * A reader looking at "down 2.1%" cannot tell an ordinary bad day for
 * everybody from something happening to what they own, and that difference
 * is the whole of it.
 *
 * The comparison here is deliberately a comparison and not a model. It
 * would be easy to say "of your $84 fall, $61 was the market" by assuming
 * a portfolio moves one for one with an index, and that assumption is
 * wrong for every portfolio that is not an index fund, invisible to the
 * reader, and exactly the kind of hidden arithmetic this repo refuses
 * elsewhere. So it says the two figures side by side, names which is
 * larger, and lists the holdings that did something the market did not.
 * Every sentence it produces is checkable against two numbers on screen.
 */

/** Below this, a day is small enough that comparing it teaches nothing. */
const QUIET_PCT = 0.002;

/**
 * How far a holding has to be from the market's own move before it is worth
 * naming. A tenth of a point of daily wobble is not a company doing
 * something; a point and a half is worth a look.
 */
const STANDOUT_GAP = 0.015;

export type MarketOrYou = {
  /** The index's move today, as a fraction. */
  marketPct: number;
  /** The reader's own move today, as a fraction. */
  yoursPct: number;
  /**
   * Which way to read the day.
   *
   * "with" means the two moved the same way and by a similar amount, which
   * is most days. "more" and "less" mean the reader's own portfolio moved
   * further or less far in the same direction. "against" means they went
   * opposite ways, which is the rarest and most interesting.
   */
  read: "with" | "more" | "less" | "against" | "quiet";
  /** Holdings that did something the market plainly did not. */
  standouts: { ticker: string; label?: string; pct: number; gap: number }[];
};

export type MarketOrYouInput = {
  marketPct: number | null;
  yoursPct: number | null;
  holdings: { ticker: string; label?: string; todayPct: number | null }[];
};

export function marketOrYou(input: MarketOrYouInput): MarketOrYou | null {
  const { marketPct, yoursPct } = input;
  if (
    marketPct == null ||
    yoursPct == null ||
    !Number.isFinite(marketPct) ||
    !Number.isFinite(yoursPct)
  ) {
    return null;
  }

  const standouts = input.holdings
    .filter((h) => h.todayPct != null && Number.isFinite(h.todayPct))
    .map((h) => ({
      ticker: h.ticker,
      label: h.label,
      pct: h.todayPct as number,
      gap: (h.todayPct as number) - marketPct,
    }))
    .filter((h) => Math.abs(h.gap) >= STANDOUT_GAP)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

  let read: MarketOrYou["read"];
  if (Math.abs(marketPct) < QUIET_PCT && Math.abs(yoursPct) < QUIET_PCT) {
    read = "quiet";
  } else if (marketPct === 0 || yoursPct === 0) {
    read = Math.abs(yoursPct) > Math.abs(marketPct) ? "more" : "less";
  } else if (Math.sign(marketPct) !== Math.sign(yoursPct)) {
    read = "against";
  } else if (Math.abs(yoursPct - marketPct) < STANDOUT_GAP / 2) {
    read = "with";
  } else {
    read = Math.abs(yoursPct) > Math.abs(marketPct) ? "more" : "less";
  }

  return { marketPct, yoursPct, read, standouts };
}

/**
 * The two figures in one sentence, and what to make of them in a second.
 *
 * `marketName` is the index in the words a person uses, so the caller
 * passes "The S&P 500" rather than a ticker. `percent` is the app's own
 * formatter, so this module states no opinion about how a figure looks.
 */
export function marketOrYouLine(
  split: MarketOrYou | null,
  marketName: string,
  percent: (n: number) => string
): string | null {
  if (!split) return null;
  const { marketPct, yoursPct, read } = split;
  const way = (n: number) => (n >= 0 ? "up" : "down");
  const both = `${marketName} is ${way(marketPct)} ${percent(Math.abs(marketPct))} today, and your portfolio is ${way(yoursPct)} ${percent(Math.abs(yoursPct))}.`;

  if (read === "quiet") {
    return `${marketName} and your portfolio both barely moved today.`;
  }
  if (read === "with") {
    return `${both} You moved with the market, which is what most days look like.`;
  }
  if (read === "against") {
    return `${both} You went the other way to the market today, which is unusual.`;
  }
  if (read === "more") {
    return `${both} Your own companies moved further than the market did.`;
  }
  return `${both} The market moved further than your own companies did.`;
}

/**
 * The holdings worth a second look, said plainly.
 *
 * Only ever a description of what happened, and it names at most two, so
 * the line stays a sentence rather than becoming a list nobody reads.
 */
export function standoutLine(
  split: MarketOrYou | null,
  percent: (n: number) => string
): string | null {
  if (!split || split.standouts.length === 0) return null;
  const named = split.standouts
    .slice(0, 2)
    .map((s) => `${s.label ?? s.ticker} (${s.pct >= 0 ? "up" : "down"} ${percent(Math.abs(s.pct))})`);
  const rest = split.standouts.length - named.length;
  const list =
    named.length === 1 ? named[0]! : `${named[0]!} and ${named[1]!}`;
  const tail =
    rest > 0
      ? ` ${rest} other${rest === 1 ? "" : "s"} did too.`
      : "";
  return `${list} did something the market did not.${tail}`;
}
