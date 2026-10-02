import type { DemoStore } from "@/lib/demo-store";
import { saveDemoStore } from "@/lib/demo-store";
import type { Holding, Portfolio } from "@/lib/types";

/**
 * One made-up portfolio, doing two jobs.
 *
 * The first job is the landing page's film (`landing-film.ts`), which
 * plays a made-up week on five of these companies with these share counts,
 * opening at `previousClose`. Every figure on the old sample cards used to
 * be typed in beside the words it belonged to, and none of them agreed:
 * three of the eight holdings implied positions worth $143,000 inside an
 * $87,770 portfolio. A reader with a calculator finds that in a minute, on
 * the one card whose entire purpose is to be believed. So there is one list
 * of holdings here and every figure the page prints is derived from it.
 *
 * The second job is looking around. A stranger used to be asked to hand
 * over a Google account before seeing a single real screen. Now the same
 * eight companies open the real app: the same rooms, the same panels, the
 * same reasoning, on holdings nobody owns. The share counts and what was
 * paid are invented. THE PRICES ARE NOT. `/api/quotes` answers a caller
 * with no session (verified against the running app), so a look-around
 * reader gets today's real prices through the same path a signed-in reader
 * does, and the page says so in as many words. This app never puts a
 * modelled figure where a price goes, and a demo is not an exception.
 *
 * `previousClose` and `price` below are a frozen made-up day, labelled as
 * made up wherever it appears. They are never used to price anything
 * inside the app.
 *
 * Nobody real is in here. Four actual people's holdings used to sit in
 * `demo-store.ts` in a public repository, which is why that file has no
 * seed any more. The rule this replaces it with is simple: a sample is
 * invented, obviously invented, and named so that nobody could read it as
 * their own.
 */

export type SampleHolding = {
  ticker: string;
  /** How a person says it out loud. Never a cashtag in reader copy. */
  company: string;
  /** Three or four words on what the company does, per the Sunday letter rule. */
  does: string;
  shares: number;
  buyPrice: number;
  /** The price the landing's made-up week opens at. */
  previousClose: number;
  /** A made-up close, which the checks on this sample add up against. */
  price: number;
};

/**
 * Eight companies almost anybody can name, a fund among them, because a
 * sample of companies nobody has heard of teaches nothing.
 *
 * Some are up on what was paid for them and some are down, because a
 * portfolio where everything worked is not one anybody recognises.
 */
export const SAMPLE_HOLDINGS: readonly SampleHolding[] = [
  {
    ticker: "VOO",
    company: "Vanguard S&P 500",
    does: "a fund holding 500 big American companies",
    shares: 11,
    buyPrice: 390.1,
    previousClose: 518.22,
    price: 512,
  },
  {
    ticker: "NVDA",
    company: "Nvidia",
    does: "which makes computer chips",
    shares: 22,
    buyPrice: 96.3,
    previousClose: 151.17,
    price: 148,
  },
  {
    ticker: "AAPL",
    company: "Apple",
    does: "which makes iPhones",
    shares: 14,
    buyPrice: 168.4,
    previousClose: 235.06,
    price: 232,
  },
  {
    ticker: "KO",
    company: "Coca-Cola",
    does: "which sells fizzy drinks",
    shares: 40,
    buyPrice: 58.2,
    previousClose: 66.77,
    price: 66.5,
  },
  {
    ticker: "MSFT",
    company: "Microsoft",
    does: "which makes Windows and Office",
    shares: 5,
    buyPrice: 305.2,
    previousClose: 408.12,
    price: 402,
  },
  {
    ticker: "AMZN",
    company: "Amazon",
    does: "the online shop",
    shares: 9,
    buyPrice: 142.7,
    previousClose: 217.04,
    price: 214,
  },
  {
    ticker: "NKE",
    company: "Nike",
    does: "which makes trainers",
    shares: 18,
    buyPrice: 96,
    previousClose: 81.9,
    price: 74.2,
  },
  {
    ticker: "DIS",
    company: "Disney",
    does: "the films and theme parks",
    shares: 12.5,
    buyPrice: 104,
    previousClose: 98.08,
    price: 97.3,
  },
] as const;

/**
 * A small positive cash line, because most people have a little sitting
 * there. Nothing here is ever borrowed: a sample is a poor place to
 * introduce somebody to a margin loan.
 */
export const SAMPLE_CASH = 640;

/**
 * The name a reader sees on the portfolio, in the dock and at the top of
 * every room. It has to be unmistakable at a glance, because the whole
 * risk of a demo that looks exactly like the app is somebody thinking
 * these numbers are theirs.
 */
/* One word: "Sample portfolio" did not fit its dock cell and read "Sample po...". */
export const SAMPLE_PORTFOLIO_NAME = "Sample";

/** One holding by its symbol. Throws rather than returning undefined, so a
 *  typo in a call site fails at once instead of printing "n/a" at a reader. */
export function sampleHoldingBy(ticker: string): SampleHolding {
  const row = SAMPLE_HOLDINGS.find((h) => h.ticker === ticker);
  if (!row) throw new Error(`No sample holding for ${ticker}`);
  return row;
}

/** What a holding is worth on the made-up day. */
export function sampleValue(row: SampleHolding): number {
  return row.shares * row.price;
}



/** Everything the companies are worth, cash left out. */
export function sampleStocksValue(): number {
  return SAMPLE_HOLDINGS.reduce((sum, row) => sum + sampleValue(row), 0);
}

/** Everything the portfolio is worth, cash included. This is the headline. */
export function sampleTotalValue(): number {
  return sampleStocksValue() + SAMPLE_CASH;
}

/** What was paid for all of it. */
export function sampleCostValue(): number {
  return SAMPLE_HOLDINGS.reduce(
    (sum, row) => sum + row.shares * row.buyPrice,
    0
  );
}



/** Gain since it was bought, in money. */
export function sampleAllTimeDollars(): number {
  return sampleStocksValue() - sampleCostValue();
}

/** Gain since it was bought, as a fraction. */
export function sampleAllTimeFraction(): number {
  return sampleAllTimeDollars() / sampleCostValue();
}




/* ------------------------------------------------- looking around */

/**
 * The key that says a reader chose to look around.
 *
 * Deliberately its own key rather than a flag inside the demo store: what
 * it records is a decision a person made on the landing page, and it has
 * to survive being read before any store is loaded. Clearing it is the
 * whole of leaving.
 */
export const LOOK_AROUND_KEY = "upside-look-around";

/**
 * Fired at the window when look-around starts or stops, so the gate can
 * change what it is drawing without a reload. Same shape as the analytics
 * consent event, for the same reason: two components need one answer.
 */
export const LOOK_AROUND_EVENT = "upside:look-around";

export function isLookingAround(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(LOOK_AROUND_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The sample as the app's own store shape, so every room reads it exactly
 * the way it reads a real portfolio.
 *
 * `eoy_target` is left null and `stock_target_override` too, because those
 * are opinions a reader writes down and a sample has no business having
 * any. `target_call_pct` is the app's own default.
 */
export function sampleDemoStore(): DemoStore {
  const portfolio: Portfolio = {
    id: "sample-portfolio",
    name: SAMPLE_PORTFOLIO_NAME,
    slug: "sample-portfolio",
    sort_order: 1,
    cash_balance: SAMPLE_CASH,
  };
  const holdings: Holding[] = SAMPLE_HOLDINGS.map((row, i) => ({
    id: `sample-${row.ticker.toLowerCase()}`,
    portfolio_id: portfolio.id,
    ticker: row.ticker,
    shares: row.shares,
    buy_price: row.buyPrice,
    eoy_target: null,
    target_call_pct: 0.15,
    stock_target_override: null,
    sort_order: i + 1,
  }));
  return { portfolios: [portfolio], holdings };
}

/**
 * The store a look-around reader gets, or null for everybody else.
 *
 * Built fresh every time rather than read back from anywhere, which is
 * what makes looking around leave nothing behind: whatever a curious
 * visitor changes on screen is gone the moment the page reloads, and
 * nothing they do can be mistaken later for a portfolio somebody meant to
 * keep.
 */
export function lookAroundStore(): DemoStore | null {
  return isLookingAround() ? sampleDemoStore() : null;
}

/**
 * Start looking around.
 *
 * The sample is written into the demo store as well as flagged, because
 * the rooms read that store and a reader who lands mid-render should not
 * see an empty portfolio first. It cannot collide with anybody's own local
 * save: looking around is only reachable from the signed-out landing, and
 * the landing only exists when Supabase is configured, which is exactly
 * when nothing else reads the demo store.
 */
export function startLookingAround() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOOK_AROUND_KEY, "1");
    saveDemoStore(sampleDemoStore());
  } catch {
    /* a browser with storage switched off simply cannot look around */
  }
  window.dispatchEvent(new Event(LOOK_AROUND_EVENT));
}

/** Stop, and leave nothing behind but the reader's own consent answer. */
export function stopLookingAround() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LOOK_AROUND_KEY);
  } catch {
    /* nothing to clear */
  }
  window.dispatchEvent(new Event(LOOK_AROUND_EVENT));
}
