import { describe, expect, it } from "vitest";
import { PRODUCT_NAME } from "@/lib/product";
import {
  COMMUNITIES_METADATA,
  HOME_METADATA,
  LOGIN_METADATA,
  PRIVATE_ROBOTS,
  canonicalUrl,
  privatePageMetadata,
} from "@/lib/site-metadata";
import { isCanonicalAppHost, isNonPublicHost } from "@/lib/site-url";

describe("site metadata", () => {
  it("pins public share cards to upsidelab.app", () => {
    expect(canonicalUrl("/")).toBe("https://upsidelab.app");
    expect(canonicalUrl("/login")).toBe("https://upsidelab.app/login");
    expect(canonicalUrl("/communities")).toBe(
      "https://upsidelab.app/communities"
    );
    expect(HOME_METADATA.openGraph?.url).toBe("https://upsidelab.app");
    expect(LOGIN_METADATA.openGraph?.images).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: "/og.png?v=5", width: 1200, height: 630 }),
      ])
    );
    expect(COMMUNITIES_METADATA.robots).toMatchObject({
      index: true,
      follow: true,
    });
  });

  it("does not treat the CI placeholder host as public", () => {
    expect(isNonPublicHost("ci.upsidelab.test")).toBe(true);
    expect(isNonPublicHost("upsidelab.app")).toBe(false);
    expect(isCanonicalAppHost("upsidelab.app")).toBe(true);
    expect(isCanonicalAppHost("www.upsidelab.app")).toBe(true);
    expect(isCanonicalAppHost("localhost")).toBe(false);
  });

  it("marks authenticated rooms noindex, nofollow", () => {
    const privateMeta = privatePageMetadata();
    expect(PRIVATE_ROBOTS).toMatchObject({ index: false, follow: false });
    expect(privateMeta.robots).toEqual(PRIVATE_ROBOTS);
    expect(privateMeta.title).toEqual({ absolute: PRODUCT_NAME });
    expect(privateMeta.alternates?.canonical).toBe("https://upsidelab.app");
  });
});
