import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FIVE_YEAR,
  FORECAST_YEARS,
  THREE_YEAR,
  buildForecast,
} from "@/lib/forecast";
import type { Holding } from "@/lib/types";

const PANEL = readFileSync(
  join(process.cwd(), "src/components/ForecastPanel.tsx"),
  "utf8"
);

/*
 * The drawer is the second place forecast years are drawn, and it was the
 * unguarded copy. It carried "End of 2028" and "End of 2030" as its own
 * constants and then read `eoyPrices[2028]` by literal, so the day the
 * range rolls the heading keeps a year the range no longer has and the
 * price under it is read from a key that is not there. Nothing failed,
 * which is exactly why this file now reads both.
 */
const DRAWER = readFileSync(
  join(process.cwd(), "src/components/TickerDrawer.tsx"),
  "utf8"
);

/** The forecast horizons must come from the range, wherever they are drawn. */
const HORIZON_SOURCES: [string, string][] = [
  ["src/components/ForecastPanel.tsx", PANEL],
  ["src/components/TickerDrawer.tsx", DRAWER],
];

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

  it("writes no forecast year into any screen that draws one", () => {
    for (const [name, src] of HORIZON_SOURCES) {
      for (const year of FORECAST_YEARS) {
        const hits = src
          .split("\n")
          .map((line, i) => [i + 1, line] as const)
          // Comments explain why the literal is banned, so they may say it.
          .filter(([, line]) => {
            const t = line.trim();
            if (t.startsWith("*") || t.startsWith("//") || t.startsWith("/*")) {
              return false;
            }
            return line.includes(String(year));
          })
          .map(([i, line]) => `${name}:${i}: ${line.trim()}`);
        expect(hits).toEqual([]);
      }
    }
  });

  it("takes both drawer horizons from the range", () => {
    expect(DRAWER).toMatch(/THREE_YEAR/);
    expect(DRAWER).toMatch(/FIVE_YEAR/);
    // The 3-year horizon is the third column and the 5-year one the last,
    // so a range of a different length still lines up.
    expect(FORECAST_YEARS[2]).toBe(THREE_YEAR);
    expect(FORECAST_YEARS[FORECAST_YEARS.length - 1]).toBe(FIVE_YEAR);
  });

  it("hands every holding the same year list", () => {
    expect(PANEL).toMatch(/years=\{yearCols\}/);
    expect(PANEL).toMatch(/yearCols\.map\(/);
    expect(PANEL).not.toMatch(/\{\/\* Mobile \*\/\}/);
    expect(PANEL).not.toMatch(/\{\/\* Desktop \*\/\}/);
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
