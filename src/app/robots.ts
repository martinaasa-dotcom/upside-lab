import type { MetadataRoute } from "next";
import { PRIVATE_NOINDEX_PATHS, PUBLIC_INDEX_PATHS } from "@/lib/seo-routes";
import { siteUrl } from "@/lib/site-url";

const BASE_URL = siteUrl();

/*
  The allow list is derived, not retyped.

  `seo-routes.ts` says in its own docstring that robots.txt and the sitemap
  import it so a new authenticated path cannot be indexed by accident. The
  private half did import it; the public half was a second copy of the same
  five strings written out by hand here and a third in `sitemap.ts`, which
  is the arrangement the docstring exists to prevent.

  Root stays unanchored, because `Allow: /` is what lets everything through
  before the disallow list carves the private rooms back out. Every other
  public path is anchored, so `/communities` stays crawlable while
  `Disallow: /communities/` keeps a particular circle out: a crawler
  resolves the two by longest match, and without the anchor the allow rule
  would cover the children too.
*/
function allowRule(path: string): string {
  return path === "/" ? "/" : `${path}$`;
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: PUBLIC_INDEX_PATHS.map(allowRule),
      disallow: [
        ...PRIVATE_NOINDEX_PATHS,
        "/communities/",
        "/api/",
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
