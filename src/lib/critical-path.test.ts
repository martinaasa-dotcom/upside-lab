import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { concentrationRead, themeBreakdown } from "@/lib/allocation";
import {
  buildCoveredCallRows,
  buildSnapshot,
  enrichHoldings,
} from "@/lib/calculations";
import { importCashDelta, tradeCashDelta } from "@/lib/cash-delta";
import { sheetCashBalance } from "@/lib/cash-balance";
import {
  calculateCompound,
  effectiveAnnualRate,
  type CompoundInputs,
} from "@/lib/compound-interest";
import {
  deleteHolding,
  patchHolding,
  updateCash,
  upsertHolding,
  type DemoStore,
} from "@/lib/demo-store";
import {
  NO_VALUE,
  currency,
  number as formatNumber,
  percent,
  signedCurrency,
  signedPercent,
} from "@/lib/format";
import { buildForecast } from "@/lib/forecast";
import { isSafePositiveMoney, isSafeShares, isSafeSignedMoney } from "@/lib/input-guard";
import {
  cagr,
  finiteNumber,
  MAX_SAFE_MONEY,
  mean,
  roundMoney,
  safeDiv,
} from "@/lib/money";
import { parseDecimal } from "@/lib/number-input";
import {
  buildOverview,
  todayDollarFor,
  type OverviewModel,
} from "@/lib/overview";
import { parseHolding, parsePortfolio } from "@/lib/parse-book";
import type { Holding, Portfolio, PortfolioSnapshot, Quote } from "@/lib/types";

vi.mock("@/lib/market/quotes", () => ({
  fetchQuotesWithFallback: vi.fn(async () => ({ quotes: {}, sources: {} })),
}));

import {
  applyPortfolioCashDelta,
  applyTradeCashDelta,
  salePriceFor,
} from "@/lib/cash-trade";

function quote(ticker: string, price: number, extra: Partial<Quote> = {}): Quote {
  return {
    ticker,
    price,
    change: 0,
    changePercent: 0,
    previousClose: price,
    sparkline: [],
    marketState: null,
    preMarketPrice: null,
    preMarketChange: null,
    preMarketChangePercent: null,
    postMarketPrice: null,
    postMarketChange: null,
    postMarketChangePercent: null,
    ...extra,
  };
}

function holding(
  partial: Partial<Holding> &
    Pick<Holding, "id" | "portfolio_id" | "ticker" | "shares" | "buy_price">
): Holding {
  return {
    eoy_target: null,
    target_call_pct: 0.15,
    stock_target_override: null,
    sort_order: 1,
    ...partial,
  };
}

function portfolio(
  partial: Partial<Portfolio> & Pick<Portfolio, "id" | "name">
): Portfolio {
  return {
    slug: partial.slug ?? partial.id,
    sort_order: 1,
    cash_balance: 0,
    ...partial,
  };
}

function paperPortfolio(
  partial: Partial<Portfolio> & Pick<Portfolio, "id" | "name">
): Portfolio {
  return portfolio({ classroom_community_id: "class-1", ...partial });
}

function holdingWriteCashDelta(opts: {
  prevShares?: number | null;
  nextShares: number;
  nextBuy: number;
  salePrice: number;
  renamed?: boolean;
}): number {
  const prevShares = opts.prevShares ?? null;
  if (prevShares == null) {
    return tradeCashDelta({
      buyShares: opts.nextShares,
      buyPrice: opts.nextBuy,
    });
  }
  if (opts.renamed) {
    return roundMoney(
      tradeCashDelta({ sellShares: prevShares, sellPrice: opts.salePrice }) +
        tradeCashDelta({ buyShares: opts.nextShares, buyPrice: opts.nextBuy })
    );
  }
  if (opts.nextShares > prevShares) {
    return tradeCashDelta({
      buyShares: opts.nextShares - prevShares,
      buyPrice: opts.nextBuy,
    });
  }
  if (opts.nextShares < prevShares) {
    return tradeCashDelta({
      sellShares: prevShares - opts.nextShares,
      sellPrice: opts.salePrice,
    });
  }
  return 0;
}

function applyCashDelta(cash: number, delta: number): number {
  if (!Number.isFinite(delta) || delta === 0) return cash;
  return roundMoney(cash + delta);
}

const POISON = /\bNaN\b|Infinity|∞/;

function assertCleanDisplay(labels: Array<string | number | null | undefined>) {
  for (const label of labels) {
    if (typeof label === "number") {
      if (!Number.isFinite(label)) {
        throw new Error(`metric panel number is not finite: ${String(label)}`);
      }
      continue;
    }
    if (label == null) continue;
    if (POISON.test(label)) {
      throw new Error(`metric panel rendered poison: ${label}`);
    }
  }
}

function assertFiniteTree(value: unknown, path = "root"): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} is ${String(value)}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertFiniteTree(item, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (child === null) continue;
      assertFiniteTree(child, `${path}.${key}`);
    }
  }
}

/** CashModal's field: the pad types no minus, so only digits and a dot land. */
function cashKeystrokes(raw: string): { text: string; flipsSign: boolean } {
  const cleaned = raw.replace(/,/g, ".");
  return {
    text: cleaned.replace(/[^\d.]/g, ""),
    flipsSign: cleaned.includes("-"),
  };
}

/** CashModal's submit: the amount as typed, with the sign from the toggle. */
function cashFromInput(
  raw: string,
  sign: "have" | "owe" = "have"
): { ok: true; cash: number } | { ok: false } {
  const typed = parseDecimal(raw);
  const n = sign === "owe" && typed !== 0 ? -typed : typed;
  if (!isSafeSignedMoney(n)) return { ok: false };
  return { ok: true, cash: roundMoney(n) };
}

function mockSupabase(opts: {
  cash?: number;
  classroomId?: string | null;
  rpc?: { data: unknown; error: { message: string } | null };
  lookupError?: boolean;
}): SupabaseClient {
  const rpc = vi.fn(async () => opts.rpc ?? { data: 0, error: null });
  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => {
          if (opts.lookupError) {
            return { data: null, error: { message: "lookup failed" } };
          }
          return {
            data: {
              cash_balance: opts.cash ?? 0,
              classroom_community_id: opts.classroomId ?? null,
            },
            error: null,
          };
        },
      }),
    }),
  }));
  return { rpc, from } as unknown as SupabaseClient;
}

const HOLDING_FIELDS = {
  eoy_target: null,
  target_call_pct: 0.15,
  stock_target_override: null,
  sort_order: 1,
} as const;

function storeOf(
  sheet: Portfolio,
  rows: DemoStore["holdings"] = []
): DemoStore {
  return { portfolios: [sheet], holdings: rows };
}

function cashOf(store: DemoStore): number {
  return store.portfolios[0]!.cash_balance;
}

function overviewPanelCopy(model: OverviewModel): string[] {
  const t = model.totals;
  return [
    currency(t.totalValue, 0),
    signedCurrency(t.todayDollar, 0),
    t.todayPct != null ? percent(t.todayPct) : NO_VALUE,
    signedCurrency(t.roiDollar, 0),
    percent(t.roiPct),
    currency(t.cash, 0),
    ...model.sheets.flatMap((sheet) => [
      currency(sheet.totalValue, 0),
      percent(sheet.roiPct),
      signedCurrency(sheet.todayDollar, 0),
      currency(sheet.buyValue, 0),
    ]),
    ...model.tickers.flatMap((row) => [
      currency(row.price),
      percent(row.roiPct),
      signedCurrency(row.roiDollar, 0),
      signedCurrency(row.todayDollar, 0),
      row.todayPct != null ? percent(row.todayPct, 2) : NO_VALUE,
    ]),
  ];
}

function snapshotPanelCopy(snap: PortfolioSnapshot): string[] {
  const t = snap.totals;
  return [
    percent(t.roiPct),
    currency(t.buyValue, 0),
    currency(t.currentValue, 0),
    signedCurrency(t.roiDollar, 0),
    percent(t.yield2wAvg),
    currency(t.premiumTotal),
    ...snap.holdings.flatMap((h) => [
      percent(h.pctOfTotal),
      percent(h.roiPct),
      currency(h.buyValue),
      currency(h.currentValue),
      signedCurrency(h.roiDollar),
    ]),
    ...snap.coveredCallRows.flatMap((r) => [
      currency(r.spot),
      currency(r.totalValue),
      r.targetDistance != null ? percent(r.targetDistance) : NO_VALUE,
      r.nextStrike != null ? currency(r.nextStrike) : NO_VALUE,
      r.yield2w != null ? percent(r.yield2w) : NO_VALUE,
      r.premium != null ? currency(r.premium) : NO_VALUE,
    ]),
  ];
}

function compound(partial: Partial<CompoundInputs> = {}): CompoundInputs {
  return {
    principal: 0,
    ratePercent: 8,
    ratePeriod: "annual",
    compound: "monthly",
    years: 10,
    months: 0,
    contributionMode: "none",
    depositAmount: 0,
    depositFrequency: "monthly",
    withdrawalAmount: 0,
    withdrawalFrequency: "monthly",
    increaseMode: "percent",
    annualIncrease: 0,
    ...partial,
  };
}

describe("cash operations", () => {
  it("adds, subtracts, and no-ops zero or junk deltas", () => {
    expect(tradeCashDelta({ buyShares: 10, buyPrice: 20 })).toBe(-200);
    expect(tradeCashDelta({ sellShares: 10, sellPrice: 25 })).toBe(250);
    expect(tradeCashDelta({ buyShares: 0, buyPrice: 100 })).toBe(0);
    expect(tradeCashDelta({ buyShares: Number.NaN, buyPrice: 10 })).toBe(0);
    expect(applyCashDelta(1000, 250)).toBe(1250);
    expect(applyCashDelta(1000, -400)).toBe(600);
    expect(applyCashDelta(1000, 0)).toBe(1000);
    expect(applyCashDelta(1000, Number.NaN)).toBe(1000);
    expect(applyCashDelta(200, -500)).toBe(-300);
  });

  it("round-trips a buy then the matching sell back to zero", () => {
    for (const [shares, price] of [
      [3, 2.675],
      [7, 8.165],
      [11, 1.005],
      [1, 0.005],
    ] as const) {
      const out = tradeCashDelta({ buyShares: shares, buyPrice: price });
      const back = tradeCashDelta({ sellShares: shares, sellPrice: price });
      expect(out + back).toBe(0);
    }
  });

  it("keeps cash below zero on a real portfolio as well as a paper one", () => {
    expect(sheetCashBalance({ cash_balance: -1600 })).toBe(-1600);
    expect(
      sheetCashBalance({
        cash_balance: -1600,
        classroom_community_id: "class-1",
      })
    ).toBe(-1600);
    expect(sheetCashBalance({ cash_balance: Number.NaN })).toBe(0);
  });

  it("takes borrowed cash from the sign toggle, on a real portfolio too", () => {
    expect(cashFromInput("2500.5")).toEqual({ ok: true, cash: 2500.5 });
    expect(cashFromInput("0")).toEqual({ ok: true, cash: 0 });
    expect(cashFromInput("100", "owe")).toEqual({ ok: true, cash: -100 });
    expect(cashFromInput("7000", "owe")).toEqual({ ok: true, cash: -7000 });
    // Zero has no sign, so the toggle can never write -0.
    const zeroOwed = cashFromInput("0", "owe");
    expect(zeroOwed).toEqual({ ok: true, cash: 0 });
    expect(zeroOwed.ok && Object.is(zeroOwed.cash, -0)).toBe(false);
  });

  it("keeps junk out of the amount field and enormous amounts out of the save", () => {
    // A phone pad offers digits and a dot; a paste can still carry anything.
    expect(cashKeystrokes("Infinity").text).toBe("");
    expect(cashKeystrokes("1 234,50").text).toBe("1234.50");
    // A pasted minus is the sign, so it flips the toggle instead of parsing.
    expect(cashKeystrokes("-7000")).toEqual({ text: "7000", flipsSign: true });
    expect(cashFromInput("999999999999999999", "owe")).toEqual({ ok: false });
    expect(cashFromInput("999999999999999999")).toEqual({ ok: false });
  });

  it("writes absolute cash through the demo store, including zero and paper negative", () => {
    const real = storeOf(portfolio({ id: "p1", name: "Real", cash_balance: 400 }));
    expect(updateCash(real, "p1", 900).portfolios[0]!.cash_balance).toBe(900);
    expect(updateCash(real, "p1", 0).portfolios[0]!.cash_balance).toBe(0);
    expect(
      updateCash(
        storeOf(paperPortfolio({ id: "hw", name: "HW", cash_balance: 1000 })),
        "hw",
        -50
      ).portfolios[0]!.cash_balance
    ).toBe(-50);
  });

  it("does not call the cash RPC for a zero or non-finite delta", async () => {
    const sb = mockSupabase({ cash: 500 });
    expect(await applyPortfolioCashDelta(sb, "p1", 0)).toBe(500);
    expect(await applyPortfolioCashDelta(sb, "p1", Number.NaN)).toBe(500);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("sends rounded add and subtract through the atomic RPC", async () => {
    const add = mockSupabase({ rpc: { data: 1250.5, error: null } });
    expect(await applyPortfolioCashDelta(add, "p1", 250.499)).toBe(1250.5);
    expect(add.rpc).toHaveBeenCalledWith("portfell_apply_cash_delta", {
      p_portfolio_id: "p1",
      p_delta: 250.5,
    });
    const sub = mockSupabase({ rpc: { data: -300, error: null } });
    expect(await applyPortfolioCashDelta(sub, "p1", -500)).toBe(-300);
  });

  it("fails closed when the RPC errors or returns junk", async () => {
    expect(
      await applyPortfolioCashDelta(
        mockSupabase({ rpc: { data: null, error: { message: "boom" } } }),
        "p1",
        10
      )
    ).toBeNull();
    expect(
      await applyPortfolioCashDelta(
        mockSupabase({ rpc: { data: Number.POSITIVE_INFINITY, error: null } }),
        "p1",
        10
      )
    ).toBeNull();
  });

  it("does not move cash on a real book, and does move it on a paper sheet", async () => {
    const real = mockSupabase({ cash: 400, classroomId: null });
    expect(await applyTradeCashDelta(real, "p1", -200)).toBe(400);
    expect(real.rpc).not.toHaveBeenCalled();
    const paper = mockSupabase({
      cash: 10_000,
      classroomId: "class-1",
      rpc: { data: 8400, error: null },
    });
    expect(await applyTradeCashDelta(paper, "hw", -1600)).toBe(8400);
    expect(paper.rpc).toHaveBeenCalledOnce();
  });
});

describe("holdings mutations", () => {
  it("spends, credits, and skips cash for create / qty change / price-only / rename / delete", () => {
    expect(
      holdingWriteCashDelta({ nextShares: 10, nextBuy: 160, salePrice: 160 })
    ).toBe(-1600);
    expect(
      holdingWriteCashDelta({
        prevShares: 10,
        nextShares: 12,
        nextBuy: 110,
        salePrice: 105,
      })
    ).toBe(-220);
    expect(
      holdingWriteCashDelta({
        prevShares: 10,
        nextShares: 4,
        nextBuy: 100,
        salePrice: 90,
      })
    ).toBe(540);
    expect(
      holdingWriteCashDelta({
        prevShares: 10,
        nextShares: 10,
        nextBuy: 80,
        salePrice: 110,
      })
    ).toBe(0);
    expect(
      holdingWriteCashDelta({
        prevShares: 10,
        nextShares: 10,
        nextBuy: 60,
        salePrice: 55,
        renamed: true,
      })
    ).toBe(-50);
    expect(tradeCashDelta({ sellShares: 10, sellPrice: 175 })).toBe(1750);
  });

  it("keeps a paper ledger consistent across create, add, cut, and delete", () => {
    let cash = 10_000;
    cash = applyCashDelta(
      cash,
      holdingWriteCashDelta({ nextShares: 10, nextBuy: 100, salePrice: 100 })
    );
    expect(cash).toBe(9000);
    cash = applyCashDelta(
      cash,
      holdingWriteCashDelta({
        prevShares: 10,
        nextShares: 15,
        nextBuy: 120,
        salePrice: 110,
      })
    );
    expect(cash).toBe(8400);
    cash = applyCashDelta(
      cash,
      holdingWriteCashDelta({
        prevShares: 15,
        nextShares: 5,
        nextBuy: 120,
        salePrice: 130,
      })
    );
    expect(cash).toBe(9700);
    cash = applyCashDelta(cash, tradeCashDelta({ sellShares: 5, sellPrice: 130 }));
    expect(cash).toBe(10_350);
  });

  it("does not spend cash when creating a holding on a real book", () => {
    const next = upsertHolding(
      storeOf(portfolio({ id: "real", name: "Real", cash_balance: 0 })),
      {
        portfolio_id: "real",
        ticker: "AAPL",
        shares: 10,
        buy_price: 160,
        ...HOLDING_FIELDS,
      }
    );
    expect(cashOf(next)).toBe(0);
    expect(next.holdings[0]!.ticker).toBe("AAPL");
  });

  it("recalculates paper cash on create, qty patch, price-only patch, and delete", () => {
    const created = upsertHolding(
      storeOf(paperPortfolio({ id: "hw", name: "Homework", cash_balance: 10_000 })),
      {
        portfolio_id: "hw",
        ticker: "AAPL",
        shares: 10,
        buy_price: 100,
        ...HOLDING_FIELDS,
      }
    );
    expect(cashOf(created)).toBe(9000);
    const id = created.holdings[0]!.id;
    const added = patchHolding(created, id, { shares: 12 });
    expect(cashOf(added)).toBe(8800);
    const cut = patchHolding(added, id, { shares: 4 });
    expect(cashOf(cut)).toBe(9600);
    const priced = patchHolding(cut, id, { buy_price: 80 });
    expect(cashOf(priced)).toBe(9600);
    expect(priced.holdings[0]!.buy_price).toBe(80);
    const gone = deleteHolding(priced, id);
    expect(gone.holdings).toHaveLength(0);
    // Demo sells at the stored cost, so 4 × $80 comes back, not the original $100.
    expect(cashOf(gone)).toBe(9920);
  });

  it("lets paper cash go negative when a buy overruns the ledger", () => {
    const next = upsertHolding(
      storeOf(paperPortfolio({ id: "hw", name: "Homework", cash_balance: 100 })),
      {
        portfolio_id: "hw",
        ticker: "AAPL",
        shares: 10,
        buy_price: 50,
        ...HOLDING_FIELDS,
      }
    );
    expect(cashOf(next)).toBe(-400);
  });

  it("credits import share adds, cuts, and replace-deletes", () => {
    expect(
      importCashDelta(
        [{ ticker: "AAPL", shares: 10, buy_price: 100 }],
        [{ ticker: "AAPL", shares: 12, buy_price: 110 }],
        false,
        {}
      )
    ).toBe(-220);
    expect(
      importCashDelta(
        [{ ticker: "AAPL", shares: 10, buy_price: 100 }],
        [{ ticker: "AAPL", shares: 4, buy_price: 100 }],
        false,
        { AAPL: 90 }
      )
    ).toBe(540);
    expect(
      importCashDelta(
        [
          { ticker: "AAPL", shares: 10, buy_price: 100 },
          { ticker: "MSFT", shares: 2, buy_price: 400 },
        ],
        [{ ticker: "AAPL", shares: 10, buy_price: 100 }],
        true,
        { MSFT: 410 }
      )
    ).toBe(820);
  });

  it("rejects zero/junk shares and prices at the write guard", () => {
    expect(isSafeShares(0)).toBe(false);
    expect(isSafePositiveMoney(0)).toBe(false);
    expect(isSafePositiveMoney(Number.POSITIVE_INFINITY)).toBe(false);
    expect(
      parseHolding({
        id: "h1",
        portfolio_id: "p1",
        ticker: "AAPL",
        shares: Number.NaN,
        buy_price: 10,
      })
    ).toBeNull();
  });
});

describe("math invariants: zero books and $0 cost never render NaN/Infinity", () => {
  it("formatters say n/a for junk and a real $0 for zero", () => {
    expect(currency(Number.NaN)).toBe(NO_VALUE);
    expect(currency(Number.POSITIVE_INFINITY)).toBe(NO_VALUE);
    expect(percent(Number.POSITIVE_INFINITY)).toBe(NO_VALUE);
    expect(signedPercent(1 / 0)).toBe(NO_VALUE);
    expect(formatNumber(Number.NaN)).toBe(NO_VALUE);
    expect(currency(0)).toBe("$0.00");
    expect(percent(0)).toBe("0.0%");
  });

  it("empty and NaN-cash books paint finite zeros", () => {
    const snap = buildSnapshot(
      portfolio({ id: "p1", name: "Empty", cash_balance: 0 }),
      [],
      {},
      {}
    );
    expect(snap.totals.currentValue).toBe(0);
    expect(snap.totals.roiPct).toBe(0);
    assertFiniteTree(snap.totals);
    assertCleanDisplay(snapshotPanelCopy(snap));

    const overview = buildOverview(
      [portfolio({ id: "p1", name: "Empty", cash_balance: Number.NaN })],
      [],
      {}
    );
    expect(overview.totals.cash).toBe(0);
    expect(overview.totals.roiPct).toBe(0);
    expect(overviewPanelCopy(overview)).toContain("$0");
    assertCleanDisplay(overviewPanelCopy(overview));
  });

  it("does not emit Infinity ROI on a $0 cost basis", () => {
    const rows = enrichHoldings(
      [
        holding({
          id: "h1",
          portfolio_id: "p1",
          ticker: "GIFT",
          shares: 10,
          buy_price: 0,
        }),
      ],
      { GIFT: quote("GIFT", 5) },
      0
    );
    expect(rows[0]!.buyValue).toBe(0);
    expect(rows[0]!.roiPct).toBe(0);
    expect(percent(rows[0]!.roiPct)).toBe("0.0%");

    const snap = buildSnapshot(
      portfolio({ id: "p1", name: "Gift", cash_balance: 0 }),
      [
        holding({
          id: "h1",
          portfolio_id: "p1",
          ticker: "AAA",
          shares: 10,
          buy_price: 0,
        }),
      ],
      { AAA: quote("AAA", Number.POSITIVE_INFINITY) },
      {}
    );
    assertFiniteTree(snap.totals);
    assertCleanDisplay(snapshotPanelCopy(snap));
  });

  it("keeps covered-call tiles as dashes when spot is $0", () => {
    const rows = buildCoveredCallRows(
      [
        holding({
          id: "h1",
          portfolio_id: "p1",
          ticker: "AAA",
          shares: 50,
          buy_price: 0,
        }),
      ],
      { AAA: quote("AAA", 0) },
      { AAA: null }
    );
    expect(rows[0]!.targetDistance).toBeNull();
    expect(rows[0]!.nextStrike).toBeNull();
    assertCleanDisplay([
      currency(rows[0]!.spot),
      NO_VALUE,
    ]);
  });

  it("formats overview and forecast panels without poison on a gifted $0 book", () => {
    const overview = buildOverview(
      [portfolio({ id: "p1", name: "Empty", cash_balance: 0 })],
      [
        holding({
          id: "h1",
          portfolio_id: "p1",
          ticker: "GIFT",
          shares: 1,
          buy_price: 0,
        }),
      ],
      { GIFT: quote("GIFT", 0, { changePercent: Number.NaN }) }
    );
    expect(overview.totals.roiPct).toBe(0);
    assertCleanDisplay(overviewPanelCopy(overview));

    const model = buildForecast(
      [
        holding({
          id: "h1",
          portfolio_id: "p1",
          ticker: "GIFT",
          shares: 10,
          buy_price: 0,
        }),
      ],
      { GIFT: quote("GIFT", 0) },
      0
    );
    expect(model.currentTotal).toBe(0);
    expect(model.gainPct).toBeNull();
    assertCleanDisplay([
      currency(model.currentTotal),
      NO_VALUE,
      ...Object.values(model.eoyTotals).map((v) => currency(v)),
    ]);
  });

  it("money helpers and compound stay finite", () => {
    expect(safeDiv(1, 0)).toBe(0);
    expect(finiteNumber(Number.NaN)).toBe(0);
    expect(mean([Number.NaN, Number.POSITIVE_INFINITY])).toBe(0);
    expect(cagr(0, 200, 5)).toBeNull();
    expect(roundMoney(Number.POSITIVE_INFINITY)).toBe(0);
    expect(todayDollarFor(100, -1)).toEqual({ dollar: 0, pct: -1 });
    expect(concentrationRead([]).effectivePositions).toBe(0);
    expect(themeBreakdown([])).toEqual([]);

    const zero = calculateCompound(
      compound({ principal: 0, ratePercent: Number.NaN })
    );
    expect(Number.isFinite(zero.futureValue)).toBe(true);
    assertCleanDisplay([
      currency(zero.futureValue),
      percent(zero.allTimeRoR),
      Number.isFinite(zero.doubleYears)
        ? `${zero.doubleYears}y ${zero.doubleMonths}m`
        : NO_VALUE,
    ]);
    expect(Number.isFinite(effectiveAnnualRate(-0.05, "monthly"))).toBe(true);
    const huge = calculateCompound(
      compound({
        principal: 1e308,
        ratePercent: 1e9,
        compound: "continuous",
        years: 80,
        contributionMode: "deposits",
        depositAmount: 1e308,
      })
    );
    expect(huge.futureValue).toBeLessThanOrEqual(MAX_SAFE_MONEY);
  });

  it("drops API rows whose cash is not a real number", () => {
    expect(
      parsePortfolio({
        id: "p1",
        name: "Empty",
        slug: "e",
        sort_order: 0,
        cash_balance: Number.NaN,
      })
    ).toBeNull();
  });
});

describe("production cash paths stay on the atomic helpers", () => {
  it("holdings writes go through applyTradeCashDelta", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/api/holdings/route.ts"),
      "utf8"
    );
    expect(src).toMatch(/applyTradeCashDelta/);
    expect(src).not.toMatch(/applyPortfolioCashDelta/);
  });

  it("CashModal carries a sign toggle, since a phone pad has no minus key", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/CashModal.tsx"),
      "utf8"
    );
    expect(src).toMatch(/Segmented/);
    expect(src).toMatch(/Money borrowed/);
    expect(src).not.toMatch(/allowNegative/);
    expect(src).not.toMatch(/below zero/);
  });
});

describe("salePriceFor", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("falls back to the cost when no live quote is available", async () => {
    const { fetchQuotesWithFallback } = await import("@/lib/market/quotes");
    vi.mocked(fetchQuotesWithFallback).mockResolvedValue({
      quotes: {},
      sources: {},
    } as never);
    expect(await salePriceFor("AAPL", 160.125)).toBe(160.13);
  });
});
