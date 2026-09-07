import type { MetadataRoute } from "next";
import {
  BLOCKED_USER_AGENTS,
  ROBOTS_ONLY_AI_TOKENS,
  WELCOME_USER_AGENTS,
} from "@/lib/bot-policy";
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

  `/research` is the one public path whose children must be crawled, since
  the children are the point, so it is deliberately left unanchored.
*/
function allowRule(path: string): string {
  if (path === "/") return "/";
  if (path === "/research") return "/research";
  return `${path}$`;
}

const DISALLOW = [...PRIVATE_NOINDEX_PATHS, "/communities/", "/api/"];

/**
 * Who may read this site, and it is two different answers.
 *
 * The first group is everybody, and it is the rules this app has always
 * had: the public pages are open and the signed-in rooms are not.
 *
 * After it come one group per bulk harvester, each refused outright. The
 * argument for refusing them is in `bot-policy.ts` and it is about cost
 * rather than principle: they read every page, send nobody back, and
 * several of them crawl harder than any search engine. The search
 * crawlers, the assistants that fetch one page because a person asked
 * them to, and the bots that draw a link preview are all named with an
 * explicit allow, so a future change to the shared rules can never quietly
 * close the door these pages were written to leave open.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: PUBLIC_INDEX_PATHS.map(allowRule),
        disallow: DISALLOW,
      },
      ...WELCOME_USER_AGENTS.map((userAgent) => ({
        userAgent,
        allow: PUBLIC_INDEX_PATHS.map(allowRule),
        disallow: DISALLOW,
      })),
      /*
        Both lists, because they are refused for the same reason and only
        the enforcement differs. The robots-only tokens are switches Google
        and Apple read to decide whether a page their ordinary crawler
        already has may be used to train a model; no request ever arrives
        calling itself one, which is why they are not in the edge check.
      */
      ...[...ROBOTS_ONLY_AI_TOKENS, ...BLOCKED_USER_AGENTS].map(
        (userAgent) => ({
          userAgent,
          disallow: "/",
        })
      ),
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
