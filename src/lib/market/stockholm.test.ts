import { describe, expect, it } from "vitest";
import {
  localTickerSuggestions,
  pickTickerSuggestion,
} from "@/lib/market/ticker-search";
import {
  STOCKHOLM_LISTINGS,
  stockholmFromClassTicker,
  stockholmSuggestions,
} from "@/lib/market/stockholm";
import {
  isPlausibleTicker,
  normalizeYahooTicker,
  tickerExchangeHint,
} from "@/lib/ticker";
import { listingCurrencyFromTicker } from "@/lib/listing-currency";

describe("Stockholm listings", () => {
  it("every entry is a plausible, unique .ST symbol", () => {
    const seen = new Set<string>();
    for (const row of STOCKHOLM_LISTINGS) {
      expect(row.symbol).toMatch(/\.ST$/);
      expect(isPlausibleTicker(row.symbol)).toBe(true);
      expect(seen.has(row.symbol)).toBe(false);
      seen.add(row.symbol);
      expect(tickerExchangeHint(row.symbol)).toBe("Stockholm");
    }
  });

  it("reads a share class the way Swedish brokers print it", () => {
    expect(normalizeYahooTicker("VOLV B")).toBe("VOLV-B.ST");
    expect(normalizeYahooTicker("volv-b")).toBe("VOLV-B.ST");
    expect(normalizeYahooTicker("NDA SE")).toBe("NDA-SE.ST");
    expect(normalizeYahooTicker("STO:ERIC-B")).toBe("ERIC-B.ST");
    expect(normalizeYahooTicker("XSTO:HM-B")).toBe("HM-B.ST");
  });

  it("leaves US class tickers and bare US symbols alone", () => {
    expect(normalizeYahooTicker("BRK-B")).toBe("BRK-B");
    expect(stockholmFromClassTicker("BRK B")).toBeNull();
    // SAND is a US listing too; the quote falls back to .ST on its own.
    expect(normalizeYahooTicker("SAND")).toBe("SAND");
    expect(normalizeYahooTicker("HELLO WORLD")).toBe("HELLOWORLD");
  });

  it("finds the names Yahoo's search misses", () => {
    expect(stockholmSuggestions("Investor").map((r) => r.symbol)).toEqual([
      "INVE-A.ST",
      "INVE-B.ST",
    ]);
    expect(stockholmSuggestions("H&M")[0]?.symbol).toBe("HM-B.ST");
    expect(stockholmSuggestions("handelsbanken")).toHaveLength(2);
    expect(stockholmSuggestions("Industrivärden")[0]?.symbol).toBe("INDU-A.ST");
    expect(stockholmSuggestions("VOLV B")[0]?.symbol).toBe("VOLV-B.ST");
  });

  it("reaches the local suggestion list and the pick", () => {
    const local = localTickerSuggestions("Volvo", [], new Set());
    expect(local.map((r) => r.symbol)).toContain("VOLV-B.ST");
    expect(pickTickerSuggestion("VOLV-B", local.concat(
      localTickerSuggestions("VOLV-B", [], new Set())
    ))?.symbol).toBe("VOLV-B.ST");
  });

  it("prices in kronor", () => {
    expect(listingCurrencyFromTicker("VOLV-B.ST")).toBe("SEK");
  });
});
