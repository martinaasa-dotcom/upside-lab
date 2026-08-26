import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FORECAST_YEARS, buildForecast } from "@/lib/forecast";
import type { Holding } from "@/lib/types";

const PANEL = readFileSync(
  join(process.cwd(), "src/components/ForecastPanel.tsx"),
  "utf8"
);

const holding: Holding = {
  id: "1",
  portfolio_id: "p",
  ticker: "CRWV",
  shares: 1500,
  buy_price: 83.27,
  eoy_target: null,
  target_call_pct: 0,
  stock_target_override: null,
  sort_order: 0,
};

/*
 * The phone used to drop the last forecast year so a two-column grid would
 * divide evenly, while the percentage in the card's own corner was measured
 * to that dropped year. A card that cannot add up to its own headline is the
 * regression this file exists to stop, and it came back as one line:
 *
 *   const mobileYears = yearCols.filter((y) => y !== 2030);
 *
 * A hardcoded year is the tell, so that is what is asserted, not today's
 * markup. The years are a range that moves; a layout that only fits four of
 * them is a layout problem, never a reason to show three quarters of a
 * forecast.
 */
describe("the phone shows every forecast year", () => {
  it("keeps no second, narrower list of years", () => {
    expect(PANEL).not.toMatch(/mobileYears/);
    expect(PANEL).not.toMatch(/years\s*\.filter\(/);
    expect(PANEL).not.toMatch(/yearCols\s*\.filter\(/);
    expect(PANEL).not.toMatch(/yearCols\s*\.slice\(/);
  });

  it("names no forecast year as a literal in the layout", () => {
    for (const year of FORECAST_YEARS) {
      expect(
        PANEL.includes(`!== ${year}`) || PANEL.includes(`=== ${year}`)
      ).toBe(false);
    }
  });

  it("hands the phone the same list the table gets", () => {
    const mobile = PANEL.slice(
      PANEL.indexOf("{/* Mobile */}"),
      PANEL.indexOf("{/* Desktop */}")
    );
    expect(mobile).toMatch(/years=\{yearCols\}/);
    expect(mobile).toMatch(/yearCols\.map\(/);
  });

  it("measures the headline against the year the card ends on", () => {
    const last = FORECAST_YEARS[FORECAST_YEARS.length - 1];
    const quotes = {
      CRWV: { ticker: "CRWV", price: 100 },
    } as unknown as Parameters<typeof buildForecast>[1];
    const model = buildForecast([holding], quotes, 0, {
      CRWV: Object.fromEntries(
        FORECAST_YEARS.map((y, i) => [y, 100 + (i + 1) * 50])
      ),
    });
    const row = model.rows[0]!;
    // Every year carries a price, and the corner percentage is the last of
    // them against today. Both have to be true of the same year.
    for (const y of FORECAST_YEARS) expect(row.eoyPrices[y]).toBeGreaterThan(0);
    expect(row.gainPct).toBeCloseTo((row.eoyPrices[last] - 100) / 100, 10);
  });
});
