import { describe, expect, it } from "vitest";
import {
  COINS,
  HOUSEHOLD_COINS,
  callPctForTicker,
  coinFromSymbol,
  coinSuggestions,
  isCoinSymbol,
  matchCoinQuery,
  tickerFieldText,
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
import { pulseTickerKey, sectorForTicker } from "@/lib/thesis-pulse";

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
    expect(matchCoinQuery("xbt")?.symbol).toBe("BTC-USD");
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
    expect(resolveTypedTicker("xbt")).toBe("BTC-USD");
    expect(resolveTypedTicker("NVDA")).toBe("NVDA");
  });

  it("does not steal a two-letter stock on Enter", () => {
    expect(resolveTypedTicker("so")).toBe("SO");
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

describe("field text and call %", () => {
  it("puts the English name in the ticker field, never the Yahoo pair", () => {
    expect(tickerFieldText("BTC-USD")).toBe("Bitcoin");
    expect(tickerFieldText("Bitcoin")).toBe("Bitcoin");
    expect(tickerFieldText("NVDA")).toBe("NVDA");
  });

  it("stores no covered-call yield on a coin", () => {
    expect(callPctForTicker("BTC-USD", 0.15)).toBe(0);
    expect(callPctForTicker("Bitcoin", 0.2)).toBe(0);
    expect(callPctForTicker("NVDA", 0.15)).toBe(0.15);
    expect(callPctForTicker("NVDA")).toBe(0.15);
  });

  it("maps $BTC to the stored pair for Pulse", () => {
    expect(pulseTickerKey("$BTC")).toBe("BTC-USD");
    expect(sectorForTicker("BTC-USD")).toBe("Coins");
    expect(sectorForTicker("BTC")).toBe("Coins");
  });
});

describe("a coin alias is also a listed symbol", () => {
  /*
    BTC is a Grayscale trust, SOL is Emeren Group, LINK is Interlink
    Electronics. `tickerFieldText` used to run an alias match, so choosing
    one of those companies out of the suggestion list wrote the coin's name
    into the field and the save stored the coin. Somebody who owns a solar
    company would have had it priced as Solana, in their portfolio value, in
    Pulse and in the Sunday letter.

    The field text now prettifies a stored coin symbol only. Which one the
    reader meant is settled by whether they picked it, which the two entry
    forms remember as a symbol rather than as text.
  */
  it("shows the coin's name for a stored coin symbol", () => {
    expect(tickerFieldText("BTC-USD")).toBe("Bitcoin");
    expect(tickerFieldText("SOL-USD")).toBe("Solana");
  });

  it("leaves a listed symbol alone, even when a coin shares its letters", () => {
    expect(tickerFieldText("BTC")).toBe("BTC");
    expect(tickerFieldText("SOL")).toBe("SOL");
    expect(tickerFieldText("LINK")).toBe("LINK");
  });

  it("leaves an ordinary ticker alone", () => {
    expect(tickerFieldText("NVDA")).toBe("NVDA");
    expect(tickerFieldText(" aapl ")).toBe("aapl");
  });
});
