/**
 * One load per company page, however many times the framework renders it.
 *
 * A single request for `/research/NVDA` renders the route three times:
 * once for `generateMetadata`, once for the page, and once more for the
 * social image. Each of those wants the same company, and without a cache
 * between them each would fetch the provider, the headlines and the brief
 * row over again, which is three times the cost for one visit and three
 * chances for the three renders to disagree with each other about the
 * price.
 *
 * So the whole page is one cache entry.
 *
 * **Nothing in here may generate a brief**, and the boolean that says so
 * is not a default that could be flipped by a caller: this file passes
 * `generate: false` and takes no option that would change it. A page view
 * is triggered by a stranger, and a page view that can spend a model run
 * is a denial of service with a search engine holding the trigger. What
 * fills the cache is the cron in `warm.ts`, which runs at a rate this app
 * chooses. On the rare cold page the reader gets the figures, the
 * headlines and the links, which is the same thing the app's own room
 * shows when a run fails, and the cron writes the argument in behind them.
 *
 * The tags are per company on purpose. Warming one company should not
 * throw away ninety-nine other pages that are still perfectly good, so the
 * cached function is built per ticker with its own tag. That is why it is
 * constructed inside the call rather than at module scope: `unstable_cache`
 * fixes its tags when it is wrapped, so a tag that varies has to be wrapped
 * per key.
 */
import { unstable_cache } from "next/cache";
import type { CompanyPage } from "@/lib/company/client";
import { buildCompanyPage } from "@/lib/company/page-build";
import { normalizeResearchTicker } from "@/lib/research/universe";

/**
 * How long a rendered research page may stand.
 *
 * Six hours, and the number is a compromise between two costs that pull
 * opposite ways. The figures underneath it are a company's accounts, which
 * move four times a year, and a written brief, which the store already
 * retires after five days: on that material a page could stand for a day
 * without saying anything false. What moves is the share price, and the
 * page carries the moment its price was taken plus a live one from the
 * browser, so the stale figure is labelled rather than hidden.
 *
 * Against that, this is also the window in which a page that has just been
 * given its written half sits there without it. Six hours means every page
 * is rebuilt four times a day for nothing worse than a provider call, and
 * a company that reports overnight is current by the time anybody in
 * either market is awake. The warmer additionally clears a page by hand
 * the moment it writes a new brief, so the clock is the floor rather than
 * the mechanism.
 */
export const RESEARCH_REVALIDATE_SECONDS = 21_600;

/** Cleared by the warmer when it writes a new brief for this company. */
export function researchPageTag(ticker: string): string {
  return `research-page:${normalizeResearchTicker(ticker)}`;
}

/** Cleared when something changes for every page at once. */
export const RESEARCH_ALL_TAG = "research-pages";

export async function loadResearchPage(
  rawTicker: string
): Promise<CompanyPage | null> {
  const ticker = normalizeResearchTicker(rawTicker);
  if (!ticker) return null;
  const cached = unstable_cache(
    async (): Promise<CompanyPage | null> => {
      const built = await buildCompanyPage(ticker, { generate: false });
      return built.ok ? built.page : null;
    },
    /*
      The version in the key is the same discipline `company-facts-v2`
      records: this entry holds a whole `CompanyPage`, so the key carries
      the shape. Bump it in the same commit that adds or removes a field,
      or for the length of one window every reader is served an object the
      new code does not expect.
    */
    ["research-page-v1", ticker],
    {
      revalidate: RESEARCH_REVALIDATE_SECONDS,
      tags: [researchPageTag(ticker), RESEARCH_ALL_TAG],
    }
  );
  return cached();
}
