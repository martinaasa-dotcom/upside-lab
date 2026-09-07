import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { PRIVATE_NOINDEX_PATHS, PUBLIC_INDEX_PATHS } from "@/lib/seo-routes";
import { RESEARCH_TICKERS, researchHref } from "@/lib/research/universe";

/*
  One list, three readers.

  `seo-routes.ts` promises that robots.txt and the sitemap import it so a
  new authenticated path cannot be indexed by accident. The private half
  kept the promise. The public half was three hand-written copies of the
  same five strings, and three copies of a list is a list that will
  disagree with itself.
*/
describe("public and private paths agree across robots and the sitemap", () => {
  /*
    robots.txt is a list of groups now rather than one group: the shared
    rules, then one explicit allow per search crawler and link preview bot,
    then one refusal per bulk harvester. So the check is per group that
    carries an allow list, and every one of them has to offer the same
    public paths. A change that closed the door on one of them while
    leaving the others open is exactly the shape this catches.
  */
  it("offers every public path to crawlers, and nothing else", () => {
    const rules = robots().rules;
    const groups = Array.isArray(rules) ? rules : [rules];
    const withAllow = groups.filter((r) => r.allow);
    expect(withAllow.length).toBeGreaterThan(0);

    for (const rule of withAllow) {
      const allow = Array.isArray(rule.allow)
        ? rule.allow
        : rule.allow
          ? [rule.allow]
          : [];
      expect(allow).toHaveLength(PUBLIC_INDEX_PATHS.length);
      for (const path of PUBLIC_INDEX_PATHS) {
        /*
          `/research` is the one public path left unanchored, because its
          children are the pages this section exists to publish and an
          anchored rule would cover the index alone.
        */
        expect(allow).toContain(
          path === "/" || path === "/research" ? path : `${path}$`
        );
      }
    }
  });

  it("lists every public path in the sitemap", () => {
    const urls = sitemap().map((e) => e.url);

    expect(urls).toHaveLength(
      PUBLIC_INDEX_PATHS.length + RESEARCH_TICKERS.length
    );
    for (const path of PUBLIC_INDEX_PATHS) {
      expect(urls.some((u) => u.endsWith(path === "/" ? "" : path))).toBe(true);
    }
  });

  /*
    The published company pages and the sitemap are the same list by
    construction, which is the whole reason the universe is a constant in
    this repository rather than something read out of a database. A sitemap
    that promises a page which 404s, or omits one that exists, is worse
    than no sitemap at all.
  */
  it("names every published company page and no others", () => {
    const urls = new Set(sitemap().map((e) => e.url));
    for (const ticker of RESEARCH_TICKERS) {
      expect(
        [...urls].some((u) => u.endsWith(researchHref(ticker))),
        `${ticker} is missing from the sitemap`
      ).toBe(true);
    }
  });

  /*
    The one that would actually hurt. A path cannot be both indexable and
    an authenticated room, and the way that happens is somebody adding a
    page to the wrong list months after the other was written.
  */
  it("never calls a path both public and private", () => {
    const priv = new Set<string>(PRIVATE_NOINDEX_PATHS);
    for (const path of PUBLIC_INDEX_PATHS) {
      expect(priv.has(path), `${path} is in both lists`).toBe(false);
    }
  });

  it("keeps every private room out of the sitemap", () => {
    const urls = sitemap().map((e) => e.url);
    for (const path of PRIVATE_NOINDEX_PATHS) {
      expect(urls.some((u) => u.endsWith(path))).toBe(false);
    }
  });

  /*
    `/communities` is public and a particular circle is not, so the allow
    rule has to be anchored or it would cover the children it sits above.
  */
  it("anchors a public path that has private children", () => {
    const rules = robots().rules;
    const one = Array.isArray(rules) ? rules[0] : rules;
    const allow = Array.isArray(one?.allow) ? one.allow : [];
    const disallow = Array.isArray(one?.disallow) ? one.disallow : [];

    expect(allow).toContain("/communities$");
    expect(disallow).toContain("/communities/");
  });

  /*
    The sign-in pages and handlers under `/auth` are not rooms and are not
    for a crawler: an indexed `/auth/email` is a sign-in button offered as
    a search result. One prefix in the private list is what gives every
    handler under it the robots line here and the `X-Robots-Tag` header in
    `next.config.ts`.
  */
  it("keeps the sign-in handlers out of the index", () => {
    const rules = robots().rules;
    const one = Array.isArray(rules) ? rules[0] : rules;
    const disallow = Array.isArray(one?.disallow) ? one.disallow : [];

    expect(PRIVATE_NOINDEX_PATHS).toContain("/auth");
    expect(disallow).toContain("/auth");
  });
});
