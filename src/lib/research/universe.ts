/**
 * The companies Upside Lab publishes a public research page for, and the
 * rule for every other company somebody might share a link to.
 *
 * Everything about this list is a bound rather than a preference. A public
 * page is a page a stranger can open without an account, which means three
 * costs the app has never paid before: a provider call for a company
 * nobody here has ever looked at, a model run to write the page, and a URL
 * a crawler will come back to forever.
 *
 * TWO TIERS, AND EACH COST IS BOUNDED BY A DIFFERENT ONE.
 *
 * The published list below is the front door: indexed, in the sitemap,
 * linked from the index, and kept written by the warmer (`warm.ts`), so the
 * model spend is at most this many companies times the refresh rate and the
 * crawl surface is exactly this many URLs.
 *
 * Every other symbol the market lists (`isOpenResearchTicker`) still gets a
 * page, because a reader inside the app shares a link to whatever company
 * they were reading and the person they sent it to has no account. That
 * page is unindexed, never warmed and never generates: it shows the
 * figures, the live price in the fair value zones, and the written half
 * only if somebody signed in has already had it written, which is the
 * ordinary case for a shared link. So it costs a provider call per company
 * per six hours, no model run ever, and adds nothing a crawler is invited
 * to, and the proxy caps how fast any one caller can walk through them
 * (`limitOpenResearchRequest`).
 *
 * **It is a list of listings, not of opinions.** The rule the rest of this
 * app already follows applies here with more force, because these pages
 * are read by people who have never met the product: no company is here
 * because anybody believes in it, and none is missing because anybody does
 * not. The test is whether an ordinary person could plausibly type the
 * name into a search box, which is why it is the largest listings, the
 * names that carry the news, and the broad funds most people's first
 * account holds. Nothing on this list is a recommendation and nothing on
 * the pages it generates may read as one.
 *
 * The groups are not decoration either. They are the only internal linking
 * this section has: a page carries the other names in its own group, so a
 * crawler arriving on one of them can reach the rest without going back to
 * the index, and a reader who came for one chip company can walk to the
 * others. A flat list of a hundred names would be a hundred dead ends.
 */

import { isQuotableTicker } from "@/lib/ticker";

export type ResearchGroup = {
  /** Used in the URL of nothing, and in the heading of the index. */
  id: string;
  /** What a person would call this set of companies. */
  title: string;
  /** One line, printed under the heading on the index. */
  blurb: string;
  tickers: readonly string[];
};

export const RESEARCH_GROUPS: readonly ResearchGroup[] = [
  {
    id: "chips",
    title: "Chips and the machines that make them",
    blurb:
      "The companies that design processors, and the far smaller number that build the equipment every chip is made on.",
    tickers: [
      "NVDA",
      "AMD",
      "AVGO",
      "TSM",
      "INTC",
      "QCOM",
      "MU",
      "ARM",
      "TXN",
      "AMAT",
      "LRCX",
      "ASML",
    ],
  },
  {
    id: "software",
    title: "Software and the internet",
    blurb:
      "Businesses that sell the same product to every customer, which is why their profit margins look nothing like a shop's.",
    tickers: [
      "MSFT",
      "GOOGL",
      "META",
      "ORCL",
      "CRM",
      "ADBE",
      "NOW",
      "PLTR",
      "SNOW",
      "SHOP",
      "UBER",
      "ABNB",
      "NFLX",
      "SPOT",
    ],
  },
  {
    id: "consumer",
    title: "Shops, brands and what people buy",
    blurb:
      "Companies whose customers are ordinary people, so their results say something about how those people are doing.",
    tickers: [
      "AAPL",
      "AMZN",
      "COST",
      "WMT",
      "HD",
      "NKE",
      "SBUX",
      "MCD",
      "TGT",
      "LULU",
      "CMG",
    ],
  },
  {
    id: "industry",
    title: "Cars, planes and heavy industry",
    blurb:
      "Businesses that make physical things, where a factory costs billions and a good year takes a decade to arrange.",
    tickers: [
      "TSLA",
      "RIVN",
      "F",
      "GM",
      "BA",
      "CAT",
      "DE",
      "GE",
      "LMT",
      "RTX",
      "HON",
      "UPS",
    ],
  },
  {
    id: "money",
    title: "Banks, cards and money",
    blurb:
      "The companies money moves through. Their accounts are read differently from everybody else's, and the page says how.",
    tickers: [
      "JPM",
      "BAC",
      "GS",
      "MS",
      "WFC",
      "V",
      "MA",
      "PYPL",
      "AXP",
      "SCHW",
      "BRK-B",
      "COIN",
      "HOOD",
      "SOFI",
    ],
  },
  {
    id: "health",
    title: "Medicine and health",
    blurb:
      "Companies whose next ten years often rest on a handful of drugs, and whose accounts show what those cost to find.",
    tickers: [
      "LLY",
      "UNH",
      "JNJ",
      "PFE",
      "MRK",
      "ABBV",
      "TMO",
      "AMGN",
      "NVO",
      "MRNA",
      "ISRG",
    ],
  },
  {
    id: "energy",
    title: "Energy and materials",
    blurb:
      "Businesses whose profit is mostly decided by a price nobody in the company sets.",
    tickers: ["XOM", "CVX", "COP", "OXY", "SLB", "NEE", "LIN", "FCX"],
  },
  {
    id: "media",
    title: "Media and telecoms",
    blurb:
      "What people watch, and the networks it arrives on. Two very different businesses that keep buying each other.",
    tickers: ["DIS", "CMCSA", "T", "VZ", "WBD", "RBLX"],
  },
  {
    id: "funds",
    title: "Funds that hold hundreds of companies at once",
    blurb:
      "A fund is not a company, so most of what a company page does cannot be done here. What it gets instead is what it costs and what is actually inside it.",
    tickers: ["SPY", "QQQ", "VOO", "VTI", "IWM", "DIA", "SCHD", "GLD"],
  },
] as const;

/** Every published ticker, in group order, deduplicated. */
export const RESEARCH_TICKERS: readonly string[] = Array.from(
  new Set(RESEARCH_GROUPS.flatMap((g) => g.tickers))
);

const BY_TICKER = new Map<string, ResearchGroup>(
  RESEARCH_GROUPS.flatMap((g) => g.tickers.map((t) => [t, g] as const))
);

/** Uppercase and trimmed, the one spelling this section stores. */
export function normalizeResearchTicker(raw: string): string {
  try {
    return decodeURIComponent(raw).trim().toUpperCase();
  } catch {
    return raw.trim().toUpperCase();
  }
}

/**
 * Is this symbol on the published list: indexed, in the sitemap, warmed?
 *
 * Asked by the sitemap, the warmer and the page's own metadata. A symbol
 * outside the list may still have a page (`isOpenResearchTicker`), but it
 * is never indexed and never written on this app's clock.
 */
export function isResearchTicker(raw: string): boolean {
  return BY_TICKER.has(normalizeResearchTicker(raw));
}

/**
 * Is there a public page for this symbol at all?
 *
 * The published list, or any symbol shaped like one the market lists.
 * Asked before anything is fetched: free text, a path traversal or a
 * sentence is refused here and answers 404 without a provider call. A
 * well-shaped symbol the feed knows nothing about is found out by the one
 * fetch, and answers 404 too.
 */
export function isOpenResearchTicker(raw: string): boolean {
  const ticker = normalizeResearchTicker(raw);
  if (!ticker) return false;
  if (BY_TICKER.has(ticker)) return true;
  return ticker.length <= 16 && isQuotableTicker(ticker);
}

export function researchGroupFor(raw: string): ResearchGroup | null {
  return BY_TICKER.get(normalizeResearchTicker(raw)) ?? null;
}

/**
 * `/stock/NVDA`. One place builds it so a link and its reader agree.
 *
 * The public page and the room inside the app are one address. It used to
 * be `/research/NVDA` for strangers and `/stock/NVDA` for readers with an
 * account, which meant the link the app shared was the one a stranger
 * could not open and the one a search engine indexed was the one nobody
 * shared. The old public address answers with a permanent redirect
 * (`legacyRedirectPath`).
 */
export function researchHref(ticker: string): string {
  return `/stock/${encodeURIComponent(normalizeResearchTicker(ticker))}`;
}

/**
 * The other companies on this page's own group, for the row at the foot.
 *
 * Ordered from the ticker's own position onward and wrapped, so the six
 * shown differ from name to name within a group rather than every page in
 * the group linking to the same six. A group where every member points at
 * the same handful leaves the rest of it reachable only from the index,
 * which is the shape that gets a page crawled once a quarter.
 */
export function researchNeighbours(raw: string, count = 6): string[] {
  const ticker = normalizeResearchTicker(raw);
  const group = BY_TICKER.get(ticker);
  if (!group) return [];
  const others = group.tickers.filter((t) => t !== ticker);
  if (others.length <= count) return [...others];
  const start = group.tickers.indexOf(ticker);
  const out: string[] = [];
  for (let i = 0; out.length < count; i += 1) {
    const pick = others[(start + i) % others.length];
    if (pick) out.push(pick);
  }
  return out;
}
