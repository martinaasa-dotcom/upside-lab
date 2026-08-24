/**
 * The seasonality card tells a reader whether to put money in this month,
 * and its own copy says three times over that it is looking at prior years
 * only. It has to actually be doing that.
 */
import { describe, expect, it } from "vitest";
import {
  buildActionSignals,
  computeCycleMonthlyReturns,
  type DailyBar,
} from "@/lib/market/seasonality";

/** Every trading day of one month, moving `pct` in total, open to close. */
function month(ym: string, days: number, pct: number): DailyBar[] {
  const out: DailyBar[] = [];
  const open = 100;
  const close = 100 * (1 + pct / 100);
  for (let d = 1; d <= days; d++) {
    const t = (d - 1) / Math.max(1, days - 1);
    const price = open + (close - open) * t;
    out.push({
      date: `${ym}-${String(d).padStart(2, "0")}`,
      open: d === 1 ? open : price,
      high: price,
      low: price,
      close: price,
    });
  }
  return out;
}

// 2014, 2018, 2022 and 2026 all sit in the same slot of the four-year
// cycle (year % 4 === 2, the midterm).
const AUGUSTS = [
  ...month("2014-08", 21, 10),
  ...month("2018-08", 21, 10),
  ...month("2022-08", 21, 10),
];
/** The month the reader is standing in, three weeks through and flat. */
const IN_PROGRESS = month("2026-08", 15, 0);

describe("the month in progress", () => {
  it("is not counted as a finished one", () => {
    const rows = computeCycleMonthlyReturns(
      [...AUGUSTS, ...IN_PROGRESS],
      "midterm",
      { inProgress: "2026-08" }
    );
    const august = rows[7]!;
    expect(august.samples).toBe(3);
    expect(august.avgMonthReturnPct).toBeCloseTo(10, 1);
    expect(august.winRate).toBe(100);
    expect(august.history.map((h) => h.year)).toEqual([2014, 2018, 2022]);
  });

  it("was dragging the answer down before that", () => {
    // What the card used to show: a flat half-month counted as a whole
    // August, so a 10% month averaged 7.5 and the win rate fell to 75.
    const rows = computeCycleMonthlyReturns(
      [...AUGUSTS, ...IN_PROGRESS],
      "midterm"
    );
    const august = rows[7]!;
    expect(august.samples).toBe(4);
    expect(august.avgMonthReturnPct).toBeCloseTo(7.5, 1);
    expect(august.winRate).toBe(75);
  });

  it("keeps a month of the same year that has finished", () => {
    const rows = computeCycleMonthlyReturns(
      [...month("2026-01", 20, 4), ...IN_PROGRESS],
      "midterm",
      { inProgress: "2026-08" }
    );
    // January 2026 is over, so it is a real January however recent it is.
    expect(rows[0]!.samples).toBe(1);
    expect(rows[7]!.samples).toBe(0);
  });

  it("only ever looks at years in the same slot of the cycle", () => {
    const rows = computeCycleMonthlyReturns(
      [...AUGUSTS, ...month("2023-08", 21, -30)],
      "midterm",
      { inProgress: "2026-08" }
    );
    // 2023 is a pre-election year, so its collapse is somebody else's data.
    expect(rows[7]!.samples).toBe(3);
    expect(rows[7]!.avgMonthReturnPct).toBeCloseTo(10, 1);
  });
});

describe("what the card says off the back of it", () => {
  const rows = (pct: number, winRate: number, samples: number) =>
    Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      label: "Aug",
      avgMonthReturnPct: i === 7 ? pct : 0,
      winRate: i === 7 ? winRate : 0,
      samples: i === 7 ? samples : 0,
      history: [],
    }));

  it("says nothing at all when it has no prior years to look at", () => {
    expect(buildActionSignals({ cycleMonthly: rows(0, 0, 0), asOfMonth: 8 })).toEqual(
      []
    );
  });

  it("calls a strong month strong", () => {
    const [signal] = buildActionSignals({
      cycleMonthly: rows(4, 80, 6),
      asOfMonth: 8,
    });
    expect(signal!.stance).toBe("deploy");
    expect(signal!.samples).toBe(6);
  });

  it("calls a soft month soft", () => {
    const [signal] = buildActionSignals({
      cycleMonthly: rows(-2, 30, 6),
      asOfMonth: 8,
    });
    expect(signal!.stance).toBe("raise_cash");
  });

  it("holds when the record is mixed", () => {
    const [signal] = buildActionSignals({
      cycleMonthly: rows(0.5, 50, 6),
      asOfMonth: 8,
    });
    expect(signal!.stance).toBe("hold");
  });
});
