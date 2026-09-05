/**
 * One `CompanyFacts` builder for the tests, so a new field is added in one
 * place rather than in every fixture that happens to exist.
 *
 * It starts from a company where **every figure is absent**, which is the
 * case worth defaulting to: the rule the whole room rests on is that a
 * missing figure reads as `n/a` rather than as a number, and a fixture
 * that quietly fills everything in is a fixture that never exercises it.
 * A test that wants a figure names that figure.
 */
import type { CompanyFacts } from "@/lib/company/facts";

export function makeFacts(over: Partial<CompanyFacts> = {}): CompanyFacts {
  return {
    ticker: "TEST",
    listedSymbol: "TEST",
    name: "Test Company",
    about: null,
    sector: null,
    industry: null,
    country: null,
    employees: null,
    website: null,
    kind: "EQUITY",
    currency: "USD",

    price: null,
    changePercent: null,
    marketCap: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,

    revenue: null,
    revenueGrowth: null,
    grossMargin: null,
    profitMargin: null,
    netIncome: null,
    freeCashFlow: null,
    totalCash: null,
    totalDebt: null,

    trailingPe: null,
    forwardPe: null,
    dividendYield: null,

    epsTrailing: null,
    epsForward: null,
    sharesOutstanding: null,

    epsThisYear: null,
    epsNextYear: null,
    epsGrowthThisYear: null,
    epsGrowthNextYear: null,
    revenueGrowthNextYear: null,

    marketEpsGrowthThisYear: null,
    marketEpsGrowthNextYear: null,
    marketLongTermGrowth: null,

    history: [],
    quarters: [],
    surprises: [],

    operatingMargin: null,
    returnOnEquity: null,
    returnOnAssets: null,
    operatingCashFlow: null,

    expenseRatio: null,
    fundCategory: null,
    fundFamily: null,
    topHoldings: [],
    sectorWeights: [],

    analystCount: null,
    analystTargetMean: null,
    analystTargetHigh: null,
    analystTargetLow: null,

    fetchedAt: "2026-09-05T00:00:00.000Z",
    ...over,
  };
}

/** A perfectly ordinary profitable company, for tests about the happy path. */
export function makeOrdinaryFacts(over: Partial<CompanyFacts> = {}): CompanyFacts {
  return makeFacts({
    about: "It tests things for other companies.",
    sector: "Technology",
    industry: "Software",
    country: "United States",
    employees: 100,
    price: 100,
    changePercent: 0.01,
    marketCap: 1_000_000_000,
    fiftyTwoWeekHigh: 120,
    fiftyTwoWeekLow: 80,
    revenue: 500_000_000,
    revenueGrowth: 0.2,
    grossMargin: 0.6,
    profitMargin: 0.1,
    netIncome: 50_000_000,
    freeCashFlow: 40_000_000,
    totalCash: 200_000_000,
    totalDebt: 100_000_000,
    trailingPe: 25,
    forwardPe: 20,
    epsTrailing: 4,
    epsForward: 5,
    epsThisYear: 4.5,
    epsNextYear: 5.5,
    epsGrowthThisYear: 0.15,
    epsGrowthNextYear: 0.22,
    revenueGrowthNextYear: 0.18,
    marketEpsGrowthThisYear: 0.1,
    marketEpsGrowthNextYear: 0.12,
    marketLongTermGrowth: 0.12,
    sharesOutstanding: 10_000_000,
    analystCount: 12,
    analystTargetMean: 130,
    analystTargetHigh: 160,
    analystTargetLow: 90,
    ...over,
  });
}
