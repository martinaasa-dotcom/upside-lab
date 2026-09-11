import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ensureQuotes,
  pooledQuote,
  publishQuotes,
  resetQuotePoolForTests,
  staleAmong,
} from "@/lib/quote-pool";
import type { Quote } from "@/lib/types";

function quote(ticker: string, price: number): Quote {
  return {
    ticker,
    price,
    change: 0,
    changePercent: 0,
    previousClose: price,
    sparkline: [],
    marketState: "REGULAR",
    preMarketPrice: null,
    preMarketChange: null,
    preMarketChangePercent: null,
    postMarketPrice: null,
    postMarketChange: null,
    postMarketChangePercent: null,
  } as Quote;
}

describe("one price per ticker for the whole browser", () => {
  beforeEach(() => {
    resetQuotePoolForTests();
    vi.stubGlobal("window", undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("makes a quote from one surface available to every other", () => {
    /*
      The whole point. The portfolio poll already fetches most of what any
      room wants; before this, a room wanting a price the reader plainly
      holds went and fetched it again.
    */
    publishQuotes({ AAPL: quote("AAPL", 200) });
    expect(pooledQuote("AAPL")?.price).toBe(200);
    // Case and padding are not a different company.
    expect(pooledQuote(" aapl ")?.price).toBe(200);
  });

  it("asks only for what it does not already have", () => {
    publishQuotes({ AAPL: quote("AAPL", 200), MSFT: quote("MSFT", 400) });
    expect(staleAmong(["AAPL", "MSFT", "KO"])).toEqual(["KO"]);
    expect(staleAmong(["AAPL", "MSFT"])).toEqual([]);
  });

  it("fetches the missing names once, however many ask at the same time", async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({ quotes: { KO: quote("KO", 60) } }),
      url,
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    publishQuotes({ AAPL: quote("AAPL", 200) });
    await Promise.all([
      ensureQuotes(["AAPL", "KO"]),
      ensureQuotes(["AAPL", "KO"]),
      ensureQuotes(["KO"]),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // And it asked for the missing one only, not the one already known.
    expect(String(fetchMock.mock.calls[0]![0])).toContain("tickers=KO");
    expect(String(fetchMock.mock.calls[0]![0])).not.toContain("AAPL");
    expect(pooledQuote("KO")?.price).toBe(60);
  });

  it("asks for nothing when everything is already known", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    publishQuotes({ AAPL: quote("AAPL", 200) });
    await ensureQuotes(["AAPL"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records nothing from a failed request", async () => {
    /*
      One bad minute must not be written down as an answer, or the pool
      would hand every room a gap it then refuses to re-ask for.
    */
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch
    );
    await ensureQuotes(["KO"]);
    expect(pooledQuote("KO")).toBeNull();
    expect(staleAmong(["KO"])).toEqual(["KO"]);
  });

  it("treats a price older than the app's own limit as missing", () => {
    // Published with a timestamp from well before any session window.
    publishQuotes({ KO: quote("KO", 60) }, Date.now() - 6 * 60 * 60 * 1000);
    expect(pooledQuote("KO")).toBeNull();
    expect(staleAmong(["KO"])).toEqual(["KO"]);
  });
});
