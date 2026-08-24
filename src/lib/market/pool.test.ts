/**
 * The provider fan-out is bounded, and the bound is measured rather than
 * asserted. One request may ask about 120 names; before this, every one of
 * them started in the same tick, so a feed already answering 429 was sent
 * the whole batch and the breaker never got a turn. The Finnhub path
 * measured 120 sockets and 360 upstream calls for a single request, and 6
 * sockets and 24 calls after.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let inFlight = 0;
let peak = 0;
let calls = 0;
let status = 429;

vi.stubGlobal("fetch", async () => {
  calls++;
  inFlight++;
  peak = Math.max(peak, inFlight);
  await new Promise((resolve) => setTimeout(resolve, 2));
  inFlight--;
  return new Response("{}", {
    status,
    headers: { "retry-after": "0" },
  });
});

const { fetchQuotesFinnhub } = await import("@/lib/market/providers/finnhub");
const { resetMarketCircuits } = await import("@/lib/market/circuit-breaker");
const { mapWithConcurrency } = await import("@/lib/market/pool");

const BIG_ASK = Array.from({ length: 120 }, (_, i) => `ZZQ${i}`);

beforeEach(() => {
  inFlight = 0;
  peak = 0;
  calls = 0;
  status = 429;
  resetMarketCircuits();
  process.env.FINNHUB_API_KEY = "test-key";
});

describe("mapWithConcurrency", () => {
  it("never runs more than the limit at once, and still visits everything", async () => {
    let live = 0;
    let seen = 0;
    let widest = 0;
    const out = await mapWithConcurrency(BIG_ASK, 5, async (item) => {
      live++;
      widest = Math.max(widest, live);
      seen++;
      await new Promise((resolve) => setTimeout(resolve, 1));
      live--;
      return item;
    });
    expect(widest).toBeLessThanOrEqual(5);
    expect(seen).toBe(BIG_ASK.length);
    expect(out).toEqual(BIG_ASK);
  });

  it("keeps results in the order the items came in", async () => {
    const out = await mapWithConcurrency([3, 1, 2], 3, async (n) => {
      await new Promise((resolve) => setTimeout(resolve, n));
      return n * 10;
    });
    expect(out).toEqual([30, 10, 20]);
  });

  it("is a no-op on an empty list", async () => {
    const fn = vi.fn();
    expect(await mapWithConcurrency([], 4, fn)).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("finnhub fan-out for a 120 name miss", () => {
  it("opens a handful of sockets, not one per name", async () => {
    await fetchQuotesFinnhub(BIG_ASK);
    expect(peak).toBeLessThanOrEqual(6);
  }, 30_000);

  it("lets the breaker stop the rest once the feed says 429", async () => {
    await fetchQuotesFinnhub(BIG_ASK);
    // Three recorded failures open the circuit, and every name after that
    // is skipped before a socket is opened. The old shape could not do
    // this: it measured 360 calls, three per name, all in flight at once.
    expect(calls).toBeLessThan(BIG_ASK.length);
  }, 30_000);

  it("still prices every name when the feed is healthy", async () => {
    status = 200;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return new Response(
        JSON.stringify({ c: 10, pc: 9, d: 1, dp: 11.1 }),
        { status: 200 }
      );
    });
    const quotes = await fetchQuotesFinnhub(BIG_ASK);
    expect(Object.keys(quotes)).toHaveLength(BIG_ASK.length);
    expect(quotes.ZZQ0.price).toBe(10);
  }, 30_000);
});
