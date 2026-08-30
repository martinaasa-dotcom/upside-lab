import { describe, expect, it } from "vitest";
import { buildCcAdvisorTools } from "./cc-advisor";
import { resolveImportTicker } from "@/lib/ticker";

/*
  Screenshot import, tested at the seam the model hands off to.

  The vision model reads the picture and calls importPortfolio; everything
  after that call is our code and deterministic, and it is the layer where
  a regression silently mis-reads somebody's holdings: the implied-cost
  arithmetic, the FX conversion, the skip rules for cash and total rows,
  the ISIN suffixing, and the dedupe. The model's own reading cannot run
  in CI, so these fixtures are model tool-calls shaped like real broker
  screenshots (a Lightyear-style EU portfolio, a Robinhood-style US one),
  which pins every number the reader would see.

  The coin cases are the sharp edge. BTC, SOL and LINK are coins when
  typed and companies when they arrive with an ISIN (SOL with US29103Y...
  is Emeren Group, a solar company); resolveImportTicker used to ask the
  coin list first and the ISIN never got a say, so a broker row for the
  company would have been imported and priced as the coin, in the
  portfolio value, Pulse, the forecast and the Sunday letter.
*/

type ImportResult = {
  action: string;
  cash: number | null;
  replace: boolean;
  holdings: Array<{ ticker: string; shares: number; buyPrice: number }>;
  message: string;
};

async function runImport(
  input: Record<string, unknown>,
  fx: { eurUsd: number | null; gbpUsd: number | null } = {
    eurUsd: null,
    gbpUsd: null,
  }
): Promise<ImportResult> {
  const tools = buildCcAdvisorTools(fx);
  const execute = tools.importPortfolio.execute as unknown as (
    args: unknown,
    options: unknown
  ) => Promise<ImportResult>;
  return execute(input, { toolCallId: "test", messages: [] });
}

function holding(result: ImportResult, ticker: string) {
  const row = result.holdings.find((h) => h.ticker === ticker);
  expect(row, `${ticker} missing from import: ${result.message}`).toBeDefined();
  return row as NonNullable<typeof row>;
}

describe("a Lightyear-shaped EU portfolio", () => {
  // Value column only (no average buy), EUR throughout, ISINs visible,
  // a EUR cash row folded into cashNative by the model.
  const fixture = {
    cashNative: 812.4,
    cashCurrency: "EUR",
    replace: true,
    holdings: [
      {
        ticker: "VUAA",
        isin: "IE00BFMXXD54",
        shares: 12.5,
        markValue: 1250.5,
        currency: "EUR",
      },
      {
        ticker: "RHM",
        isin: "DE0007030009",
        shares: 2,
        markValue: 3080,
        currency: "EUR",
      },
      {
        ticker: "AAPL",
        isin: "US0378331005",
        shares: 3,
        markValue: 690,
        currency: "EUR",
      },
    ],
  };

  it("implies cost from the Value column and converts once", async () => {
    const result = await runImport(fixture, { eurUsd: 1.08, gbpUsd: null });
    // 1250.50 EUR / 12.5 shares * 1.08 = 108.04 USD a share.
    expect(holding(result, "VUAA.DE").buyPrice).toBeCloseTo(108.04, 2);
    expect(holding(result, "RHM.DE").buyPrice).toBeCloseTo(1663.2, 1);
    expect(holding(result, "AAPL").buyPrice).toBeCloseTo(248.4, 1);
    expect(result.cash).toBeCloseTo(812.4 * 1.08, 2);
    expect(result.replace).toBe(true);
  });

  it("stores 1:1 and says so when the FX rate is missing", async () => {
    const result = await runImport(fixture);
    expect(holding(result, "VUAA.DE").buyPrice).toBeCloseTo(100.04, 2);
    expect(result.message).toContain("FX missing");
  });
});

describe("a Robinhood-shaped US portfolio", () => {
  it("passes bare tickers and average costs through untouched", async () => {
    const result = await runImport({
      cashUsd: 43.17,
      holdings: [
        { ticker: "NVDA", shares: 10, buyPrice: 104.55 },
        { ticker: "RKLB", shares: 200, buyPrice: 68.65 },
        // The totals row a model sometimes reads as a holding.
        { ticker: "TOTAL", shares: 1, buyPrice: 9999 },
      ],
    });
    expect(result.holdings.map((h) => h.ticker).sort()).toEqual([
      "NVDA",
      "RKLB",
    ]);
    expect(holding(result, "NVDA").buyPrice).toBe(104.55);
    expect(result.cash).toBe(43.17);
  });

  it("skips a row with neither cost nor value rather than inventing one", async () => {
    const result = await runImport({
      holdings: [
        { ticker: "NVDA", shares: 10, buyPrice: 104.55 },
        { ticker: "VST", shares: 5 },
      ],
    });
    expect(result.holdings.map((h) => h.ticker)).toEqual(["NVDA"]);
    expect(result.message).toContain("skipped VST");
  });

  it("keeps one row per ticker when the model repeats one", async () => {
    const result = await runImport({
      holdings: [
        { ticker: "NVDA", shares: 10, buyPrice: 100 },
        { ticker: "NVDA", shares: 10, buyPrice: 110 },
      ],
    });
    expect(result.holdings).toHaveLength(1);
  });
});

describe("the coin ambiguity", () => {
  it("a crypto row with no ISIN is the coin", () => {
    expect(resolveImportTicker("BTC")).toBe("BTC-USD");
    expect(resolveImportTicker("SOL")).toBe("SOL-USD");
  });

  it("SOL with Emeren Group's ISIN is the company, never the coin", async () => {
    expect(resolveImportTicker("SOL", "US29103Y1010")).toBe("SOL");
    const result = await runImport({
      holdings: [
        { ticker: "SOL", isin: "US29103Y1010", shares: 300, markValue: 570 },
      ],
    });
    expect(result.holdings.map((h) => h.ticker)).toEqual(["SOL"]);
  });

  it("a junk isin field does not strip a coin row of its meaning", () => {
    // The model sometimes fills the field with a dash or a note; only a
    // code shaped like a real ISIN carries the authority to settle it.
    expect(resolveImportTicker("BTC", "-")).toBe("BTC-USD");
    expect(resolveImportTicker("BTC", "not shown")).toBe("BTC-USD");
  });

  it("an EU ISIN still lands on the listed line", () => {
    expect(resolveImportTicker("LINK", "DE0006251437")).toBe("LINK.DE");
  });
});
