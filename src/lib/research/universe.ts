/**
 * The companies Upside Lab publishes a public research page for.
 *
 * Everything about this list is a bound rather than a preference. A public
 * page is a page a stranger can open without an account, which means three
 * costs the app has never paid before: a provider call for a company
 * nobody here has ever looked at, a model run to write the page, and a URL
 * a crawler will come back to forever. An open front door on
 * `/research/<anything>` pays all three for every symbol anybody can type,
 * which is unbounded on all three axes at once.
 *
 * So the public universe is a closed list, checked before a single fetch
 * happens, and the page for a symbol outside it does not exist. What that
 * buys is exact: the model spend is at most this many companies times the
 * refresh rate (see `warm.ts`), the crawl surface is exactly this many
 * URLs, and the sitemap can name every one of them.
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
 * Is there a public page for this symbol?
 *
 * Asked before anything is fetched, on every entry point: the page, the
 * social image, the sitemap and the warmer. A symbol outside the list is
 * not a page that failed to load, it is a page that does not exist, and it
 * answers 404 rather than spending a provider call to find that out.
 */
export function isResearchTicker(raw: string): boolean {
  return BY_TICKER.has(normalizeResearchTicker(raw));
}

export function researchGroupFor(raw: string): ResearchGroup | null {
  return BY_TICKER.get(normalizeResearchTicker(raw)) ?? null;
}

/** `/research/NVDA`. One place builds it so a link and its reader agree. */
export function researchHref(ticker: string): string {
  return `/research/${encodeURIComponent(normalizeResearchTicker(ticker))}`;
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
