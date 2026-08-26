import { describe, expect, it } from "vitest";
import {
  COINS,
  HOUSEHOLD_COINS,
  coinFromSymbol,
  coinSuggestions,
  isCoinSymbol,
  matchCoinQuery,
} from "@/lib/coins";
import { cashtag } from "@/lib/format";
import {
  localTickerSuggestions,
  pickTickerSuggestion,
  resolveTypedTicker,
} from "@/lib/market/ticker-search";
import {
  normalizeYahooTicker,
  tickerStem,
  yahooQuoteCandidates,
  resolveImportTicker,
} from "@/lib/ticker";
import { forecastThemeForTicker } from "@/lib/forecast-conviction";

describe("the household catalog", () => {
  it("offers Bitcoin, Ethereum, and Solana on the chips", () => {
    expect(HOUSEHOLD_COINS.map((c) => c.name)).toEqual([
      "Bitcoin",
      "Ethereum",
      "Solana",
    ]);
  });

  it("does not put stables or dust-priced coins on the list", () => {
    const names = COINS.map((c) => c.symbol);
    expect(names).not.toContain("USDT-USD");
    expect(names).not.toContain("USDC-USD");
    expect(names).not.toContain("SHIB-USD");
    expect(names).not.toContain("PEPE-USD");
  });
});

describe("matchCoinQuery", () => {
  it("maps the names people type to the Yahoo pair we store", () => {
    expect(matchCoinQuery("Bitcoin")?.symbol).toBe("BTC-USD");
    expect(matchCoinQuery("btc")?.symbol).toBe("BTC-USD");
    expect(matchCoinQuery("BTC-USD")?.symbol).toBe("BTC-USD");
    expect(matchCoinQuery("ethereum")?.symbol).toBe("ETH-USD");
    expect(matchCoinQuery("sol")?.symbol).toBe("SOL-USD");
    expect(matchCoinQuery("dogecoin")?.symbol).toBe("DOGE-USD");
  });

  it("does not treat NVDA as a coin", () => {
    expect(matchCoinQuery("NVDA")).toBeNull();
    expect(isCoinSymbol("NVDA")).toBe(false);
  });
});

describe("quotes and display", () => {
  it("does not rewrite bare BTC, so a Bitcoin fund ticker still quotes", () => {
    expect(normalizeYahooTicker("BTC")).toBe("BTC");
  });

  it("does not walk European suffixes for a stored coin pair", () => {
    expect(yahooQuoteCandidates("BTC-USD")).toEqual(["BTC-USD"]);
  });

  it("still walks suffixes for the bare BTC fund ticker", () => {
    const cands = yahooQuoteCandidates("BTC");
    expect(cands[0]).toBe("BTC");
    expect(cands).toContain("BTC.DE");
  });

  it("shows $BTC, never $BTC-USD", () => {
    expect(cashtag("BTC-USD")).toBe("$BTC");
    expect(tickerStem("BTC-USD")).toBe("BTC");
    expect(coinFromSymbol("BTC-USD")?.name).toBe("Bitcoin");
  });

  it("leaves the fund cashtag as $BTC too, which is the same letters", () => {
    expect(cashtag("BTC")).toBe("$BTC");
  });
});

describe("search ranking", () => {
  it("picks the coin over a fund that shares the letters", () => {
    const picked = pickTickerSuggestion("BTC", [
      { symbol: "BTC", name: "Grayscale Bitcoin Mini Trust" },
      { symbol: "BTC-USD", name: "Bitcoin" },
    ]);
    expect(picked?.symbol).toBe("BTC-USD");
  });

  it("resolves typed Bitcoin without waiting on Yahoo", () => {
    expect(resolveTypedTicker("Bitcoin")).toBe("BTC-USD");
    expect(resolveTypedTicker("btc")).toBe("BTC-USD");
    expect(resolveTypedTicker("bit")).toBe("BTC-USD");
    expect(resolveTypedTicker("NVDA")).toBe("NVDA");
  });

  it("injects coins into local suggestions", () => {
    const rows = localTickerSuggestions("bit", ["AAPL"], new Set());
    expect(rows.some((r) => r.symbol === "BTC-USD" && r.name === "Bitcoin")).toBe(
      true
    );
  });

  it("prefix-matches Dogecoin only when they type it", () => {
    expect(coinSuggestions("doge").map((r) => r.symbol)).toContain("DOGE-USD");
    expect(HOUSEHOLD_COINS.some((c) => c.symbol === "DOGE-USD")).toBe(false);
  });
});

describe("import and Lab theme", () => {
  it("turns a Coinbase-style BTC row into the coin, not the fund", () => {
    expect(resolveImportTicker("BTC")).toBe("BTC-USD");
    expect(resolveImportTicker("Bitcoin")).toBe("BTC-USD");
  });

  it("lands a coin holding in the crypto bucket", () => {
    expect(forecastThemeForTicker("BTC-USD")).toBe("crypto");
    expect(forecastThemeForTicker("SOL-USD")).toBe("crypto");
  });
});
