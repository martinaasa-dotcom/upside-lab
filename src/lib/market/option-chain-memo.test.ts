import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resetOptionChainMemoForTests,
  scanCoveredCall,
} from "@/lib/market/covered-call";

/*
  The heaviest thing this app asked a provider for, and nothing cached it.

  `scanCoveredCall` costs one call to list the expiry dates and one more per
  nearby expiry it prices, so up to four per holding, and the Dashboard
  fires the whole scan inside the quote refresh, which polls every fifteen
  seconds while the market is open. Ten holdings was therefore up to forty
  option-chain calls every fifteen seconds, all day, every one of them
  through the same circuit breaker every reader's live prices depend on.

  A chain is not a price: it is a list of listed contracts, and the strike
  this app picks off it does not move between two fifteen-second polls.
*/
const EXPIRY = new Date(Date.now() + 21 * 24 * 60 * 60_000);

function chainDouble() {
  const calls = { list: 0, detail: 0 };
  const options = vi.fn(async (_ticker: string, opts?: { date?: Date }) => {
    if (opts?.date) {
      calls.detail += 1;
      return {
        options: [
          {
            calls: [
              { strike: 110, bid: 2, ask: 2.2, lastPrice: 2.1 },
              { strike: 120, bid: 1, ask: 1.2, lastPrice: 1.1 },
            ],
          },
        ],
      };
    }
    calls.list += 1;
    return { expirationDates: [EXPIRY] };
  });
  return { calls, options };
}

async function withFakeYahoo<T>(
  options: unknown,
  run: () => Promise<T>
): Promise<T> {
  vi.doMock("yahoo-finance2", () => ({
    default: class {
      options = options;
    },
  }));
  vi.resetModules();
  return run();
}

afterEach(() => {
  resetOptionChainMemoForTests();
  vi.doUnmock("yahoo-finance2");
  vi.resetModules();
});

const position = {
  ticker: "NVDA",
  spot: 100,
  shares: 200,
  targetCallPct: 0.1,
  stockTarget: null,
  expiry: null,
  priceHistory: undefined,
};

describe("an option chain is asked for once, not once a poll", () => {
  it("answers a repeat scan without going back to the provider", async () => {
    const { calls, options } = chainDouble();
    await withFakeYahoo(options, async () => {
      const { scanCoveredCall: scan, resetOptionChainMemoForTests: reset } =
        await import("@/lib/market/covered-call");
      reset();
      await scan(position);
      const afterFirst = calls.list + calls.detail;
      expect(afterFirst).toBeGreaterThan(0);
      await scan(position);
      await scan(position);
      expect(calls.list + calls.detail).toBe(afterFirst);
    });
  });

  it("asks once when the same portfolio is opened by several readers at once", async () => {
    // The rule fetchQuotesWithFallback already follows: a class arriving
    // together costs one walk, not one each.
    const { calls, options } = chainDouble();
    await withFakeYahoo(options, async () => {
      const { scanCoveredCall: scan, resetOptionChainMemoForTests: reset } =
        await import("@/lib/market/covered-call");
      reset();
      await Promise.all([scan(position), scan(position), scan(position)]);
      expect(calls.list).toBe(1);
    });
  });

  it("keeps the expiry list and each priced expiry apart", async () => {
    // One key per symbol, one per symbol and date: a shared key would
    // serve the list where the calls belong.
    const { calls, options } = chainDouble();
    await withFakeYahoo(options, async () => {
      const { scanCoveredCall: scan, resetOptionChainMemoForTests: reset } =
        await import("@/lib/market/covered-call");
      reset();
      await scan(position);
      expect(calls.list).toBe(1);
      expect(calls.detail).toBeGreaterThan(0);
    });
  });
});

describe("what it still does when the provider fails", () => {
  it("falls back to the last good chain rather than to nothing", async () => {
    let fail = false;
    const { options } = chainDouble();
    const flaky = vi.fn(async (t: string, o?: { date?: Date }) => {
      if (fail) throw new Error("provider down");
      return options(t, o);
    });
    await withFakeYahoo(flaky, async () => {
      const { scanCoveredCall: scan, resetOptionChainMemoForTests: reset } =
        await import("@/lib/market/covered-call");
      reset();
      const first = await scan(position);
      expect(first).not.toBeNull();
      // Past the memo's life, and now the provider is down.
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.now() + 30 * 60_000));
      fail = true;
      const second = await scan(position);
      vi.useRealTimers();
      // Still an answer: a reader who saw an estimate a moment ago is not
      // shown an empty row now.
      expect(second).not.toBeNull();
    });
  });
});

describe("the module still exports what the route calls", () => {
  it("keeps scanCoveredCall's shape", () => {
    expect(typeof scanCoveredCall).toBe("function");
    expect(typeof resetOptionChainMemoForTests).toBe("function");
  });
});
