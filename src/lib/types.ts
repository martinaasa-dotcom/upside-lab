import type { SplitEvent } from "@/lib/market/corporate-actions";
import type { ClassroomTrade } from "@/lib/classroom";

export type Portfolio = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  cash_balance: number;
  /**
   * Primary/creator owner (legacy column). Authorization uses
   * portfell_portfolio_owners — see coOwnerIds when present.
   */
  owner_id?: string | null;
  /** Co-owner user ids when API includes them. */
  coOwnerIds?: string[];
  /** Homework sheet for this class. Isolated from any real book. */
  classroom_community_id?: string | null;
  /** What the class currently allows on this sheet. */
  classTrade?: ClassroomTrade | null;
};

export type Holding = {
  id: string;
  portfolio_id: string;
  ticker: string;
  shares: number;
  buy_price: number;
  eoy_target: number | null;
  target_call_pct: number;
  /** Manual Stock Target override; null = use resistance model */
  stock_target_override: number | null;
  sort_order: number;
  /**
   * When this row was last written. Optional because a snapshot restore and
   * the demo seed both build holdings without one. Used to decide whether a
   * share count predates a split.
   */
  updated_at?: string | null;
};

export type Quote = {
  ticker: string;
  /** Newest print: pre-market, after-hours, or regular last */
  price: number;
  change: number;
  /** Fraction, e.g. 0.015 = +1.5% */
  changePercent: number;
  previousClose: number;
  sparkline: number[];
  /** Yahoo marketState: PREPRE | PRE | REGULAR | POST | POSTPOST | CLOSED | … */
  marketState: string | null;
  preMarketPrice: number | null;
  preMarketChange: number | null;
  /** Fraction */
  preMarketChangePercent: number | null;
  postMarketPrice: number | null;
  postMarketChange: number | null;
  /** Fraction */
  postMarketChangePercent: number | null;
  /** Dated regular-session closes, newest last. Used to value a book as-of a day. */
  dailyCloses?: { date: string; close: number }[];
  /** Listing currency after GBp→GBP. Book `price` is still USD. */
  currency?: string | null;
  /** Last price in listing currency (pounds, not pence). */
  nativePrice?: number | null;
  /** True when this print came from last-known cache, not a live feed. */
  stale?: boolean;
  /** Epoch ms when this print was actually fetched. */
  quotedAt?: number;
  /**
   * Splits inside the fetched history window, oldest first.
   *
   * The price a feed hands over is already split adjusted and a reader's
   * stored share count is not, so a tracker with no idea a split happened
   * reports a real position as down 90% and means it. This is the fact
   * that lets `corporate-actions.ts` say so.
   */
  splits?: SplitEvent[];
};

export type OptionCandidate = {
  ticker: string;
  expiration: string;
  strike: number;
  bid: number;
  ask: number;
  mid: number;
  otmPct: number;
  yield2w: number;
  premium: number;
  contracts: number;
  daysToExpiry: number;
  /** Resistance / local-high used as stock target */
  stockTarget: number;
  /** (stockTarget - spot) / spot */
  targetDistance: number;
};

export type EnrichedHolding = Holding & {
  quote: Quote | null;
  buyValue: number;
  currentValue: number;
  roiPct: number;
  roiDollar: number;
  pctOfTotal: number;
};

/** Unified covered-call / yield row */
export type CoveredCallRow = {
  holding: Holding;
  spot: number;
  totalValue: number;
  yield2w: number | null;
  premium: number | null;
  targetCall: number;
  stockTarget: number | null;
  targetDistance: number | null;
  nextStrike: number | null;
  expiration: string | null;
  contracts: number;
  option: OptionCandidate | null;
};

export type PortfolioSnapshot = {
  portfolio: Portfolio;
  holdings: EnrichedHolding[];
  coveredCallRows: CoveredCallRow[];
  totals: {
    buyValue: number;
    currentValue: number;
    roiDollar: number;
    roiPct: number;
    yield2wAvg: number;
    premiumTotal: number;
    unrealizedProfits: number;
  };
};
