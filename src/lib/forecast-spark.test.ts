import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SPARK_MIN_SPAN,
  sharedSparkBounds,
  sparkGeometry,
  sparkSeries,
  sparkY,
  type SparkBox,
} from "@/lib/forecast-spark";

const BOX: SparkBox = {
  width: 240,
  height: 56,
  padL: 2,
  padR: 8,
  padT: 6,
  padB: 6,
};

/**
 * The nine cards a reader actually had on screen when they said every path
 * looked the same. Two of them end near +84%, three near +257%. On a
 * per-card scale all nine drew an identical rise, which is what made the
 * grid read as a promise instead of a comparison.
 */
const GRID = [
  [474.47, 1692.36], // AMD, +257%
  [66.45, 202.92], // RKLB, +205%
  [340.26, 814.34], // GOOGL, +139%
  [832.57, 1532.09], // a broad fund, +84%
  [156.66, 288.94], // RDDT, +84%
];

describe("forecast sparks share one axis", () => {
  it("turns prices into fractions from today", () => {
    expect(sparkSeries([100, 150, 200])).toEqual([0, 0.5, 1]);
  });

  it("refuses a path with nothing to draw", () => {
    expect(sparkSeries([100])).toBeNull();
    expect(sparkSeries([])).toBeNull();
    expect(sparkSeries([0, 0])).toBeNull();
    expect(sparkSeries([Number.NaN, 100])).toBeNull();
  });

  it("keeps today inside the bounds even when every path only rises", () => {
    const bounds = sharedSparkBounds(
      GRID.map((prices) => sparkSeries(prices)!)
    );
    expect(bounds.min).toBeLessThanOrEqual(0);
    expect(bounds.max).toBeGreaterThan(2.5);
  });

  it("covers a path that dips below today", () => {
    const bounds = sharedSparkBounds([
      [0, -0.3, 0.4],
      [0, 0.1, 0.2],
    ]);
    expect(bounds.min).toBeCloseTo(-0.3, 10);
    expect(bounds.max).toBeCloseTo(0.4, 10);
  });

  it("draws today on the same row on every card", () => {
    const bounds = sharedSparkBounds(
      GRID.map((prices) => sparkSeries(prices)!)
    );
    const rows = GRID.map(
      (prices) => sparkGeometry(sparkSeries(prices)!, bounds, BOX)!.baseY
    );
    for (const row of rows) expect(row).toBeCloseTo(rows[0]!, 10);
  });

  /*
   * The regression itself. A +84% holding and a +257% holding must not end
   * at the same height. Per-card scaling put both on the same pixel, which
   * is how the grid ended up claiming every name triples.
   */
  it("gives a quiet holding a visibly flatter line than a loud one", () => {
    const bounds = sharedSparkBounds(
      GRID.map((prices) => sparkSeries(prices)!)
    );
    const endOf = (prices: number[]) =>
      sparkGeometry(sparkSeries(prices)!, bounds, BOX)!.dotTop;
    const loud = endOf(GRID[0]!);
    const quiet = endOf(GRID[3]!);
    // Lower dotTop is higher on the card.
    expect(loud).toBeLessThan(quiet);
    // Not a hairline apart: the difference has to be legible at 56px.
    expect(quiet - loud).toBeGreaterThan(15);
  });

  it("puts the biggest mover at the top of the box and nobody above it", () => {
    const series = GRID.map((prices) => sparkSeries(prices)!);
    const bounds = sharedSparkBounds(series);
    const tops = series.map(
      (one) => sparkGeometry(one, bounds, BOX)!.dotTop
    );
    expect(Math.min(...tops)).toBeCloseTo(
      (sparkY(bounds.max, bounds, BOX) / BOX.height) * 100,
      6
    );
  });

  it("survives a portfolio where nothing moves", () => {
    const bounds = sharedSparkBounds([[0, 0, 0]]);
    expect(bounds.max - bounds.min).toBeCloseTo(SPARK_MIN_SPAN, 10);
    const geo = sparkGeometry([0, 0, 0], bounds, BOX)!;
    expect(geo.line).not.toMatch(/NaN/);
    expect(geo.baseY).toBeCloseTo(BOX.height / 2, 6);
  });

  it("survives bounds with no span at all", () => {
    expect(sparkY(0, { min: 0, max: 0 }, BOX)).toBeCloseTo(BOX.height / 2, 6);
  });
});

describe("the panel puts the reason on the holding, not a mini chart", () => {
  const PANEL = readFileSync(
    join(process.cwd(), "src/components/ForecastPanel.tsx"),
    "utf8"
  );

  it("keeps the portfolio chart and drops the per-ticker spark", () => {
    expect(PANEL).toMatch(/SheetPathChart/);
    expect(PANEL).not.toMatch(/TickerSpark/);
    expect(PANEL).not.toMatch(/sharedSparkBounds/);
  });

  it("puts the reason on the card, not only in a list below the grid", () => {
    expect(PANEL).toMatch(/why=\{/);
    expect(PANEL).not.toMatch(/Why each number/);
  });
});
