import { describe, expect, it } from "vitest";
import { buildOverview } from "@/lib/overview";
import type { Holding, Portfolio, Quote } from "@/lib/types";

/*
  The percent and the dollars beside it are one statement.

  `todayDollarFor` backs out yesterday's close before measuring a move, and
  the comment above it records why: multiplying today's value by today's
  percent understates the move by exactly that percent. The percent printed
  next to that figure did not do the same thing. It averaged each name's
  percent weighted by that name's value *after* the move, which is the prior
  value times (1 + pct), so every gainer was weighted up by its own gain and
  every faller weighted down by its own fall.

  The bias is always upward and it is worst on the days a reader looks
  hardest, because that is when the moves are large. Two names of equal size
  yesterday, one up 50% and one down 50%, is a flat day in dollars and read
  as a gain.
*/

function portfolio(id: string): Portfolio {
  return { id, name: id, cash_balance: 0 } as Portfolio;
}

function holding(portfolioId: string, ticker: string, shares: number): Holding {
  return {
    id: `${portfolioId}-${ticker}`,
    portfolio_id: portfolioId,
    ticker,
    shares,
    buy_price: 100,
  } as Holding;
}

function quote(price: number, changePercent: number): Quote {
  return { price, changePercent, sparkline: [] } as unknown as Quote;
}

describe("today's percent agrees with today's dollars", () => {
  it("reads a genuinely flat day as flat, not as a gain", () => {
    /*
      Both names were worth $1,000 at yesterday's close. One doubled to
      $1,500, the other halved to $500. Nothing was made or lost.
    */
    const model = buildOverview(
      [portfolio("p1")],
      [holding("p1", "UP", 1), holding("p1", "DOWN", 1)],
      { UP: quote(1500, 0.5), DOWN: quote(500, -0.5) }
    );
    expect(model.totals.todayDollar).toBeCloseTo(0, 6);
    expect(
      model.totals.todayPct ?? 0,
      `A day that made nothing was reported as a gain, because the percent ` +
        `was averaged over each name's value after its own move.`
    ).toBeCloseTo(0, 6);
  });

  it("keeps the two figures consistent on an ordinary mixed day", () => {
    const model = buildOverview(
      [portfolio("p1")],
      [holding("p1", "A", 1), holding("p1", "B", 1), holding("p1", "C", 1)],
      { A: quote(110, 0.1), B: quote(198, -0.01), C: quote(50, 0.25) }
    );
    const prior = model.totals.equityValue - model.totals.todayDollar;
    expect(model.totals.todayPct ?? 0).toBeCloseTo(
      model.totals.todayDollar / prior,
      9
    );
  });

  it("leaves a name with no quote out of both halves", () => {
    const model = buildOverview(
      [portfolio("p1")],
      [holding("p1", "A", 1), holding("p1", "NOQUOTE", 1)],
      { A: quote(110, 0.1) }
    );
    // 10 dollars on a prior 100, the unpriced name absent from both.
    expect(model.totals.todayPct ?? 0).toBeCloseTo(0.1, 9);
  });

  it("says nothing rather than zero when no name reported", () => {
    const model = buildOverview([portfolio("p1")], [holding("p1", "A", 1)], {});
    expect(model.totals.todayPct).toBeNull();
  });

  it("holds for one portfolio's own figure too", () => {
    const model = buildOverview(
      [portfolio("p1")],
      [holding("p1", "UP", 1), holding("p1", "DOWN", 1)],
      { UP: quote(1500, 0.5), DOWN: quote(500, -0.5) }
    );
    expect(model.sheets[0]!.todayPct ?? 0).toBeCloseTo(0, 6);
  });
});
