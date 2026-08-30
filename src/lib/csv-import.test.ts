/**
 * CSV import is how somebody who is not Martin gets their holdings into this
 * product. Every bug fixed here was **silent** -- no error, no skipped row,
 * just a number that looked plausible and was not theirs, which then fed the
 * Sunday letter, Pulse and the position-size arithmetic.
 *
 * That is the failure shape these tests exist to prevent. A rejection the
 * person can see is fine; a wrong number they cannot is not.
 */
import { describe, expect, it } from "vitest";
import {
  HOLDINGS_CSV_TEMPLATE,
  detectCsvDialect,
  parseHoldingsCsv,
  parseHoldingsPaste,
} from "@/lib/csv-import";

const HEAD = "Ticker,Shares,Buy Price";

describe("number punctuation", () => {
  it("reads the American convention", () => {
    const r = parseHoldingsCsv(`${HEAD}\nAAPL,10,"1,234.56"`);
    expect(r.rows[0]?.buyPrice).toBe(1234.56);
  });

  it("reads the European convention instead of mangling it", () => {
    // Was 1.23456 -- off by a thousand, accepted without a murmur.
    const r = parseHoldingsCsv(`${HEAD}\nAAPL,10,"1.234,56"`);
    expect(r.rows[0]?.buyPrice).toBe(1234.56);
  });

  it("handles a space as the thousands separator", () => {
    // Was 123456 -- off by a hundred.
    const r = parseHoldingsCsv(`${HEAD}\nAAPL,10,"1 234,56"`);
    expect(r.rows[0]?.buyPrice).toBe(1234.56);
  });

  it("handles a non-breaking space, which is what exports actually emit", () => {
    const r = parseHoldingsCsv(`${HEAD}\nAAPL,10,"1 234,56"`);
    expect(r.rows[0]?.buyPrice).toBe(1234.56);
  });

  it("reads repeated grouping separators in either convention", () => {
    expect(parseHoldingsCsv(`${HEAD}\nAAPL,1,"1.234.567,89"`).rows[0]?.buyPrice).toBe(
      1234567.89
    );
    expect(parseHoldingsCsv(`${HEAD}\nAAPL,1,"1,234,567.89"`).rows[0]?.buyPrice).toBe(
      1234567.89
    );
  });

  it("keeps a plain decimal point untouched", () => {
    expect(parseHoldingsCsv(`${HEAD}\nAAPL,10,85.10`).rows[0]?.buyPrice).toBe(85.1);
  });

  it("reads accounting-style negatives for cash", () => {
    const r = parseHoldingsCsv(`Ticker,Shares,Buy Price,Cash\nAAPL,10,50,"(1 234,56)"`);
    expect(r.cash).toBe(-1234.56);
  });

  it("rejects text rather than inventing a number from it", () => {
    const r = parseHoldingsCsv(`${HEAD}\nAAPL,10,n/a`);
    expect(r.rows).toHaveLength(0);
    expect(r.skipped).toHaveLength(1);
  });
});

describe("dialect detection", () => {
  it("treats a semicolon file as European", () => {
    // Excel writes `;` exactly because the machine's decimal separator is
    // `,` -- it cannot use the same character for both jobs.
    expect(detectCsvDialect("Ticker;Shares;Buy Price")).toEqual({
      delimiter: ";",
      commaIsDecimal: true,
    });
  });

  it("treats a comma file as American", () => {
    expect(detectCsvDialect(HEAD)).toEqual({
      delimiter: ",",
      commaIsDecimal: false,
    });
  });

  it("does not split a European price into two cells", () => {
    // Was 150 -- the 25 cents fell into a cell nobody read.
    const r = parseHoldingsCsv("Ticker;Shares;Buy Price\nAAPL;10;150,25");
    expect(r.rows[0]?.buyPrice).toBe(150.25);
  });

  it("uses the delimiter to settle a genuinely ambiguous value", () => {
    // "1,234" is 1234 to an American and 1.234 to a European, and the
    // string alone cannot say which. The file's own punctuation can.
    expect(parseHoldingsCsv(`${HEAD}\nAAPL,10,"1,234"`).rows[0]?.buyPrice).toBe(1234);
    expect(
      parseHoldingsCsv("Ticker;Shares;Buy Price\nAAPL;10;1,234").rows[0]?.buyPrice
    ).toBe(1.234);
  });

  it("reads a tab-separated file", () => {
    const r = parseHoldingsCsv("Ticker\tShares\tBuy Price\nAAPL\t10\t150,25");
    expect(r.rows[0]?.buyPrice).toBe(150.25);
  });
});

describe("purchase lots", () => {
  it("adds a second lot instead of replacing the first", () => {
    // Was 100 shares at 150: half the position gone, silently.
    const r = parseHoldingsCsv(`${HEAD}\nAAPL,100,50\nAAPL,100,150`);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.shares).toBe(200);
    expect(r.rows[0]?.buyPrice).toBe(100);
  });

  it("weights the average by share count, not by row count", () => {
    const r = parseHoldingsCsv(`${HEAD}\nAAPL,300,100\nAAPL,100,200`);
    expect(r.rows[0]?.shares).toBe(400);
    expect(r.rows[0]?.buyPrice).toBe(125);
  });

  it("merges lots in the paste box too", () => {
    const r = parseHoldingsPaste("AAPL 100 50\nAAPL 100 150");
    expect(r.rows[0]?.shares).toBe(200);
    expect(r.rows[0]?.buyPrice).toBe(100);
  });

  it("does not let a later blank target erase an earlier one", () => {
    const r = parseHoldingsCsv(`Ticker,Shares,Buy Price,Call %\nAAPL,100,50,15\nAAPL,100,150,`);
    expect(r.rows[0]?.callPct).toBeCloseTo(0.15);
  });
});

describe("cash", () => {
  it("does not multiply a repeated Cash column by the number of holdings", () => {
    // Was 3000. A broker export repeats the account balance on every row.
    const r = parseHoldingsCsv(
      `Ticker,Shares,Buy Price,Cash\nAAPL,10,50,1000\nMSFT,5,60,1000\nNVDA,2,70,1000`
    );
    expect(r.cash).toBe(1000);
  });

  it("says so when the Cash column disagrees with itself", () => {
    const r = parseHoldingsCsv(
      `Ticker,Shares,Buy Price,Cash\nAAPL,10,50,1000\nMSFT,5,60,2000`
    );
    expect(r.cash).toBe(1000);
    expect(r.skipped.some((s) => /Cash column says/.test(s.reason))).toBe(true);
  });

  it("still adds up genuine CASH rows", () => {
    const r = parseHoldingsCsv(`${HEAD}\nAAPL,10,50\nCASH,,2500`);
    expect(r.cash).toBe(2500);
  });

  it("reads Bitcoin as the coin, including a Coinbase-style BTC row", () => {
    const named = parseHoldingsCsv(`${HEAD}\nBitcoin,0.5,40000`);
    expect(named.rows[0]?.ticker).toBe("BTC-USD");
    const short = parseHoldingsCsv(`${HEAD}\nBTC,0.25,40000`);
    expect(short.rows[0]?.ticker).toBe("BTC-USD");
  });

  it("applies the same ceiling to pasted cash as to imported cash", () => {
    // The paste path had no guard at all, so it accepted a balance the rest
    // of the app treats as impossible.
    expect(parseHoldingsPaste("CASH 999999999999999").cash).toBeNull();
  });
});

describe("the template it hands people", () => {
  it("parses cleanly through the importer", () => {
    // A template that its own parser chokes on is the worst first impression
    // available, so it is checked rather than assumed.
    const r = parseHoldingsCsv(HOLDINGS_CSV_TEMPLATE);
    expect(r.skipped).toHaveLength(0);
    expect(r.rows.map((x) => x.ticker)).toEqual(["AAPL", "MSFT"]);
    expect(r.cash).toBe(2500);
  });
});

describe("coins", () => {
  it("reads a Coins column as how many", () => {
    const r = parseHoldingsCsv("Ticker,Coins,Buy Price\nBTC,0.5,100000");
    expect(r.rows[0]?.ticker).toBe("BTC-USD");
    expect(r.rows[0]?.shares).toBe(0.5);
  });
});

describe("an ISIN column settles the coin ambiguity", () => {
  it("SOL with Emeren Group's ISIN is the company, not Solana", () => {
    const r = parseHoldingsCsv(
      "Ticker,Shares,Buy Price,ISIN\nSOL,300,1.90,US29103Y1010\nBTC,0.5,100000,"
    );
    expect(r.rows.map((x) => x.ticker)).toEqual(["SOL", "BTC-USD"]);
  });

  it("an EU ISIN still lands the row on its listed line", () => {
    const r = parseHoldingsCsv(
      "Ticker,Shares,Buy Price,ISIN\nRHM,2,1540,DE0007030009"
    );
    expect(r.rows[0]?.ticker).toBe("RHM.DE");
  });

  it("a file with no ISIN column reads the alias as the coin, as typing does", () => {
    const r = parseHoldingsCsv("Ticker,Shares,Buy Price\nSOL,10,150");
    expect(r.rows[0]?.ticker).toBe("SOL-USD");
  });
});
