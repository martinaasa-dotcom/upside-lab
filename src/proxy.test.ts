/**
 * Two things the proxy has to get right that nothing else can see.
 *
 * The matcher decides which requests the proxy sees at all, and a request
 * it does not see gets no CSP header, no forged-request gate and no
 * mutation limit. The old exclusion was any path with a dot in it, which
 * took a circle called `a.b` and a portfolio slug like `v1.2` out with the
 * favicons. The matcher is compiled here exactly as the build compiles it.
 *
 * And the session refresh it runs builds its own Supabase client, so it
 * has to pass the same cookie options as the other two or the cookie it
 * rewrites loses its Secure attribute on every refresh.
 */
import { NextRequest } from "next/server";
import * as staticInfo from "next/dist/build/analysis/get-page-static-info";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Factory = (...args: unknown[]) => { auth: object };
const createServerClient = vi.fn<Factory>(() => ({
  auth: { getUser: async () => ({ data: { user: null }, error: null }) },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => createServerClient(...args),
}));

import { config, proxy } from "@/proxy";

/** The build's own compiler for a matcher. Exported, but left out of the typings. */
const { getMiddlewareMatchers } = staticInfo as unknown as {
  getMiddlewareMatchers: (
    matcher: string[],
    nextConfig: object
  ) => { regexp: string }[];
};

function compiled(): RegExp[] {
  return getMiddlewareMatchers(config.matcher, {}).map((m) => new RegExp(m.regexp));
}

function seen(pathname: string): boolean {
  return compiled().some((re) => re.test(pathname));
}

describe("the matcher", () => {
  it("still sees a room whose slug carries a dot", () => {
    for (const p of [
      "/",
      "/pulse",
      "/portfolio/main",
      "/communities/a.b",
      "/portfolio/v1.2",
      "/communities/3f2c8b1e-1234-4abc-9def-0123456789ab",
      "/api/holdings/abc.def",
      "/api/communities/a.b/sheets",
      "/api/quotes",
      "/auth/email/complete",
    ]) {
      expect(seen(p), p).toBe(true);
    }
  });

  it("stays out of the build output and the files in public/", () => {
    for (const p of [
      "/_next/static/chunks/main.js",
      "/_next/image?url=x",
      "/favicon.ico",
      "/favicon.svg",
      "/apple-touch-icon.png",
      "/icons/icon-192.png",
      "/og.png",
      "/sw.js",
      "/upside-mark.svg",
      "/robots.txt",
      "/sitemap.xml",
      "/manifest.webmanifest",
    ]) {
      expect(seen(p), p).toBe(false);
    }
  });
});

describe("the session refresh", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://uzrnybyggznpvgxgrvgl.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-for-tests";
    createServerClient.mockClear();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  function optionsFor(url: string) {
    const call = createServerClient.mock.calls.at(-1) as unknown[] | undefined;
    expect(call, url).toBeDefined();
    return (call?.[2] as { cookieOptions?: unknown }).cookieOptions;
  }

  it("writes a Secure, Lax, site-wide cookie the page can read", async () => {
    const res = await proxy(new NextRequest("https://upsidelab.app/pulse"));
    expect(res.headers.get("Content-Security-Policy")).toBeTruthy();
    expect(optionsFor("https://upsidelab.app/pulse")).toEqual({
      path: "/",
      sameSite: "lax",
      httpOnly: false,
      secure: true,
    });
  });

  it("drops Secure only for a local dev server", async () => {
    await proxy(new NextRequest("http://localhost:3000/pulse"));
    expect(optionsFor("http://localhost:3000/pulse")).toMatchObject({ secure: false });
  });
});
