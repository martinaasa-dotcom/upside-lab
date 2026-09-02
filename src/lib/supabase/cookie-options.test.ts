/**
 * `@supabase/ssr` writes the session cookie with `path`, `sameSite` and
 * `httpOnly` of its own and says nothing about `secure`, so a client built
 * with no `cookieOptions` sent the session without the Secure attribute.
 * Every client this app builds passes the same options, and this holds
 * both the options and the fact that each factory hands them over.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Factory = (...args: unknown[]) => { auth: object };
const createServerClient = vi.fn<Factory>(() => ({ auth: {} }));
const createBrowserClient = vi.fn<Factory>(() => ({ auth: {} }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => createServerClient(...args),
  createBrowserClient: (...args: unknown[]) => createBrowserClient(...args),
}));

let host = "upsidelab.app";

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
  headers: async () => new Headers({ host }),
}));

import { sessionCookieOptions } from "@/lib/supabase/cookie-options";
import { createSupabaseServerAuth } from "@/lib/supabase/server-auth";

const PUBLIC = { path: "/", sameSite: "lax", httpOnly: false, secure: true };

function passedOptions(mock: { mock: { calls: unknown[][] } }) {
  const call = mock.mock.calls.at(-1);
  expect(call).toBeDefined();
  return (call?.[2] as { cookieOptions?: unknown } | undefined)?.cookieOptions;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://uzrnybyggznpvgxgrvgl.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-for-tests";
  createServerClient.mockClear();
  createBrowserClient.mockClear();
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  vi.unstubAllGlobals();
});

describe("sessionCookieOptions", () => {
  it("is Secure, Lax, site-wide and readable by the page on the public host", () => {
    expect(sessionCookieOptions("upsidelab.app")).toEqual(PUBLIC);
    expect(sessionCookieOptions("upside-git-main-upthink1.vercel.app")).toEqual(PUBLIC);
  });

  it("treats an unknown host as the public one", () => {
    expect(sessionCookieOptions(null)).toEqual(PUBLIC);
    expect(sessionCookieOptions(undefined)).toEqual(PUBLIC);
    expect(sessionCookieOptions("")).toEqual(PUBLIC);
  });

  it("drops only Secure on a local development server, which is plain http", () => {
    for (const local of ["localhost", "localhost:3000", "127.0.0.1", "dev.local"]) {
      expect(sessionCookieOptions(local)).toEqual({ ...PUBLIC, secure: false });
    }
  });
});

describe("the server client", () => {
  it("passes the options for the host the request came in on", async () => {
    host = "upsidelab.app";
    expect(await createSupabaseServerAuth()).not.toBeNull();
    expect(passedOptions(createServerClient)).toEqual(PUBLIC);
  });

  it("lets a local dev server keep its cookie", async () => {
    host = "localhost:3000";
    await createSupabaseServerAuth();
    expect(passedOptions(createServerClient)).toEqual({ ...PUBLIC, secure: false });
  });
});

describe("the browser client", () => {
  it("passes the same options, read off the page's own host", async () => {
    vi.stubGlobal("window", { location: { hostname: "upsidelab.app" } });
    const { createSupabaseBrowser } = await import("@/lib/supabase/browser");
    expect(createSupabaseBrowser()).not.toBeNull();
    expect(passedOptions(createBrowserClient)).toEqual(PUBLIC);
  });
});
