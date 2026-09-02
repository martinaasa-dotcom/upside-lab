/**
 * A name that is not a ticker is the most expensive thing the market layer
 * can be handed: nothing resolves it, so it walks the bare symbol plus
 * sixteen exchange suffixes at two upstream calls each. `isQuotableTicker`
 * is what keeps free text away from that walk, so it has to let through
 * every shape this product legitimately stores.
 */
import { describe, expect, it } from "vitest";
import { isPlausibleTicker, isQuotableTicker, normalizeYahooTicker } from "@/lib/ticker";

describe("isQuotableTicker", () => {
  it("accepts every shape the app stores", () => {
    const real = [
      "NBIS",
      "BRK.B",
      "VUAA.DE",
      "CSPX.L",
      "IWDA.AS",
      "SAN.PA",
      "VOE.VI",
      "LHV1T.TL",
      "2B7K.DE",
      "BTC-USD",
      "SOL-USD",
      "EURUSD=X",
      "^GSPC",
      "ES=F",
      "NQ=F",
    ];
    for (const t of real) {
      expect(isQuotableTicker(t), t).toBe(true);
    }
  });

  it("accepts a broker's exchange prefix, because normalizing settles it", () => {
    // LON:VOD is what a Lightyear reader may still have stored, and the
    // quote path turns it into VOD.L on the way out.
    expect(isQuotableTicker("LON:VOD")).toBe(true);
    expect(normalizeYahooTicker("LON:VOD")).toBe("VOD.L");
    // The typed form is not itself a symbol shape, so the second test is
    // the one carrying it.
    expect(isPlausibleTicker("LON:VOD")).toBe(false);
  });

  it("refuses free text, markup and anything oversized", () => {
    const junk = [
      "",
      "   ",
      "HELLO WORLD",
      "<script>",
      "A(B",
      "DROP TABLE",
      "NBIS;RM",
      "'; SELECT 1 --",
      "A".repeat(64),
      "ÅÄÖ",
      "../../ETC",
    ];
    for (const t of junk) {
      expect(isQuotableTicker(t), t).toBe(false);
    }
  });

  it("is case and whitespace insensitive, like the routes that call it", () => {
    expect(isQuotableTicker(" nbis ")).toBe(true);
    expect(isQuotableTicker("vuaa.de")).toBe(true);
  });
});
