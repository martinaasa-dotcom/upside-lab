/**
 * What one company is, in the fields a person actually asked about, and
 * nothing a model wrote.
 *
 * This file is the boundary the whole Look up a company room rests on. A
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

  /** Oldest first, at most four. */
  history: CompanyYear[];

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

/** A fund holds companies rather than being one, so most of this is moot. */
export function isFundLike(facts: CompanyFacts): boolean {
  const kind = (facts.kind ?? "").toUpperCase();
  return kind === "ETF" || kind === "MUTUALFUND" || kind === "INDEX";
}

export function isCryptoLike(facts: CompanyFacts): boolean {
  return (facts.kind ?? "").toUpperCase() === "CRYPTOCURRENCY";
}
