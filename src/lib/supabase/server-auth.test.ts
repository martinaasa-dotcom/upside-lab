/**
 * One auth round trip per request, however many callers ask.
 *
 * `auth.getUser()` goes to the auth service every time it is called, so a
 * request that asks twice used to pay twice. The memo is keyed on the
 * cookie store `next/headers` hands back, because that is the object a
 * request has and the next request does not, and because the session is in
 * those cookies: one store is one question with one answer.
 *
 * React's `cache` cannot do this job here and that is why this file exists.
 * A route handler is not a render, the app route runtime never imports
 * React, and with no cache dispatcher in scope React's `cache` calls
 * straight through. Measured on the dev server against a stand-in auth
 * service, a route asking three times behind `cache` made three round
 * trips.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let cookieStore: object = { name: "first-request" };
const headerStore = { get: () => "upsidelab.app" };

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => headerStore,
}));

const getUser = vi.fn(async () => ({
  data: { user: { id: "user-1" } },
  error: null,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

import { getAuthUser } from "@/lib/supabase/server-auth";

describe("getAuthUser", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "https://uzrnybyggznpvgxgrvgl.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-for-tests";
    getUser.mockClear();
    cookieStore = { name: "a-request" };
  });

  it("asks the auth service once for two calls in one request", async () => {
    const first = await getAuthUser();
    const second = await getAuthUser();
    expect(first?.id).toBe("user-1");
    expect(second?.id).toBe("user-1");
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("shares one flight between callers that overlap", async () => {
    const [first, second] = await Promise.all([getAuthUser(), getAuthUser()]);
    expect(first?.id).toBe("user-1");
    expect(second?.id).toBe("user-1");
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  /*
    The half that matters more than the saving: a memo wide enough to reach
    the next request would hand one person's session to another.
  */
  it("asks again for the next request", async () => {
    await getAuthUser();
    cookieStore = { name: "the-next-request" };
    await getAuthUser();
    expect(getUser).toHaveBeenCalledTimes(2);
  });
});
