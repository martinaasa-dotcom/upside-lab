/**
 * The shared bucket is the source of truth across instances and the memory
 * bucket is per instance, so a refusal that only the database knows about
 * costs a round trip on every later request from the same caller. The
 * weighted limiter already wrote that verdict back into memory; the
 * unweighted one, which guards Margus, forecast, Pulse and the full data
 * export, did not.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let rpcCalls = 0;
let rpcAnswer: { ok: boolean; retryAfterSec?: number } = { ok: true };

vi.mock("@/lib/supabase/server", () => ({
  supabaseUsesServiceRole: () => true,
  getSupabaseServer: () => ({
    rpc: async () => {
      rpcCalls++;
      return { data: rpcAnswer, error: null };
    },
  }),
}));

const { takeDurableRateLimit } = await import("@/lib/rate-limit-durable");
const { resetRateLimitForTests } = await import("@/lib/rate-limit");

beforeEach(() => {
  rpcCalls = 0;
  rpcAnswer = { ok: true };
  resetRateLimitForTests();
});

describe("takeDurableRateLimit", () => {
  it("asks the shared bucket while the caller is under the local limit", async () => {
    const first = await takeDurableRateLimit("k1", 5, 60_000);
    expect(first.ok).toBe(true);
    expect(rpcCalls).toBe(1);
  });

  it("stops asking once the shared bucket has said no", async () => {
    rpcAnswer = { ok: false, retryAfterSec: 30 };
    const refused = await takeDurableRateLimit("k2", 5, 60_000);
    expect(refused.ok).toBe(false);
    expect(refused.retryAfterSec).toBe(30);
    expect(rpcCalls).toBe(1);

    // Same caller, same warm instance. The verdict is already known, so
    // this must cost nothing.
    const again = await takeDurableRateLimit("k2", 5, 60_000);
    expect(again.ok).toBe(false);
    expect(rpcCalls).toBe(1);
  });

  it("refuses locally without a round trip once the memory bucket is spent", async () => {
    for (let i = 0; i < 2; i++) {
      expect((await takeDurableRateLimit("k3", 2, 60_000)).ok).toBe(true);
    }
    const spent = rpcCalls;
    const refused = await takeDurableRateLimit("k3", 2, 60_000);
    expect(refused.ok).toBe(false);
    expect(rpcCalls).toBe(spent);
  });
});
