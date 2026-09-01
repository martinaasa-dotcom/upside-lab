/**
 * A screenshot read costs a vision-model call on a free tier, and the route
 * used to work out the 401 for a signed-out caller and then drop it: every
 * stranger shared one "anon" bucket in front of that model. The session is
 * required first now, and the bucket is the reader's own id.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
const limiter = vi.hoisted(() => ({
  calls: [] as { key: string; limit: number; windowMs: number }[],
  ok: true,
}));

vi.mock("@/lib/supabase/server-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireAuthUser: async () =>
      auth.user
        ? { user: auth.user }
        : {
            error: NextResponse.json(
              { error: "Sign in required" },
              { status: 401 }
            ),
          },
  };
});

vi.mock("@/lib/rate-limit-durable", () => ({
  takeDurableRateLimit: async (key: string, limit: number, windowMs: number) => {
    limiter.calls.push({ key, limit, windowMs });
    return limiter.ok ? { ok: true } : { ok: false, retryAfterSec: 30 };
  },
}));

// Nothing past the gate is under test. An empty chain makes the route
// answer 503 as soon as it is through, which is enough to show it got there.
vi.mock("@/lib/ai/model", () => ({
  buildAdvisorProviderChain: () => [],
  describeAdvisorError: () => ({ message: "No model is set up.", status: 503 }),
  withAdvisorFallback: async () => {
    throw new Error("not reached");
  },
}));
vi.mock("@/lib/advisor-use", () => ({ stampAdvisorUse: () => {} }));
vi.mock("@/lib/observe-route", () => ({
  observeRoute: (h: (req: Request) => Promise<Response>) => h,
}));

import { POST } from "@/app/api/book/ytd-from-image/route";

function post(): Promise<Response> {
  const form = new FormData();
  form.set(
    "image",
    new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })
  );
  return POST(
    new Request("https://upsidelab.app/api/book/ytd-from-image", {
      method: "POST",
      body: form,
    })
  ) as Promise<Response>;
}

beforeEach(() => {
  auth.user = null;
  limiter.calls = [];
  limiter.ok = true;
});

describe("POST /api/book/ytd-from-image", () => {
  it("answers 401 with no session, before any budget is spent", async () => {
    const res = await post();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sign in required" });
    expect(limiter.calls).toEqual([]);
  });

  it("charges the reader's own id, never a shared anonymous bucket", async () => {
    auth.user = { id: "user-42" };
    limiter.ok = false;
    const res = await post();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(limiter.calls).toHaveLength(1);
    expect(limiter.calls[0].key).toBe("ytd-image:user-42");
    expect(limiter.calls[0].key).not.toContain("anon");
  });

  it("lets a signed-in reader through the gate", async () => {
    auth.user = { id: "user-42" };
    const res = await post();
    // 503 from the mocked, empty model chain: the request got past auth and
    // the limiter and reached the work.
    expect(res.status).toBe(503);
    expect(limiter.calls.map((c) => c.key)).toEqual(["ytd-image:user-42"]);
  });
});
