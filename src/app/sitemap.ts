import type { MetadataRoute } from "next";
import { PUBLIC_INDEX_PATHS, type PublicIndexPath } from "@/lib/seo-routes";
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
  "/terms": { changeFrequency: "yearly", priority: 0.3 },
  "/privacy": { changeFrequency: "yearly", priority: 0.3 },
};

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_INDEX_PATHS.map((path) => ({
    url: path === "/" ? BASE_URL : `${BASE_URL}${path}`,
    ...RANK[path],
  }));
}
