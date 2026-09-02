/**
 * What an ordinary day looks like for this reader, in their own money.
 *
 * A red number means nothing on its own. Somebody whose portfolio swings
 * two hundred dollars most days learns nothing from "down $180", and
 * somebody whose portfolio barely moves should be sat up by the same
 * figure. Every screen in this app that states a day's move can say which
 * of those two it is, because the price history the quote already carries
 * is enough to work it out.
 *
 * The measure is the median size of a day's move, not the average. One
 * results day of nine per cent drags an average up far enough that every
 * ordinary day afterwards reads as quiet, which is the wrong lesson and the
 * comforting one. A median says "half your days are smaller than this",
 * which is what an ordinary day means when a person says it.
 *
 * Nothing here predicts anything. It is a description of days that have
 * already happened, and every sentence it hands a screen says so.
 */

/** Days of history below which the answer is not worth stating. */
const MIN_DAYS = 12;

/**
 * A day whose size is at or below this multiple of the typical one is
 * ordinary. Chosen so that roughly the middle half of days read as
 * ordinary: with the median at the centre, 1.6 lands near the point where
 * days start to be worth remarking on rather than merely being above the
 * middle. Days between here and `BIG_MULTIPLE` are "bigger than usual".
 */
const ORDINARY_MULTIPLE = 1.6;

/** At or above this multiple, the day is worth a sentence of its own. */
const BIG_MULTIPLE = 3;

export type DaySize = "ordinary" | "bigger" | "big";

export type TypicalMove = {
  /** Median size of a day's move, as a fraction: 0.012 is 1.2 per cent. */
  typicalPct: number;
  /** How many daily moves the median was taken over. */
  days: number;
};

/**
 * The median size of a day's move, from a series of closing prices.
 *
 * Returns null when there is not enough history to say, which is the honest
 * answer for a company listed last month and for a reader whose provider
 * gave a short series. A caller that gets null says nothing rather than
 * saying something vague.
 */
export function typicalMoveFromCloses(closes: number[]): TypicalMove | null {
  const clean = closes.filter((n) => Number.isFinite(n) && n > 0);
  if (clean.length < MIN_DAYS + 1) return null;

  const sizes: number[] = [];
  for (let i = 1; i < clean.length; i += 1) {
    const before = clean[i - 1]!;
    const now = clean[i]!;
    if (before <= 0) continue;
    const move = Math.abs((now - before) / before);
    // A move of more than half in one day is a split, a bad bar or a new
    // listing rather than a day somebody lived through. Counting one would
    // move the median for weeks.
    if (Number.isFinite(move) && move < 0.5) sizes.push(move);
  }
  if (sizes.length < MIN_DAYS) return null;

  sizes.sort((a, b) => a - b);
  const mid = Math.floor(sizes.length / 2);
  const typicalPct =
    sizes.length % 2 === 1
      ? sizes[mid]!
      : (sizes[mid - 1]! + sizes[mid]!) / 2;

  if (!Number.isFinite(typicalPct) || typicalPct <= 0) return null;
  return { typicalPct, days: sizes.length };
}

/**
 * The same measure for a whole portfolio, from each holding's own history.
 *
 * A portfolio is not the sum of its holdings' swings, because the parts
 * rarely move together, so this rebuilds the portfolio's own value day by
 * day from the shares held today and takes the median of that. Holding the
 * share counts still means the answer describes today's portfolio through
 * the past rather than the portfolio as it actually was, which is the same
 * assumption the year chart states out loud, so a caller says so too.
 *
 * Series of different lengths are read from their most recent day
 * backwards, and a day is only counted when every holding reported it.
 */
export function typicalMoveForPortfolio(
  positions: { shares: number; closes: number[] }[]
): TypicalMove | null {
  const held = positions.filter(
    (p) => Number.isFinite(p.shares) && p.shares > 0 && p.closes.length > 1
  );
  if (held.length === 0) return null;

  const depth = Math.min(...held.map((p) => p.closes.length));
  if (depth < MIN_DAYS + 1) return null;

  const values: number[] = [];
  for (let back = depth - 1; back >= 0; back -= 1) {
    let total = 0;
    let complete = true;
    for (const p of held) {
      const price = p.closes[p.closes.length - 1 - back];
      if (!Number.isFinite(price) || (price as number) <= 0) {
        complete = false;
        break;
      }
      total += (price as number) * p.shares;
    }
    if (!complete) return null;
    values.push(total);
  }
  return typicalMoveFromCloses(values);
}

/** Where today's move sits against an ordinary one. */
export function daySize(todayPct: number, typical: TypicalMove): DaySize {
  const size = Math.abs(todayPct) / typical.typicalPct;
  if (size >= BIG_MULTIPLE) return "big";
  if (size > ORDINARY_MULTIPLE) return "bigger";
  return "ordinary";
}

function pct(n: number): string {
  const shown = Math.abs(n) * 100;
  // Below a tenth of a point there is no honest figure to print, and the
  // repo's own rule is that a small number is said in words rather than
  // rounded up into existence.
  if (shown < 0.1) return "less than 0.1%";
  // A tenth of a point matters at these sizes: the difference between a
  // day of 1.1% and one of 1.4% is the difference between ordinary and
  // not, for somebody whose usual day is 1.2%.
  const figure = shown < 10 ? Number(shown.toFixed(1)) : Math.round(shown);
  return `${figure}%`;
}

/**
 * One sentence putting today beside an ordinary day, for a holding.
 *
 * Never a verdict and never a forecast: it says how big today was next to
 * the days behind it and stops. The subject is passed in so the caller can
 * say "Apple" where it knows the company and "$AAPL" where it does not.
 */
export function typicalMoveLine(
  subject: string,
  todayPct: number | null,
  typical: TypicalMove | null
): string | null {
  if (typical == null) return null;
  const ordinary = pct(typical.typicalPct);
  if (todayPct == null || !Number.isFinite(todayPct)) {
    return `${subject} moves about ${ordinary} on an ordinary day.`;
  }
  const size = daySize(todayPct, typical);
  const today = pct(todayPct);
  const way = todayPct >= 0 ? "up" : "down";
  if (size === "ordinary") {
    return `${subject} is ${way} ${today} today, which is an ordinary day for it. It usually moves about ${ordinary}.`;
  }
  if (size === "bigger") {
    return `${subject} is ${way} ${today} today, bigger than its usual ${ordinary}.`;
  }
  const times = Math.round(Math.abs(todayPct) / typical.typicalPct);
  return `${subject} is ${way} ${today} today. That is about ${times} times its usual ${ordinary}, so today is not an ordinary day for it.`;
}

/**
 * The same sentence for the whole portfolio, where the reader's own money
 * is the clearer unit.
 *
 * Dollars first, because "down $180" is what somebody actually feels, and
 * the percentage is what makes it comparable.
 */
export function portfolioDayLine(
  todayDollar: number | null,
  todayPct: number | null,
  totalValue: number,
  typical: TypicalMove | null,
  money: (n: number) => string
): string | null {
  if (typical == null || totalValue <= 0) return null;
  const ordinaryDollar = money(typical.typicalPct * totalValue);
  if (todayPct == null || todayDollar == null || !Number.isFinite(todayPct)) {
    return `Your portfolio moves about ${ordinaryDollar} on an ordinary day.`;
  }
  const size = daySize(todayPct, typical);
  const moved = money(Math.abs(todayDollar));
  const way = todayDollar >= 0 ? "up" : "down";
  if (size === "ordinary") {
    return `Your portfolio is ${way} ${moved} today. It moves about ${ordinaryDollar} on an ordinary day, so today is one of those.`;
  }
  if (size === "bigger") {
    return `Your portfolio is ${way} ${moved} today, more than the ${ordinaryDollar} of an ordinary day.`;
  }
  const times = Math.round(Math.abs(todayPct) / typical.typicalPct);
  return `Your portfolio is ${way} ${moved} today, about ${times} ordinary days at once.`;
}
