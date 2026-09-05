/**
 * The company's finances, said the way somebody would say them out loud.
 *
 * This is the answer to the complaint the whole room exists for: the
 * financial part is where people give up. Not because the arithmetic is
 * hard but because nothing tells them what the number is *next to*. A
 * profit margin of 9% means nothing on its own and means a great deal
 * beside "out of every $100 of sales, $9 is profit, and most large
 * companies land between $5 and $15".
 *
 * So every reading carries four things and the third is the point:
 *
 *   label    what it is, in ordinary words, never the market's word for it
 *   value    the figure, formatted, or NO_VALUE
 *   plain    the same figure said as a sentence with a unit a person owns
 *   compare  what ordinary looks like, so the figure has a scale
 *
 * Two rules this file must never break. **Nothing here computes a verdict**:
 * `tone` is allowed to say a figure is comfortable or worth a look, which
 * is a reading of one number, and is never allowed to add up to buy or
 * sell. And **nothing here invents a figure**: a missing input yields a
 * reading whose value is NO_VALUE and whose compare line still teaches the
 * idea, because a reader who cannot get this company's profit margin is
 * still better off knowing what one is.
 *
 * The comparison figures are broad, long-standing and checkable, and each
 * one says out loud that it is a rough scale rather than a target. They are
 * deliberately not per-sector: a per-sector table is a house view about
 * what a company ought to look like, which is the thing this product took
 * out of the forecast on purpose.
 */
import { NO_VALUE, currency, number, percent } from "@/lib/format";
export { bigMoney } from "@/lib/company/scale";
import {
  MARKET_EARNINGS_MULTIPLE as MARKET_MULTIPLE,
  bigMoney,
} from "@/lib/company/scale";
import type { CompanyFacts } from "@/lib/company/facts";
import { isCryptoLike, isFundLike } from "@/lib/company/facts";

export type ReadingTone = "good" | "watch" | "neutral";

export type CompanyReading = {
  id: string;
  /**
   * The figure's real name, as the rest of the world writes it.
   *
   * These were plain paraphrases ("Whether they make money") and that was
   * a mistake in both directions. Somebody who knows what a profit margin
   * is had to decode a riddle to find one, and somebody who does not was
   * left unable to recognise the word anywhere else, which is the exact
   * cost AGENTS.md records for the outright ban. The real term goes on the
   * label, where the definition sits behind it, and `plain` immediately
   * underneath says the same thing in ordinary words. Both readers are
   * served by the same two lines, in that order.
   */
  label: string;
  /** The figure, formatted, or NO_VALUE. */
  value: string;
  /** The same figure as a sentence, or null when there is no figure. */
  plain: string | null;
  /**
   * The one thing the figure is measured against: the market, the
   * company's own history, or what ordinary looks like for this kind of
   * number. A figure with nothing beside it is not information, which is
   * the whole complaint this room exists to answer.
   */
  compare: string;
  /**
   * A short benchmark chip, when there is a real number to compare with
   * rather than a rule of thumb. `label` is what it is measured against
   * and `value` is that thing's figure, so the reader sees "S&P 500 · 15%"
   * beside a company's 104% and needs no sentence to read it.
   */
  versus?: { label: string; value: string; better: boolean | null };
  tone: ReadingTone;
  /** Key into `GLOSSARY`, where this app already defines the outside word. */
  glossary?: string;
};

/**
 * `null` in, a reading out. Every builder below funnels through here so a
 * missing figure cannot accidentally skip the teaching half.
 */
function reading(
  id: string,
  label: string,
  value: string,
  plain: string | null,
  compare: string,
  tone: ReadingTone = "neutral",
  glossary?: string,
  versus?: CompanyReading["versus"]
): CompanyReading {
  return { id, label, value, plain, compare, tone, glossary, versus };
}

function has(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/* ---------------------------------------------------------------------- *
 * One builder per reading. Split up so each can be tested against a figure
 * and against nothing, which is the case that goes wrong.
 * ---------------------------------------------------------------------- */

function sizeReading(f: CompanyFacts): CompanyReading {
  const code = f.currency ?? "USD";
  const v = f.marketCap;
  const fund = isFundLike(f);
  const coin = isCryptoLike(f);
  const plain = has(v)
    ? fund
      ? `Investors have put ${bigMoney(v, code)} into this fund between them.`
      : coin
        ? // A coin has no shares to buy every one of, and saying so would
          // be the app describing something that does not exist.
          `Every coin in existence, at today's price, comes to ${bigMoney(v, code)}.`
        : `Buying every share at today's price would cost ${bigMoney(v, code)}.`
    : null;
  return reading(
    "size",
    fund ? "Fund size" : coin ? "Total value of all coins" : "Market value",
    bigMoney(v, code),
    plain,
    fund
      ? "A larger fund is usually cheaper to run and easier to sell out of on a bad day. It says nothing about whether what is inside it is any good."
      : coin
        ? "There is no revenue, no profit and no asset behind this figure. It is the number of coins multiplied by what the last one traded at, so it moves entirely with sentiment."
        : "Under $2 billion is small, $10 billion to $200 billion is the middle of the market, and above that are the few dozen everybody has heard of.",
    "neutral",
    fund || coin ? undefined : "market-value"
  );
}

function salesReading(f: CompanyFacts): CompanyReading {
  const code = f.currency ?? "USD";
  const plain = has(f.revenue)
    ? `Customers paid them ${bigMoney(f.revenue, code)} over the last twelve months.`
    : null;
  return reading(
    "sales",
    "Revenue",
    bigMoney(f.revenue, code),
    plain,
    "Money in the door before any costs come out. A company can sell a great deal and still lose money.",
    "neutral",
    "sales"
  );
}

function growthReading(f: CompanyFacts): CompanyReading {
  const g = f.revenueGrowth;
  const plain = has(g)
    ? g > 0
      ? `Sales are ${percent(g)} higher than the same stretch a year ago.`
      : g < 0
        ? `Sales are ${percent(Math.abs(g))} lower than the same stretch a year ago.`
        : "Sales are about level with a year ago."
    : null;
  const tone: ReadingTone = has(g) ? (g < 0 ? "watch" : "good") : "neutral";
  const next = f.revenueGrowthNextYear;
  return reading(
    "growth",
    "Revenue growth",
    has(g) ? percent(g) : NO_VALUE,
    plain,
    has(next)
      ? `Analysts expect ${percent(next)} next year. The economy as a whole grows a few percent, so anything well above that is real growth.`
      : "The economy as a whole grows a few percent a year, so anything well above that is real growth. Falling sales is the one figure here worth stopping on.",
    tone,
    "sales-growth",
    has(next)
      ? { label: "Expected next year", value: percent(next), better: null }
      : undefined
  );
}

/**
 * What the analysts expect earnings to do, against what they expect the
 * whole market to do.
 *
 * The single most useful figure on the page and it was missing entirely
 * from the first version, which priced everything off last year. It is
 * also the one place a real benchmark is available for nothing: the feed
 * publishes the S&P 500's own expected growth beside every company's.
 */
function earningsGrowthReading(f: CompanyFacts): CompanyReading {
  const g = f.epsGrowthNextYear ?? f.epsGrowthThisYear;
  const market = f.marketEpsGrowthNextYear ?? f.marketLongTermGrowth;
  const which = f.epsGrowthNextYear != null ? "next year" : "this year";
  const plain = has(g)
    ? g > 0
      ? `Profit per share is expected to be ${percent(g)} higher ${which}.`
      : `Profit per share is expected to be ${percent(Math.abs(g))} lower ${which}.`
    : null;
  const tone: ReadingTone = has(g)
    ? g < 0
      ? "watch"
      : has(market) && g > market
        ? "good"
        : "neutral"
    : "neutral";
  return reading(
    "earnings-growth",
    "Expected earnings growth",
    has(g) ? percent(g) : NO_VALUE,
    plain,
    has(market)
      ? `The S&P 500's own earnings are expected to grow ${percent(market)} over the same stretch, so this is the figure that says whether the company is outrunning the market or keeping pace with it.`
      : "This is what the market is paying for. A high price is usually a bet on this number, so it is the one to watch when results come out.",
    tone,
    undefined,
    has(market)
      ? {
          label: "S&P 500",
          value: percent(market),
          better: has(g) ? g > market : null,
        }
      : undefined
  );
}

function profitReading(f: CompanyFacts): CompanyReading {
  const m = f.profitMargin;
  const plain = has(m)
    ? m > 0
      ? `Out of every $100 customers pay them, about ${currency(m * 100, 0)} is left as profit.`
      : `They lose about ${currency(Math.abs(m) * 100, 0)} on every $100 customers pay them.`
    : null;
  const tone: ReadingTone = has(m) ? (m <= 0 ? "watch" : "good") : "neutral";
  /*
    Measured against the company's own history rather than against a
    table, because a margin only means something next to the margin the
    same business was earning three years ago. Widening is a business
    getting stronger; narrowing is the one that matters and no rule of
    thumb catches it.
  */
  const oldest = f.history[0];
  const past =
    oldest && has(oldest.revenue) && has(oldest.netIncome) && oldest.revenue > 0
      ? oldest.netIncome / oldest.revenue
      : null;
  return reading(
    "profit",
    "Profit margin",
    has(m) ? percent(m) : NO_VALUE,
    plain,
    has(past)
      ? `In ${oldest!.year} it was ${percent(past)}, so the business is ${has(m) && m > past ? "keeping more of what it sells than it used to" : has(m) && m < past ? "keeping less of what it sells than it used to" : "keeping about the same share as it used to"}.`
      : "Most large companies keep $5 to $15 of every $100. A young company losing money on purpose is a choice, and it works only while somebody keeps lending it the difference.",
    tone,
    "profit-margin",
    has(past) && oldest
      ? { label: `In ${oldest.year}`, value: percent(past), better: has(m) ? m > past : null }
      : undefined
  );
}

function balanceReading(f: CompanyFacts): CompanyReading {
  const code = f.currency ?? "USD";
  const cash = f.totalCash;
  const debt = f.totalDebt;
  if (!has(cash) && !has(debt)) {
    return reading(
      "balance",
      "Net cash",
      NO_VALUE,
      null,
      "More cash than debt means a bad year is survivable without asking anybody. The other way round, the lenders have a say too.",
      "neutral",
      "debt"
    );
  }
  const net = (cash ?? 0) - (debt ?? 0);
  const plain =
    net >= 0
      ? `They hold ${bigMoney(cash, code)} in cash against ${bigMoney(debt, code)} of debt.`
      : `They owe ${bigMoney(debt, code)} against ${bigMoney(cash, code)} of cash.`;
  /*
    Turns on the size of the gap rather than its sign. Borrowing is an
    ordinary way to run a company and a warning on every company carrying
    any debt is a warning a reader learns to ignore. Debt worth more than
    a year and a half of sales is where the lenders join the story.
  */
  const heavy =
    has(debt) && has(f.revenue) && f.revenue > 0 && debt > f.revenue * 1.5;
  const years =
    has(f.revenue) && f.revenue > 0 && has(debt) ? debt / f.revenue : null;
  return reading(
    "balance",
    net >= 0 ? "Net cash" : "Net debt",
    bigMoney(Math.abs(net), code),
    plain,
    has(years)
      ? `The debt is worth about ${years < 0.1 ? "a rounding error next to" : `${years.toFixed(1)} times`} a year of sales. Past about one and a half years of sales, keeping the lenders happy starts competing with keeping customers happy.`
      : "More cash than debt means a bad year is survivable without asking anybody. The other way round, the lenders have a say too.",
    net >= 0 ? "good" : heavy ? "watch" : "neutral",
    "debt"
  );
}

function priceTagReading(f: CompanyFacts): CompanyReading {
  /*
    Forward first, and that ordering is the whole point of this figure.

    A trailing multiple on a company whose profits are about to double is
    a true number that answers the wrong question: nobody is paying 122
    times AMD's last year, they are paying 31 times next year's. Both are
    printed, because a professional wants the trailing one and a beginner
    needs to know the forward figure rests on an estimate.
  */
  const forward =
    has(f.epsNextYear) && has(f.price) && f.epsNextYear > 0
      ? f.price / f.epsNextYear
      : f.forwardPe;
  const trailing = f.trailingPe;
  const shown = has(forward) ? forward : trailing;
  const isForward = has(forward);
  const plain = has(shown)
    ? isForward
      ? `At today's price you are paying about ${currency(shown, 0)} for every $1 of profit the company is expected to make next year.`
      : `At today's price you are paying about ${currency(shown, 0)} for every $1 of profit it made last year.`
    : null;
  return reading(
    "price-tag",
    isForward ? "Price to next year's earnings" : "Price to earnings",
    has(shown) ? `${number(shown, 1)}x` : NO_VALUE,
    plain,
    has(trailing) && isForward
      ? `On last year's profit it is ${number(trailing, 1)}x. The whole US market has averaged near ${MARKET_MULTIPLE}x over the long run, so the gap between those two numbers is how much growth the price is counting on.`
      : `The whole US market has averaged near ${MARKET_MULTIPLE}x over the long run. Higher usually means people expect the profit to grow, and that more has to go right.`,
    "neutral",
    "price-to-earnings",
    {
      label: "Market average",
      value: `${MARKET_MULTIPLE}x`,
      better: null,
    }
  );
}

function rangeReading(f: CompanyFacts): CompanyReading {
  const code = f.currency ?? "USD";
  const { price, fiftyTwoWeekHigh: high, fiftyTwoWeekLow: low } = f;
  if (!has(price) || !has(high) || !has(low) || high <= low) {
    return reading(
      "range",
      "52 week range",
      NO_VALUE,
      null,
      "Near the top or the bottom of its own year says nothing about what happens next. It says how much the people holding it have changed their minds lately.",
      "neutral",
      "recent-range"
    );
  }
  const spot = Math.min(Math.max((price - low) / (high - low), 0), 1);
  const plain = `It has traded between ${currency(low, 2, code)} and ${currency(high, 2, code)} over the last year, and today sits ${percent(spot, 0)} of the way up.`;
  return reading(
    "range",
    "52 week range",
    percent(spot, 0),
    plain,
    "Near the top or the bottom of its own year says nothing about what happens next. It says how much the people holding it have changed their minds lately.",
    "neutral",
    "recent-range",
    { label: "Down from the high", value: percent((high - price) / high, 0), better: null }
  );
}

function dividendReading(f: CompanyFacts): CompanyReading {
  const y = f.dividendYield;
  const pays = has(y) && y > 0;
  const fund = isFundLike(f);
  const plain = pays
    ? `For every $100 you hold, about ${currency(y * 100, 2)} a year comes back to you in cash.`
    : fund
      ? "Nothing comes back as cash. Either the companies inside it pay nothing out, or the fund keeps and reinvests what they do."
      : "They pay nothing out. Everything earned stays in the business, which is the ordinary choice for a company still growing fast.";
  return reading(
    "dividend",
    "Dividend yield",
    pays ? percent(y, 2) : "None",
    plain,
    fund
      ? "This is what the companies inside the fund paid out, passed on to you after the fund's charge. It arrives whether the price moves or not, and it is part of what you get from holding the fund rather than a bonus on top."
      : "Cash that arrives whether the price moves or not. Not free money: it comes out of the company, which then has that much less to spend on growing.",
    "neutral",
    "dividend"
  );
}

/** What a fund costs to hold, which is the figure that decides its result. */
function feeReading(f: CompanyFacts): CompanyReading {
  const fee = f.expenseRatio;
  const plain = has(fee)
    ? `On every $10,000 you hold, this fund charges about ${currency(fee * 10_000, 0)} a year, taken out before you see it.`
    : null;
  /*
    Over thirty years the fee is usually the largest single thing anybody
    can control about a fund, and it is the one number a fund page must
    lead on. A tenth of a percent is what the cheapest broad index funds
    charge; anything approaching one percent is an active fund and has to
    beat the market by that much just to draw level.
  */
  const tone: ReadingTone = has(fee)
    ? fee <= 0.002
      ? "good"
      : fee >= 0.0075
        ? "watch"
        : "neutral"
    : "neutral";
  return reading(
    "fee",
    "Annual charge",
    has(fee) ? percent(fee, 2) : NO_VALUE,
    plain,
    has(fee)
      ? `Held for thirty years, that compounds: at ${percent(fee, 2)} a year roughly ${percent(1 - Math.pow(1 - fee, 30), 0)} of what you would otherwise have ends up with the fund instead. The cheapest broad funds charge under 0.10%.`
      : "The cheapest broad index funds charge under 0.10% a year. Anything near 1% has to beat the market by that much every year just to draw level.",
    tone
  );
}

/**
 * The set of readings for this company, in the order somebody asking "what
 * is this?" would want them.
 *
 * A fund and a coin get a shorter list rather than a list of blanks: a fund
 * has no customers and a coin has no profit, so printing "what customers
 * paid them: n/a" against one is not an honest gap, it is a category
 * mistake this app made.
 */
export function companyReadings(f: CompanyFacts): CompanyReading[] {
  /*
    A coin has no accounts. There is no revenue to grow, no profit to keep
    and nothing owed to anybody, so the only honest figures are what the
    whole thing is worth and where the price has been. Printing eight
    headings and six `n/a`s beside them would not be a gap in our data, it
    would be this app asking a question that does not apply and then
    reporting that nobody answered it.
  */
  if (isCryptoLike(f)) {
    return [sizeReading(f), rangeReading(f)];
  }
  /*
    A fund is not a company either: it owns them. What decides how a fund
    turns out is what it holds and what it charges, and the charge is the
    one number a holder can actually control, so it leads.
  */
  if (isFundLike(f)) {
    return [feeReading(f), sizeReading(f), rangeReading(f), dividendReading(f)];
  }
  return [
    priceTagReading(f),
    earningsGrowthReading(f),
    growthReading(f),
    profitReading(f),
    salesReading(f),
    balanceReading(f),
    sizeReading(f),
    rangeReading(f),
    dividendReading(f),
  ];
}

/**
 * How many of the readings actually carry a figure, so the page can say
 * "four of these eight came back empty for this company" rather than
 * quietly presenting a thin answer as a full one.
 */
export function readingsWithFigures(readings: CompanyReading[]): number {
  return readings.filter((r) => r.value !== NO_VALUE).length;
}
