/**
 * The company's own figures, out of the provider and into one flat shape.
 *
 * Everything about this file is defensive, on purpose. It is the one place
 * where an outside feed's data becomes a number this app will print beside
 * a sentence like "out of every $100 customers pay them, $9 is profit". A
 * feed that answers with a string, a nested object, a zero standing in for
 * a missing figure, or a field that quietly changed name between library
 * versions must produce `null` here rather than a confident wrong number
 * on somebody's screen. So nothing is read positionally, every field goes
 * through `num`/`str`, and a zero where a zero is meaningless (a share
 * count, a market value) is treated as absent.
 *
 * Yahoo is the only feed with the whole set on a free plan, so there is no
 * fallback chain here as there is for quotes. The honest consequence is
 * that a company Yahoo does not cover comes back thin, which the room says
 * out loud rather than filling in.
 */
import {
  isMarketCircuitOpen,
  withMarketCircuit,
} from "@/lib/market/circuit-breaker";
import { getYahoo, resolveYahooListedSymbol } from "@/lib/market/yahoo";
import { safeHttpUrl } from "@/lib/safe-url";
import { sectorForTicker } from "@/lib/thesis-pulse";
import type { CompanyFacts, CompanyYear } from "@/lib/company/facts";
import { unstable_cache } from "next/cache";

/** A finite number, or null. Zero counts as a real answer only where asked. */
function num(value: unknown, opts: { zeroIsReal?: boolean } = {}): number | null {
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : /*
             Yahoo hands some figures back as `{ raw, fmt }` depending on the
             module and the library version. Reading `.raw` here rather than
             failing means a library upgrade that changes shape degrades to a
             number instead of to `n/a` across the whole page.
           */
          typeof value === "object" && value !== null && "raw" in value
          ? Number((value as { raw: unknown }).raw)
          : null;
  if (raw === null || !Number.isFinite(raw)) return null;
  if (raw === 0 && !opts.zeroIsReal) return null;
  return raw;
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function pick(source: unknown, key: string): unknown {
  if (typeof source !== "object" || source === null) return undefined;
  return (source as Record<string, unknown>)[key];
}

/** Year the period ended in, from whatever shape the date arrived as. */
function endYear(value: unknown): number | null {
  if (value instanceof Date) return value.getUTCFullYear();
  const asString = str(value);
  if (asString) {
    const parsed = Date.parse(asString);
    if (Number.isFinite(parsed)) return new Date(parsed).getUTCFullYear();
  }
  const asNumber = num(value);
  // Yahoo's older shape is a unix second stamp.
  if (asNumber && asNumber > 1_000_000_000 && asNumber < 4_000_000_000) {
    return new Date(asNumber * 1000).getUTCFullYear();
  }
  return null;
}

function annualHistory(source: unknown): CompanyYear[] {
  const list = pick(source, "incomeStatementHistory");
  if (!Array.isArray(list)) return [];
  const rows: CompanyYear[] = [];
  for (const entry of list) {
    const year = endYear(pick(entry, "endDate"));
    if (year === null) continue;
    rows.push({
      year,
      revenue: num(pick(entry, "totalRevenue")),
      netIncome: num(pick(entry, "netIncome"), { zeroIsReal: true }),
    });
  }
  // Oldest first, so a reader's eye runs left to right through time, and
  // at most four because that is what the feed carries and a fifth column
  // half-filled reads as data we lost rather than data nobody has.
  return rows
    .filter((r) => r.revenue !== null || r.netIncome !== null)
    .sort((a, b) => a.year - b.year)
    .slice(-4);
}

const MODULES = [
  "assetProfile",
  "price",
  "summaryDetail",
  "defaultKeyStatistics",
  "financialData",
  "incomeStatementHistory",
] as const;

async function fetchCompanyFactsUncached(
  ticker: string
): Promise<CompanyFacts | null> {
  const key = ticker.trim().toUpperCase();
  if (!key) return null;
  if (isMarketCircuitOpen("yahoo")) return null;

  let listed = key;
  try {
    listed = (await resolveYahooListedSymbol(key)) ?? key;
  } catch {
    /* the plain symbol is the right fallback, and usually right */
  }

  let summary: unknown;
  try {
    const yf = await getYahoo();
    summary = await withMarketCircuit("yahoo", () =>
      yf.quoteSummary(listed, { modules: [...MODULES] })
    );
  } catch (err) {
    console.error(`Company facts failed for ${key}`, err);
    return null;
  }
  if (!summary) return null;

  const profile = pick(summary, "assetProfile");
  const price = pick(summary, "price");
  const detail = pick(summary, "summaryDetail");
  const stats = pick(summary, "defaultKeyStatistics");
  const financial = pick(summary, "financialData");
  const history = annualHistory(pick(summary, "incomeStatementHistory"));

  const spot =
    num(pick(financial, "currentPrice")) ??
    num(pick(price, "regularMarketPrice"));

  return {
    ticker: key,
    listedSymbol: listed,
    name:
      str(pick(price, "longName")) ??
      str(pick(price, "shortName")) ??
      null,
    about: str(pick(profile, "longBusinessSummary")),
    /*
      The provider's own sector wins, and this app's table is the fallback.
      `sectorForTicker` is a hand-kept list built for the holdings people
      actually own here, so it answers null for most of the market, and a
      lookup room is exactly where the rest of the market shows up.
    */
    sector: str(pick(profile, "sector")) ?? sectorForTicker(key),
    industry: str(pick(profile, "industry")),
    country: str(pick(profile, "country")),
    employees: num(pick(profile, "fullTimeEmployees")),
    website: safeHttpUrl(str(pick(profile, "website")) ?? "") ?? null,
    kind: str(pick(price, "quoteType")),
    currency:
      str(pick(price, "currency"))?.toUpperCase() ??
      str(pick(detail, "currency"))?.toUpperCase() ??
      null,

    price: spot,
    /*
      Worked out here rather than read off the feed, and that is not
      pedantry: `regularMarketChangePercent` is a fraction on this module
      and a percent on others, the two are a hundred times apart, and
      nothing about the value itself says which one arrived. A 1.4% day
      printed as 0.014% or as 140% are both figures this app would be
      stating as fact. The subtraction has no such ambiguity, and it lands
      in the same convention every other quote in this app uses, which is
      a fraction.
    */
    changePercent: (() => {
      const close = num(pick(price, "regularMarketPreviousClose"));
      if (!close || close <= 0 || !spot) return null;
      return (spot - close) / close;
    })(),
    marketCap: num(pick(price, "marketCap")) ?? num(pick(detail, "marketCap")),
    fiftyTwoWeekHigh: num(pick(detail, "fiftyTwoWeekHigh")),
    fiftyTwoWeekLow: num(pick(detail, "fiftyTwoWeekLow")),

    revenue: num(pick(financial, "totalRevenue")),
    revenueGrowth: num(pick(financial, "revenueGrowth"), { zeroIsReal: true }),
    grossMargin: num(pick(financial, "grossMargins"), { zeroIsReal: true }),
    profitMargin:
      num(pick(financial, "profitMargins"), { zeroIsReal: true }) ??
      num(pick(stats, "profitMargins"), { zeroIsReal: true }),
    netIncome: num(pick(stats, "netIncomeToCommon"), { zeroIsReal: true }),
    freeCashFlow: num(pick(financial, "freeCashflow"), { zeroIsReal: true }),
    totalCash: num(pick(financial, "totalCash"), { zeroIsReal: true }),
    totalDebt: num(pick(financial, "totalDebt"), { zeroIsReal: true }),

    trailingPe: num(pick(detail, "trailingPE")),
    forwardPe: num(pick(detail, "forwardPE")) ?? num(pick(stats, "forwardPE")),
    /*
      Yahoo reports this as a fraction on some listings and as a percent on
      others, and the two are a hundred times apart on a number this app
      prints as "$1.80 a year for every $100". Anything above 1 is a percent
      that has not been divided, since no ordinary listing pays more than
      its own share price out in a year.
    */
    dividendYield: (() => {
      const raw = num(pick(detail, "dividendYield"));
      if (raw === null) return null;
      return raw > 1 ? raw / 100 : raw;
    })(),

    epsTrailing:
      num(pick(stats, "trailingEps"), { zeroIsReal: true }) ??
      num(pick(detail, "trailingEps"), { zeroIsReal: true }),
    epsForward: num(pick(stats, "forwardEps"), { zeroIsReal: true }),
    sharesOutstanding: num(pick(stats, "sharesOutstanding")),

    history,

    analystCount: num(pick(financial, "numberOfAnalystOpinions")),
    analystTargetMean: num(pick(financial, "targetMeanPrice")),
    analystTargetHigh: num(pick(financial, "targetHighPrice")),
    analystTargetLow: num(pick(financial, "targetLowPrice")),

    fetchedAt: new Date().toISOString(),
  };
}

/**
 * An hour, which is far longer than a quote and far shorter than a quarter.
 *
 * Nothing in here changes between two page loads except the price, and the
 * price on this page is the quote path's, not this one's. An hour keeps a
 * popular company down to a couple of provider calls a day while still
 * picking up an earnings release the same session it lands.
 */
const fetchCompanyFactsCached = unstable_cache(
  async (ticker: string) => fetchCompanyFactsUncached(ticker),
  ["company-facts-v1"],
  { revalidate: 60 * 60 }
);

export async function fetchCompanyFacts(
  ticker: string,
  opts: { force?: boolean } = {}
): Promise<CompanyFacts | null> {
  const key = ticker.trim().toUpperCase();
  if (!key) return null;
  if (opts.force) return fetchCompanyFactsUncached(key);
  return fetchCompanyFactsCached(key);
}
