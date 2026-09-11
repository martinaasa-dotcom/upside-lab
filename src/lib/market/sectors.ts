import { isMarketCircuitOpen, withMarketCircuit } from "@/lib/market/circuit-breaker";
import { getYahoo, resolveYahooListedSymbol } from "@/lib/market/yahoo";
import { MAX_SECTOR_TICKERS, sectorWords } from "@/lib/sector-words";
import { isQuotableTicker } from "@/lib/ticker";
import { unstable_cache } from "next/cache";

/**
 * What kind of business each holding is, from the provider rather than
 * from a list somebody here typed.
 *
 * This app knew about thirty companies well. `TICKER_SECTORS` was written
 * for the holdings it was built around, so an ordinary portfolio -- a
 * dividend fund, Coca-Cola, a bank, a property trust -- fell straight
 * through it and was grouped as "other businesses" with no description
 * anywhere. The provider has the answer for the whole market and this app
 * was already reading it in exactly one room, the company page
 * (`fundamentals.ts`), and nowhere a portfolio is drawn.
 *
 * Its own fetch rather than `fetchCompanyFacts`, which asks for nine
 * `quoteSummary` modules to build a whole company page. A sector needs one
 * (`assetProfile`), and the difference matters because this is asked for
 * every holding at once rather than for the one company somebody opened.
 *
 * Its own route rather than a field on the quote payload, for the reason
 * `/api/market/best-days` is its own route: the quotes response is the
 * hottest thing this app serves and it is on a poll, and a sector does not
 * move. Measured differently, it is the same lesson -- computing something
 * on one walk and shipping it on that walk's response are two decisions.
 */

export type TickerSector = {
  /** Already in this app's words, never the provider's own label. */
  words: string;
  /** The provider's own value, kept for the page that prints it raw. */
  raw: string;
};

/**
 * A month.
 *
 * A company's sector changes when it reinvents itself, which is a thing
 * that happens over years, so anything shorter is spending a provider call
 * to re-learn a fact that cannot have moved. It is also what makes asking
 * per holding affordable at all: a reader with twenty names pays twenty
 * calls once a month rather than twenty on every visit.
 */
const SECTOR_TTL_SECONDS = 60 * 60 * 24 * 30;

async function fetchOneSectorUncached(
  ticker: string
): Promise<TickerSector | null> {
  const key = ticker.trim().toUpperCase();
  if (!key || !isQuotableTicker(key)) return null;
  if (isMarketCircuitOpen("yahoo")) return null;

  let listed = key;
  try {
    listed = (await resolveYahooListedSymbol(key)) ?? key;
  } catch {
    /* the plain symbol is the right fallback, and usually right */
  }

  try {
    const yf = await getYahoo();
    const summary = (await withMarketCircuit("yahoo", () =>
      yf.quoteSummary(listed, { modules: ["assetProfile"] })
    )) as { assetProfile?: { sector?: unknown } } | null;
    const raw = summary?.assetProfile?.sector;
    if (typeof raw !== "string") return null;
    const words = sectorWords(raw);
    /*
      A sector this app has no sentence for is dropped rather than printed
      in the provider's own words. An unrecognised value means the
      taxonomy moved, and "Basic Materials" on a card is the finance-desk
      register this product exists to keep off the screen.
    */
    if (!words) return null;
    return { words, raw: raw.trim() };
  } catch {
    /*
      Quiet on purpose. A missing sector costs a label, and every caller
      already has a fallback; a fund and a coin have no `assetProfile` at
      all, so this is the ordinary answer rather than a fault worth a log
      line per holding.
    */
    return null;
  }
}

const fetchOneSectorCached = unstable_cache(
  async (ticker: string) => fetchOneSectorUncached(ticker),
  ["ticker-sector-v1"],
  { revalidate: SECTOR_TTL_SECONDS }
);

/**
 * Sectors for a set of holdings, as a map keyed by the symbol asked for.
 *
 * Names with no answer are absent from the map rather than present as
 * null, so a caller reads "this app does not know" the same way whether
 * the provider was asked and had nothing or was never asked at all.
 */
export async function fetchTickerSectors(
  tickers: string[]
): Promise<Record<string, TickerSector>> {
  const asked = [
    ...new Set(
      tickers
        .map((t) => t.trim().toUpperCase())
        .filter((t) => t && isQuotableTicker(t))
    ),
  ].slice(0, MAX_SECTOR_TICKERS);

  const found = await Promise.all(
    asked.map(async (ticker) => [ticker, await fetchOneSectorCached(ticker)] as const)
  );

  const out: Record<string, TickerSector> = {};
  for (const [ticker, sector] of found) {
    if (sector) out[ticker] = sector;
  }
  return out;
}
