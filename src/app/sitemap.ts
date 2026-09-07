import type { MetadataRoute } from "next";
import { PUBLIC_INDEX_PATHS, type PublicIndexPath } from "@/lib/seo-routes";
import { RESEARCH_TICKERS, researchHref } from "@/lib/research/universe";
import { siteUrl } from "@/lib/site-url";

const BASE_URL = siteUrl();

/*
  Keyed by the public path list rather than repeating it.

  This is a `Record` over the union on purpose: adding a page to
  `PUBLIC_INDEX_PATHS` and forgetting the sitemap used to compile fine and
  simply leave the page out. Now it does not compile until the new path is
  given a rank, which is the smallest possible way to make the omission
  impossible rather than merely unlikely.
*/
const RANK: Record<
  PublicIndexPath,
  { changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }
> = {
  "/": { changeFrequency: "weekly", priority: 1 },
  "/login": { changeFrequency: "monthly", priority: 0.8 },
  "/communities": { changeFrequency: "weekly", priority: 0.6 },
  "/research": { changeFrequency: "daily", priority: 0.9 },
  "/terms": { changeFrequency: "yearly", priority: 0.3 },
  "/privacy": { changeFrequency: "yearly", priority: 0.3 },
};

/*
  Every published company page is named.

  The research universe is a closed list in this repository, so the sitemap
  can state it exactly rather than approximating it: the number of URLs
  here and the number of pages that exist are the same number by
  construction, and `research-seo.test.ts` fails if they ever come apart.
  That is the whole reason the universe is a constant rather than something
  read out of a database at request time. A sitemap that promises pages
  which 404, or omits pages that exist, is worse than none.

  `daily` on a company page is not a promise that the file changes daily.
  It is a hint about how often it is worth coming back, and these carry a
  share price, headlines and a written brief that is retired after five
  days, so daily is the honest answer. Priority is relative within this one
  site: the company pages are the reason this section exists, so they rank
  above the legal pages and below the front door.
*/
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: MetadataRoute.Sitemap = PUBLIC_INDEX_PATHS.map((path) => ({
    url: path === "/" ? BASE_URL : `${BASE_URL}${path}`,
    ...RANK[path],
  }));
  const research: MetadataRoute.Sitemap = RESEARCH_TICKERS.map((ticker) => ({
    url: `${BASE_URL}${researchHref(ticker)}`,
    changeFrequency: "daily",
    priority: 0.7,
  }));
  return [...pages, ...research];
}
