/**
 * A made-up portfolio having a bad day, so the first screen of the
 * walkthrough can be tapped rather than read.
 *
 * Named for the tour rather than for samples in general, because
 * `sample-portfolio.ts` is a different thing built in the same pass: that
 * one is the landing page's figures and the demo a stranger can open, and
 * it derives every total from one list of holdings. This one is a fixed
 * bad day with a company that had news in it, which is a story rather than
 * a portfolio, and the two must not drift into each other.
 *
 * The whole product turns on one distinction, and it is a distinction
 * nobody can be told: a screen of red numbers looks identical whether the
 * market fell or something happened at a company you own. So the
 * walkthrough opens on eight rows of red and asks which one of them is the
 * odd one out. Getting it wrong is the point as much as getting it right,
 * because either way the reader has just done by hand the thing Pulse does
 * for them every day.
 *
 * ## Everything here is made up, and it says so on the screen
 *
 * The companies are real because a sample nobody recognises teaches
 * nothing, but the share counts, the prices and the day are invented, and
 * the screen that draws this says that in its first line. Nothing in here
 * is a record of anything that happened: the company with news is the one
 * piece of fiction that matters, and its verdict is written as a made-up
 * event on a made-up day rather than as a claim about a real one.
 *
 * ## Why the arithmetic is derived and not typed
 *
 * The screen states a portfolio value, a dollar move for the day and a
 * share of that move for one company, and a reader can add the rows up.
 * Typing those totals in beside the rows is how they drift the first time
 * somebody changes a share count. So the file stores only what a portfolio
 * really stores, shares and a price and the day's percent, and everything
 * else is worked out from those. `sample-portfolio.test.ts` checks that the
 * rows still add up to the totals, that exactly one company had news, and
 * that the other seven really did move with the market.
 */

/** Pulse's own three badges. The wording is the reader-facing one. */
export type SampleBadge = "Thesis intact" | "Thesis watch";

export type SampleHolding = {
  ticker: string;
  /** The company as a person says it, never a cashtag. */
  company: string;
  /** Three or four words on what it does, for a reader who does not know. */
  does: string;
  shares: number;
  /** Today's share price, in dollars. */
  price: number;
  /** Today's move as a fraction. Negative on this day for all eight. */
  dayPct: number;
  /** True for the one company that had something happen to it. */
  news: boolean;
  badge: SampleBadge;
  /** What Pulse says about the day, in one sentence. */
  verdict: string;
};

/**
 * What the whole market did on this made-up day.
 *
 * It is the number the seven quiet rows are read against: each of them
 * lands within `MARKET_SPREAD` of it, which is what "fell with the market"
 * means and what the test holds them to.
 */
export const SAMPLE_MARKET_PCT = -0.012;

/** How far a company may sit from the market and still just be the market. */
export const MARKET_SPREAD = 0.011;

export const SAMPLE_HOLDINGS: SampleHolding[] = [
  {
    ticker: "AAPL",
    company: "Apple",
    does: "makes iPhones and Macs",
    shares: 40,
    price: 232.4,
    dayPct: -0.012,
    news: false,
    badge: "Thesis intact",
    verdict:
      "Down almost exactly what the whole market was down. Nothing came out of Apple today.",
  },
  {
    ticker: "MSFT",
    company: "Microsoft",
    does: "makes software for work",
    shares: 15,
    price: 418.6,
    dayPct: -0.015,
    news: false,
    badge: "Thesis intact",
    verdict:
      "A little worse than the market and no reason for it. Big software companies tend to move together on a day like this.",
  },
  {
    ticker: "NVDA",
    company: "Nvidia",
    does: "makes computer chips",
    shares: 30,
    price: 121.3,
    dayPct: -0.021,
    news: false,
    badge: "Thesis intact",
    verdict:
      "The loudest of the quiet ones. It moves further than the market in both directions, which is how it has always behaved.",
  },
  {
    ticker: "AMZN",
    company: "Amazon",
    does: "runs the online shop",
    shares: 20,
    price: 178.9,
    dayPct: -0.014,
    news: false,
    badge: "Thesis intact",
    verdict:
      "In line with the market. Nothing was announced and nothing was reported.",
  },
  {
    ticker: "KO",
    company: "Coca-Cola",
    does: "sells drinks",
    shares: 60,
    price: 71.2,
    dayPct: -0.004,
    news: false,
    badge: "Thesis intact",
    verdict:
      "Barely moved. Companies selling things people buy every week usually fall less on a bad day.",
  },
  {
    ticker: "JNJ",
    company: "Johnson and Johnson",
    does: "makes medicines",
    shares: 25,
    price: 162.5,
    dayPct: -0.006,
    news: false,
    badge: "Thesis intact",
    verdict:
      "Down less than the market, for the same reason as Coca-Cola. Steady businesses are where money goes on a nervous day.",
  },
  {
    ticker: "VOO",
    company: "Vanguard S&P 500",
    does: "holds 500 big American companies",
    shares: 12,
    price: 512.8,
    dayPct: -0.011,
    news: false,
    badge: "Thesis intact",
    verdict:
      "This one is the market, near enough. When it falls, almost everything fell.",
  },
  {
    ticker: "NKE",
    company: "Nike",
    does: "sells trainers and sportswear",
    shares: 45,
    price: 74.1,
    dayPct: -0.094,
    news: true,
    badge: "Thesis watch",
    verdict:
      "This is the one. On this made-up day Nike told everyone it expects to sell less this year than it said in the spring, so it fell about eight times as far as the market and on its own news rather than everyone else's.",
  },
];

/** What this row is worth right now. */
export function sampleValue(h: SampleHolding): number {
  return h.shares * h.price;
}

/**
 * What today did to this row, in dollars.
 *
 * Today's price is after the move, so yesterday's is `price / (1 + pct)`
 * and the day is the gap between the two. Working backwards from the
 * price the reader can see is the only version that cannot disagree with
 * the row printed beside it.
 */
export function sampleDayDollar(h: SampleHolding): number {
  return sampleValue(h) * (h.dayPct / (1 + h.dayPct));
}

export type SampleTotals = {
  /** Everything the portfolio is worth today. */
  value: number;
  /** What today took off it, in dollars. Negative on this day. */
  dayDollar: number;
  /** That move as a fraction of yesterday's value. */
  dayPct: number;
  /** The one company with news, and its share of the day's fall. */
  newsTicker: string;
  newsDollar: number;
  newsShareOfDay: number;
};

export function sampleTotals(
  holdings: SampleHolding[] = SAMPLE_HOLDINGS
): SampleTotals {
  const value = holdings.reduce((sum, h) => sum + sampleValue(h), 0);
  const dayDollar = holdings.reduce((sum, h) => sum + sampleDayDollar(h), 0);
  const news = holdings.find((h) => h.news) ?? holdings[0]!;
  const newsDollar = sampleDayDollar(news);
  return {
    value,
    dayDollar,
    dayPct: dayDollar / (value - dayDollar),
    newsTicker: news.ticker,
    newsDollar,
    newsShareOfDay: dayDollar === 0 ? 0 : newsDollar / dayDollar,
  };
}

/** How many rows a reader has to turn over before the summary arrives. */
export const SAMPLE_TAPS_BEFORE_SUMMARY = 2;
