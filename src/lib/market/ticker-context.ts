import { isCoinSymbol } from "@/lib/coins";
import { resolveYahooEarnings } from "@/lib/market/earnings-dates";
import { resolveYahooListedSymbol } from "@/lib/market/yahoo";
import { isMarketCircuitOpen, withMarketCircuit } from "@/lib/market/circuit-breaker";
import { safeHttpUrl } from "@/lib/safe-url";
import { sectorForTicker, type PulseHeadline } from "@/lib/thesis-pulse";
import { unstable_cache } from "next/cache";

type YahooFinanceInstance = InstanceType<
  typeof import("yahoo-finance2").default
>;

let yahoo: YahooFinanceInstance | null = null;

async function getYahoo(): Promise<YahooFinanceInstance> {
  if (yahoo) return yahoo;
  const { default: YahooFinance } = await import("yahoo-finance2");
  yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  return yahoo;
}

export type TickerPulseContext = {
  ticker: string;
  sector: string | null;
  lastEarningsDate: string | null;
  daysSinceLastEarnings: number | null;
  nextEarningsDate: string | null;
  daysUntilNextEarnings: number | null;
  lastSurprisePct: number | null;
  lastEpsActual: number | null;
  lastEpsEstimate: number | null;
  nextIsEstimate?: boolean;
  news: PulseHeadline[];
};

async function fetchTickerNewsUncached(
  ticker: string,
  listedSymbol: () => Promise<string>,
  count = 5
): Promise<PulseHeadline[]> {
  try {
    if (isMarketCircuitOpen("yahoo")) return [];
    const yf = await getYahoo();
    const symbol = await listedSymbol();
    const result = await withMarketCircuit("yahoo", () =>
      yf.search(symbol, { newsCount: count })
    );
    const items = result.news ?? [];
    return items.slice(0, count).map((n) => ({
      title: String(n.title ?? "").trim(),
      publisher: String(n.publisher ?? "News").trim(),
      link: safeHttpUrl(String(n.link ?? "").trim()) ?? "",
      publishedAt:
        n.providerPublishTime instanceof Date
          ? n.providerPublishTime.toISOString()
          : typeof n.providerPublishTime === "string"
            ? n.providerPublishTime
            : new Date().toISOString(),
    }));
  } catch (err) {
    console.error(`News fetch failed for ${ticker}`, err);
    return [];
  }
}

async function fetchTickerPulseContextUncached(
  ticker: string
): Promise<TickerPulseContext> {
  const base: TickerPulseContext = {
    ticker: ticker.toUpperCase(),
    sector: sectorForTicker(ticker),
    lastEarningsDate: null,
    daysSinceLastEarnings: null,
    nextEarningsDate: null,
    daysUntilNextEarnings: null,
    lastSurprisePct: null,
    lastEpsActual: null,
    lastEpsEstimate: null,
    nextIsEstimate: false,
    news: [],
  };

  /*
    One listing lookup per context, shared by both halves. The earnings
    summary and the news search each used to resolve the symbol for
    themselves, which on a name Yahoo does not list in the US is two walks
    down the whole suffix list for one answer.
  */
  let symbolPending: Promise<string> | null = null;
  const listedSymbol = () =>
    (symbolPending ??= resolveYahooListedSymbol(ticker)
      .then((symbol) => symbol ?? ticker)
      .catch(() => ticker));

  const [summaryResult, news] = await Promise.all([
    (async () => {
      if (isCoinSymbol(ticker)) return null;
      try {
        const yf = await getYahoo();
        if (isMarketCircuitOpen("yahoo")) return null;
        const symbol = await listedSymbol();
        return await withMarketCircuit("yahoo", () =>
          yf.quoteSummary(symbol, {
            modules: ["earningsHistory", "calendarEvents", "earnings"],
          })
        );
      } catch (err) {
        console.error(`Pulse context failed for ${ticker}`, err);
        return null;
      }
    })(),
    fetchTickerNewsUncached(ticker, listedSymbol),
  ]);

  base.news = news;

  if (!summaryResult) return base;

  try {
    const summary = summaryResult;

    const calendar = summary.calendarEvents?.earnings;
    const resolved = resolveYahooEarnings({
      history: summary.earningsHistory?.history ?? [],
      earningsDates: [
        ...(calendar?.earningsDate ?? []),
        ...(summary.earnings?.earningsChart?.earningsDate ?? []),
      ],
      earningsCallDates: calendar?.earningsCallDate ?? [],
      nextIsEstimate: calendar?.isEarningsDateEstimate,
    });
    base.lastEarningsDate = resolved.lastKey;
    base.daysSinceLastEarnings = resolved.daysSinceLast;
    base.nextEarningsDate = resolved.nextKey;
    base.daysUntilNextEarnings = resolved.daysUntilNext;
    base.nextIsEstimate = resolved.nextIsEstimate;
    base.lastSurprisePct = resolved.lastSurprisePct;
    base.lastEpsActual = resolved.lastEpsActual;
    base.lastEpsEstimate = resolved.lastEpsEstimate;
  } catch (err) {
    console.error(`Pulse earnings parse failed for ${ticker}`, err);
  }

  return base;
}

const fetchTickerPulseContextCached = unstable_cache(
  async (ticker: string) => fetchTickerPulseContextUncached(ticker),
  ["pulse-ticker-context-v2"],
  { revalidate: 60 * 60 }
);

export async function fetchTickerPulseContext(
  ticker: string,
  opts?: { force?: boolean }
): Promise<TickerPulseContext> {
  const key = ticker.trim().toUpperCase();
  if (!key) {
    return fetchTickerPulseContextUncached(key);
  }
  if (opts?.force) {
    return fetchTickerPulseContextUncached(key);
  }
  return fetchTickerPulseContextCached(key);
}

export async function fetchPulseContexts(
  tickers: string[],
  opts?: { force?: boolean }
): Promise<Record<string, TickerPulseContext>> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const entries = await Promise.all(
    unique.map(
      async (ticker) =>
        [ticker, await fetchTickerPulseContext(ticker, opts)] as const
    )
  );
  return Object.fromEntries(entries);
}
