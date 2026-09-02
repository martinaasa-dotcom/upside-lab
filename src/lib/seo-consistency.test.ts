import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { PRIVATE_NOINDEX_PATHS, PUBLIC_INDEX_PATHS } from "@/lib/seo-routes";

/*
  One list, three readers.

  `seo-routes.ts` promises that robots.txt and the sitemap import it so a
  new authenticated path cannot be indexed by accident. The private half
  kept the promise. The public half was three hand-written copies of the
  same five strings, and three copies of a list is a list that will
  disagree with itself.
*/
describe("public and private paths agree across robots and the sitemap", () => {
  it("offers every public path to crawlers, and nothing else", () => {
    const rules = robots().rules;
    const allow = (Array.isArray(rules) ? [] : [rules])
      .flatMap((r) => (Array.isArray(r.allow) ? r.allow : r.allow ? [r.allow] : []));

    expect(allow).toHaveLength(PUBLIC_INDEX_PATHS.length);
    for (const path of PUBLIC_INDEX_PATHS) {
      expect(allow).toContain(path === "/" ? "/" : `${path}$`);
    }
  });

  it("lists every public path in the sitemap", () => {
    const urls = sitemap().map((e) => e.url);

    expect(urls).toHaveLength(PUBLIC_INDEX_PATHS.length);
    for (const path of PUBLIC_INDEX_PATHS) {
      expect(urls.some((u) => u.endsWith(path === "/" ? "" : path))).toBe(true);
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
