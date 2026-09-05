/**
 * What one company is, in the fields a person actually asked about, and
 * nothing a model wrote.
 *
 * This file is the boundary the whole Research room rests on. A
 * reader arriving here is deciding what to do with their own money off
 * numbers they have no way of checking, so the split is absolute: every
 * figure on that page comes from a provider and lands in one of these
 * fields, and everything a model says is prose sitting beside them. A
 * model may name a figure only where this file already put it on screen.
 *
 * So every field is nullable and nothing is derived optimistically. A feed
 * that answered with nothing yields `null`, which the reader sees as
 * `NO_VALUE`, because "we do not have this" is a true sentence and a
 * plausible-looking guess is not. The rule that keeps `fallbackQuotes` out
 * of `fetchQuotesWithFallback` is the same rule, one room further on.
 */

/** The four annual periods a feed usually carries, oldest first. */
export type CompanyYear = {
  /** Calendar year the period ended in. */
  year: number;
  revenue: number | null;
  netIncome: number | null;
};

/** One reported quarter, oldest first. `3Q2025` as the feed labels it. */
export type CompanyQuarter = {
  label: string;
  revenue: number | null;
  earnings: number | null;
  /** Profit as a share of revenue, that quarter. */
  margin: number | null;
};

/**
 * What the company earned in a quarter against what analysts had said it
 * would, which is the single most-read line on any company page and was
 * missing entirely. A run of beats and a run of misses are different
 * companies, and neither is visible in an annual figure.
 */
export type CompanySurprise = {
  label: string;
  actual: number | null;
  estimate: number | null;
  /** Actual against estimate, as a fraction. Positive is a beat. */
  surprise: number | null;
  reportedAt: string | null;
};

export type CompanyFacts = {
  /** The symbol as this app stores it, uppercase. */
  ticker: string;
  /** The symbol the provider was actually asked about, when it differs. */
  listedSymbol: string;
  /** "Nvidia Corporation", as the provider has it. */
  name: string | null;
  /** The company's own description of itself, unedited. */
  about: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  employees: number | null;
  website: string | null;
  /** ETF, MUTUALFUND, EQUITY, CRYPTOCURRENCY. Decides what may be said. */
  kind: string | null;
  /** The currency this listing's own figures are in. */
  currency: string | null;

  price: number | null;
  changePercent: number | null;
  marketCap: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;

  revenue: number | null;
  revenueGrowth: number | null;
  grossMargin: number | null;
  profitMargin: number | null;
  netIncome: number | null;
  freeCashFlow: number | null;
  totalCash: number | null;
  totalDebt: number | null;

  trailingPe: number | null;
  forwardPe: number | null;
  dividendYield: number | null;

  /** Profit per share, last twelve months and the year ahead. */
  epsTrailing: number | null;
  epsForward: number | null;
  sharesOutstanding: number | null;

  /*
    What the analysts covering it actually expect, which is a different
    thing from last year's figures and is what the market is pricing.
    Reading a fast-growing company off its trailing profit is how an
    estimate ends up a third of the share price with nothing wrong in the
    arithmetic: the profit it is being priced on has not happened yet.
  */
  epsThisYear: number | null;
  epsNextYear: number | null;
  epsGrowthThisYear: number | null;
  epsGrowthNextYear: number | null;
  revenueGrowthNextYear: number | null;

  /*
    The same questions asked of the whole market, from the feed's own index
    figures, so every growth number on the page has something real to be
    compared against instead of a rule of thumb written into this app.
  */
  marketEpsGrowthThisYear: number | null;
  marketEpsGrowthNextYear: number | null;
  marketLongTermGrowth: number | null;

  /** Oldest first, at most four. */
  history: CompanyYear[];
  /** The last four reported quarters, oldest first. */
  quarters: CompanyQuarter[];
  /** The last four results days, beat or miss, oldest first. */
  surprises: CompanySurprise[];

  /*
    The quality ladder. A margin on its own says how much is left at the
    end; these say where it goes on the way down, which is what separates
    a business with pricing power from one running on volume. `roe` is the
    return the company makes on the money its owners have left in it, and
    it is the figure most professionals look at before any of the others.
  */
  operatingMargin: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  operatingCashFlow: number | null;

  /*
    Funds only. A fund is not a company and asking it about its profit
    margin is a category mistake, so what it gets asked instead is what it
    costs to hold, what is actually inside it, and how concentrated that
    is. Empty on anything that is not a fund.
  */
  expenseRatio: number | null;
  fundCategory: string | null;
  fundFamily: string | null;
  topHoldings: { symbol: string; name: string; weight: number }[];
  sectorWeights: { sector: string; weight: number }[];

  /** How many analysts published a view, and where they land on average. */
  analystCount: number | null;
  /** The average of their twelve-month price targets. */
  analystTargetMean: number | null;
  analystTargetHigh: number | null;
  analystTargetLow: number | null;

  /** When this app asked the provider. */
  fetchedAt: string;
};

/**
 * A quarter's figures do not change between two page loads, so the key
 * that decides whether a written brief still describes this company is the
 * figures themselves rather than the clock. Revenue, profit, debt and the
 * share count are what a brief reasons from; a price move is handled
 * separately, by the anchor drift rule on the cache.
 *
 * Rounded before hashing so a feed restating a figure to another decimal
 * place does not throw away a perfectly good brief.
 */
export function companyFactsKey(facts: CompanyFacts): string {
  const round = (n: number | null, digits = 2): string =>
    typeof n === "number" && Number.isFinite(n) ? n.toFixed(digits) : "n";
  return [
    facts.ticker,
    round(facts.revenue, 0),
    round(facts.netIncome, 0),
    round(facts.totalDebt, 0),
    round(facts.totalCash, 0),
    round(facts.revenueGrowth, 4),
    round(facts.profitMargin, 4),
    facts.history.map((h) => `${h.year}:${round(h.revenue, 0)}`).join(","),
  ].join("|");
}

/**
 * Whether there is enough here to say anything at all.
 *
 * A page that renders six headings over six `n/a`s has told the reader
 * nothing and looks broken doing it. Deliberately generous about which
 * fields count, because a fund carries no revenue and a foreign listing
 * often carries no analyst coverage, and neither is a failure.
 */
export function factsAreThin(facts: CompanyFacts): boolean {
  const present = [
    facts.about,
    facts.marketCap,
    facts.revenue,
    facts.profitMargin,
    facts.trailingPe,
    facts.history.length > 0 ? 1 : null,
  ].filter((v) => v !== null && v !== undefined).length;
  return present < 2;
}

/**
 * The first couple of sentences of the company's own description.
 *
 * The raw field is a single unbroken paragraph running to two thousand
 * characters, written by a filing clerk: Meta's opens by listing every
 * product it has ever shipped and ends with the year it was incorporated.
 * Printed whole it is a wall of text at the top of the page, which is the
 * exact thing this room exists to replace, and a reader who wanted the
 * full version can open the company's own site from the sources at the
 * bottom.
 *
 * Sentence-aware rather than a character cut, because a description
 * chopped mid-clause reads as broken rather than as abridged. Abbreviations
 * that end in a period are the trap: "Inc." and "Corp." are not the end of
 * a sentence, and a naive split on a full stop cuts Meta's first line in
 * half at "Meta Platforms, Inc."
 */
export function shortDescription(about: string | null, sentences = 2): string | null {
  const text = (about ?? "").trim();
  if (!text) return null;
  const guarded = text.replace(
    /\b(Inc|Corp|Ltd|Co|plc|LLC|L\.L\.C|S\.A|N\.V|A\.G|Pty|Cos|St|No|approx|e\.g|i\.e|U\.S|U\.K)\./g,
    (m) => m.replace(/\./g, "\u0000")
  );
  const parts = guarded.match(/[^.!?]+[.!?]+/g);
  if (!parts || parts.length <= sentences) return text;
  return parts
    .slice(0, sentences)
    .join("")
    .replace(/\u0000/g, ".")
    .trim();
}

/** A fund holds companies rather than being one, so most of this is moot. */
export function isFundLike(facts: CompanyFacts): boolean {
  const kind = (facts.kind ?? "").toUpperCase();
  return kind === "ETF" || kind === "MUTUALFUND" || kind === "INDEX";
}

export function isCryptoLike(facts: CompanyFacts): boolean {
  return (facts.kind ?? "").toUpperCase() === "CRYPTOCURRENCY";
}
