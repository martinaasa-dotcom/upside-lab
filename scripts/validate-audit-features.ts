/**
 * Validation harness for audit feature libs (no browser).
 * Run: npx tsx scripts/validate-audit-features.ts
 */
import { allocationBySector, allocationByTicker } from "../src/lib/allocation";
import {
  buildEarningsAlerts,
  buildGoalAlert,
  buildStrikeAlerts,
} from "../src/lib/alerts";
import { shockedPrice, SHOCKS } from "../src/lib/book-shock";
import {
  captureSheetSnapshot,
  popUndoSnapshot,
  pushUndoSnapshot,
} from "../src/lib/book-undo";
import { correlationMatrix, pearson } from "../src/lib/correlation";
import { estimateGreenStreak } from "../src/lib/streaks";
import { isForecastFullyCovered, FORECAST_YEARS } from "../src/lib/forecast";
import { ensureCompleteEoyTargets } from "../src/lib/forecast-plan";
import type { ForecastModel } from "../src/lib/forecast";
import { roundMoney, safeDiv } from "../src/lib/money";
import { enrichHoldings } from "../src/lib/calculations";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const slices = allocationBySector([
  { ticker: "NBIS", currentValue: 100 },
  { ticker: "RHM.DE", currentValue: 40 },
  { ticker: "VST", currentValue: 60 },
]);
assert(slices.length >= 2, "allocation sectors");
assert(
  Math.abs(slices.reduce((s, x) => s + x.pct, 0) - 1) < 1e-9,
  "alloc pct sum"
);

const byT = allocationByTicker(
  [
    { ticker: "A", currentValue: 90 },
    { ticker: "B", currentValue: 5 },
    { ticker: "C", currentValue: 5 },
  ],
  1
);
assert(byT.some((x) => x.label === "Other"), "ticker other bucket");

const strike = buildStrikeAlerts([
  { ticker: "X", spot: 110, stockTarget: 100, nextStrike: 120 },
]);
assert(strike.length >= 1, "strike alerts");

const earn = buildEarningsAlerts([
  { ticker: "X", date: "2026-08-12", days: 2 },
  { ticker: "Y", date: "2026-09-01", days: 20 },
]);
assert(earn.length === 1, "earnings window");

assert(buildGoalAlert(true, "Hit 100k"), "goal alert");
assert(Math.abs(shockedPrice("NBIS", 100, "ai_down20") - 80) < 1e-9, "ai shock nbis");
assert(Math.abs(shockedPrice("VST", 100, "ai_down20") - 83) < 1e-9, "ai shock vst");
assert(Math.abs(shockedPrice("PWR", 100, "ai_down20") - 84) < 1e-9, "ai shock pwr");
assert(shockedPrice("SMH", 100, "ai_down20") < 85, "semi ETF takes the AI hit");
assert(shockedPrice("VOO", 100, "ai_down20") > 92, "S&P ETF is not an AI name");
assert(
  shockedPrice("SMH", 100, "ai_down20") < shockedPrice("VOO", 100, "ai_down20") - 8,
  "SMH falls much harder than VOO in an AI shock"
);
assert(
  Math.abs(shockedPrice("VOO", 100, "ai_down20") - shockedPrice("SPY", 100, "ai_down20")) < 1,
  "VOO tracks SPY"
);
assert(
  shockedPrice("QTUM", 100, "ai_down20") < shockedPrice("VOO", 100, "ai_down20") - 5,
  "quantum ETF is not an S&P proxy"
);
assert(
  shockedPrice("SMH", 100, "broad_down15") < shockedPrice("VOO", 100, "broad_down15"),
  "high-beta semis fall more in a flash crash"
);
assert(shockedPrice("XOM", 100, "oil_shock25") > 100, "oil majors rally in an oil shock");
assert(shockedPrice("NVDA", 100, "oil_shock25") < 100, "tech eats the oil bill");
assert(Math.abs(shockedPrice("BMNR", 100, "btc_winter35") - 65) < 1e-9, "crypto bmnr");
assert(
  Math.abs(shockedPrice("NBIS", 100, "btc_winter35") - 82.5) < 1e-9,
  "crypto spill nbis"
);
assert(shockedPrice("SPY", 100, "btc_winter35") < 100, "crypto hits index beta");
assert(SHOCKS.length >= 4, "shock catalog");

const stack = pushUndoSnapshot([], {
  label: "test",
  portfolioId: "p1",
  cashBalance: 1,
  holdings: [],
  eoyOverrides: {},
});
const popped = popUndoSnapshot(stack);
assert(popped.snap?.label === "test", "undo pop");

assert(roundMoney(0.1 + 0.2) === 0.3, "roundMoney 0.1+0.2");
assert(safeDiv(10, 0) === 0, "safeDiv zero den");
assert(safeDiv(Number.NaN, 5) === 0, "safeDiv nan");
const zeroBasis = enrichHoldings(
  [
    {
      id: "1",
      portfolio_id: "p",
      ticker: "X",
      shares: 10,
      buy_price: 0,
      eoy_target: null,
      target_call_pct: 0.1,
      stock_target_override: null,
      sort_order: 0,
    },
  ],
  { X: { ticker: "X", price: 5, currency: "USD" } as never },
  0
);
assert(zeroBasis[0]?.roiPct === 0, "zero cost basis roiPct");
assert(zeroBasis[0]?.roiDollar === 50, "zero cost basis pnl dollars");

assert(Math.abs((pearson([1, 2, 3, 4, 5, 6], [2, 3, 4, 5, 6, 7]) ?? 0) - 1) < 1e-6, "pearson");
assert(
  correlationMatrix([
    { ticker: "A", sparkline: [1, 2, 3, 4, 5, 6] },
    { ticker: "B", sparkline: [2, 3, 4, 5, 6, 7] },
  ]).length === 1,
  "corr matrix"
);

assert(estimateGreenStreak([1, 2, 3, 4]).greenDays >= 3, "streak");

const forecastStub = {
  years: FORECAST_YEARS,
  rows: [
    {
      ticker: "NBIS",
      shares: 1,
      currentPrice: 100,
      currentValue: 100,
      eoyPrices: {
        2026: 100,
        2027: 100,
        2028: 100,
        2029: 100,
        2030: 100,
      },
      eoyValues: {
        2026: 100,
        2027: 100,
        2028: 100,
        2029: 100,
        2030: 100,
      },
      targetedYears: {
        2026: false,
        2027: false,
        2028: false,
        2029: false,
        2030: false,
      },
      gainPct: 0,
      hasTargets: false,
    },
  ],
  currentTotal: 100,
  eoyTotals: {
    2026: 100,
    2027: 100,
    2028: 100,
    2029: 100,
    2030: 100,
  },
  gainPct: 0,
} as ForecastModel;

const complete = ensureCompleteEoyTargets(
  forecastStub,
  [{ ticker: "NBIS", prices: { 2026: 120 } as never, rationale: "partial" }]
);
assert(complete[0]?.prices?.[2030], "ensureComplete fills years");
assert(
  (complete[0]?.prices?.[2030] ?? 0) > 100 * 3,
  "base AI infra fill is multi-bagger"
);
// Timid model path (classic 182 bug) must be rejected on BASE
const timidRejected = ensureCompleteEoyTargets(
  forecastStub,
  [
    {
      ticker: "NBIS",
      prices: {
        2026: 182,
        2027: 210,
        2028: 380,
        2029: 620,
        2030: 950,
      },
      rationale: "bad",
    },
  ]
);
assert(
  (timidRejected[0]?.prices?.[2026] ?? 0) > 100 * 1.2,
  "hot AI infra path is not lowered"
);
/*
  A path landing well under the shape for its kind of business is kept.

  This block used to assert the opposite: that ~3.6x by 2030 against a
  ~4.8x theme band was "lifted to the theme band". That lift is gone
  (2026-08-28), along with the outright replacement of a falling path and
  the current-year rewrite, because between them they meant a forecast
  could never point down. Measured before the removal: a model answering
  92, 78, 84, 70, 61 off a $100 spot reached the reader as
  139, 203, 182, 275, 357.
*/
const modestKept = ensureCompleteEoyTargets(forecastStub, [
  {
    ticker: "NBIS",
    prices: {
      2026: 115,
      2027: 160,
      2028: 188,
      2029: 267,
      2030: 364,
    },
    rationale: "gpu cloud compounding with a quiet year in 2028",
  },
]);
assert(
  modestKept[0]?.prices?.[2030] === 364,
  "a modest path under the theme band is kept, not lifted"
);
assert(
  /gpu cloud/i.test(modestKept[0]?.rationale ?? ""),
  "keeping a path keeps the model's rationale"
);

// A forecast may end below where it started, and may sit flat this year.
const falling = ensureCompleteEoyTargets(forecastStub, [
  {
    ticker: "NBIS",
    prices: { 2026: 92, 2027: 78, 2028: 84, 2029: 70, 2030: 61 },
    rationale: "losing share to cheaper capacity",
  },
]);
assert(
  FORECAST_YEARS.every((y) => (falling[0]?.prices?.[y] ?? 0) < 100),
  "a path ending below today's price reaches the reader intact"
);
assert(falling[0]?.prices?.[2030] === 61, "the falling destination is untouched");

const flatNow = ensureCompleteEoyTargets(forecastStub, [
  {
    ticker: "NBIS",
    prices: { 2026: 100.4, 2027: 230, 2028: 310, 2029: 391, 2030: 483 },
    rationale: "quiet rest of year, then the build lands",
  },
]);
assert(
  Math.abs((flatNow[0]?.prices?.[2026] ?? 0) - 100.4) < 1,
  "a flat current year is left flat rather than rewritten upward"
);
assert(flatNow[0]?.prices?.[2030] === 483, "later years are left alone");
const cryptoFill = ensureCompleteEoyTargets(
  {
    ...forecastStub,
    rows: [
      {
        ...forecastStub.rows[0]!,
        ticker: "BMNR",
        currentPrice: 20,
        currentValue: 20,
      },
    ],
  },
  [],
);
const cPrices = cryptoFill[0]!.prices;
assert(
  cPrices[2028]! < cPrices[2027]!,
  "crypto fallback has a winter year"
);
assert(!isForecastFullyCovered(["NBIS"], {}), "coverage empty");
assert(
  isForecastFullyCovered(["NBIS"], {
    NBIS: { 2026: 1, 2027: 1, 2028: 1, 2029: 1, 2030: 1 },
  }),
  "coverage full"
);

const snap = captureSheetSnapshot({
  label: "cap",
  portfolio: {
    id: "p",
    name: "T",
    slug: "t",
    sort_order: 0,
    cash_balance: 0,
  },
  holdings: [],
  eoyOverrides: {},
});
assert(snap.portfolioId === "p", "capture");

console.log("validate-audit-features: ALL PASSED");
