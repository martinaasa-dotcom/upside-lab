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
import type { CompanyFacts } from "@/lib/company/facts";
import { isCryptoLike, isFundLike } from "@/lib/company/facts";

export type ReadingTone = "good" | "watch" | "neutral";

export type CompanyReading = {
  id: string;
  /** Ordinary words. Never the market's own name for the number. */
  label: string;
  /** The figure, formatted, or NO_VALUE. */
  value: string;
  /** The same figure as a sentence, or null when there is no figure. */
  plain: string | null;
  /** What ordinary looks like. Always present, figure or no figure. */
  compare: string;
  tone: ReadingTone;
  /** Key into `GLOSSARY`, where this app already defines the outside word. */
  glossary?: string;
};

/** Big money in words: $3.4 trillion reads, $3,400,000,000,000 does not. */
export function bigMoney(value: number | null | undefined, code = "USD"): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return NO_VALUE;
  const sign = value < 0 ? "-" : "";
  const n = Math.abs(value);
  if (n >= 1e12) return `${sign}${currency(n / 1e12, 2, code)} trillion`;
  if (n >= 1e9) return `${sign}${currency(n / 1e9, 1, code)} billion`;
  if (n >= 1e6) return `${sign}${currency(n / 1e6, 1, code)} million`;
  return currency(value, 0, code);
}

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
  glossary?: string
): CompanyReading {
  return { id, label, value, plain, compare, tone, glossary };
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
  const plain = has(v)
    ? `Buying every share of this company at today's price would cost ${bigMoney(v, code)}.`
    : null;
  return reading(
    "size",
    "What the whole company is worth",
    bigMoney(v, code),
    plain,
    "Under $2 billion is small, $10 billion to $200 billion is the middle of the market, and above that are the few dozen everybody has heard of.",
    "neutral",
    "market-value"
  );
}

function salesReading(f: CompanyFacts): CompanyReading {
  const code = f.currency ?? "USD";
  const plain = has(f.revenue)
    ? `Customers paid this company ${bigMoney(f.revenue, code)} over the last twelve months.`
    : null;
  return reading(
    "sales",
    "What customers paid them",
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
      ? `They sold ${percent(g)} more than in the same stretch a year ago.`
      : g < 0
        ? `They sold ${percent(Math.abs(g))} less than in the same stretch a year ago.`
        : "They sold about the same as a year ago."
    : null;
  const tone: ReadingTone = has(g) ? (g < 0 ? "watch" : "good") : "neutral";
  return reading(
    "growth",
    "Whether that is growing",
    has(g) ? percent(g) : NO_VALUE,
    plain,
    "The economy grows a few percent a year, so anything above that is real growth. Falling sales is the one figure here worth stopping on.",
    tone,
    "sales-growth"
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
  return reading(
    "profit",
    "Whether they make money",
    has(m) ? percent(m) : NO_VALUE,
    plain,
    "Most large companies keep $5 to $15 of every $100. A young company losing money on purpose is a choice, and it works only while somebody keeps lending it the difference.",
    tone,
    "profit-margin"
  );
}

function balanceReading(f: CompanyFacts): CompanyReading {
  const code = f.currency ?? "USD";
  const cash = f.totalCash;
  const debt = f.totalDebt;
  if (!has(cash) && !has(debt)) {
    return reading(
      "balance",
      "Cash against what they owe",
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
      ? `They hold ${bigMoney(cash, code)} in cash against ${bigMoney(debt, code)} of debt, so ${bigMoney(net, code)} more cash than debt.`
      : `They hold ${bigMoney(cash, code)} in cash against ${bigMoney(debt, code)} of debt, so ${bigMoney(Math.abs(net), code)} more debt than cash.`;
  /*
    The tone turns on the size of the gap rather than its sign, because
    borrowing is an ordinary way to run a company and a rose flag on every
    company carrying any debt is a flag a reader learns to ignore. A debt
    load worth more than a year and a half of sales is the point at which
    the lenders start being part of the story.
  */
  const heavy =
    has(debt) && has(f.revenue) && f.revenue > 0 && debt > f.revenue * 1.5;
  return reading(
    "balance",
    "Cash against what they owe",
    bigMoney(net, code),
    plain,
    "More cash than debt means a bad year is survivable without asking anybody. Owing more than a year of sales means the lenders have a say too.",
    net >= 0 ? "good" : heavy ? "watch" : "neutral",
    "debt"
  );
}

function priceTagReading(f: CompanyFacts): CompanyReading {
  const pe = f.trailingPe ?? f.forwardPe;
  const forwardOnly = !has(f.trailingPe) && has(f.forwardPe);
  const plain = has(pe)
    ? `At today's price you are paying about ${currency(pe, 0)} for every $1 of profit the company makes in a year${forwardOnly ? ", counting the profit analysts expect next year rather than last year's" : ""}.`
    : null;
  /*
    No tone. Expensive is not the same as bad and cheap is not the same as
    safe: a company growing fast is supposed to cost more than one standing
    still, and the cheapest companies on the market are usually cheap for a
    reason somebody has already spotted. Colouring this figure would be the
    one place on the page where a single number reads as a verdict.
  */
  return reading(
    "price-tag",
    "How expensive the shares are",
    has(pe) ? `${number(pe, 1)}x` : NO_VALUE,
    plain,
    "The whole US market has averaged near 20x over the long run. Higher usually means people expect the profit to grow, and that more has to go right.",
    "neutral",
    "price-to-earnings"
  );
}

function rangeReading(f: CompanyFacts): CompanyReading {
  const code = f.currency ?? "USD";
  const { price, fiftyTwoWeekHigh: high, fiftyTwoWeekLow: low } = f;
  if (!has(price) || !has(high) || !has(low) || high <= low) {
    return reading(
      "range",
      "Where the price sits this year",
      NO_VALUE,
      null,
      "Near the top or the bottom of its own year says nothing about what happens next. It says how much the people holding it have changed their minds lately.",
      "neutral"
    );
  }
  const spot = Math.min(Math.max((price - low) / (high - low), 0), 1);
  const plain = `Over the last year it has traded between ${currency(low, 2, code)} and ${currency(high, 2, code)}. Today it sits about ${percent(spot, 0)} of the way up that range.`;
  return reading(
    "range",
    "Where the price sits this year",
    percent(spot, 0),
    plain,
    "Near the top or the bottom of its own year says nothing about what happens next. It says how much the people holding it have changed their minds lately.",
    "neutral"
  );
}

function dividendReading(f: CompanyFacts): CompanyReading {
  const y = f.dividendYield;
  const pays = has(y) && y > 0;
  const plain = pays
    ? `For every $100 of shares you hold, they have been paying out about ${currency(y * 100, 2)} a year in cash.`
    : "They pay nothing out. Everything they earn stays in the business, which is the ordinary choice for a company still growing fast.";
  return reading(
    "dividend",
    "Whether they pay you to hold it",
    pays ? percent(y, 2) : "Nothing",
    plain,
    "Cash that arrives whether the price moves or not. Not free money: it comes out of the company, which then has that much less to spend on growing.",
    "neutral",
    "dividend"
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
  if (isCryptoLike(f)) {
    return [sizeReading(f), rangeReading(f)];
  }
  if (isFundLike(f)) {
    return [sizeReading(f), rangeReading(f), dividendReading(f)];
  }
  return [
    sizeReading(f),
    salesReading(f),
    growthReading(f),
    profitReading(f),
    balanceReading(f),
    priceTagReading(f),
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
