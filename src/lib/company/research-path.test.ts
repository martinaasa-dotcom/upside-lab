import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FORECAST_YEARS, type ForecastYear } from "@/lib/forecast";
import {
  fillMissingForecastYears,
  forecastThemeForTicker,
  isNearLinearPath,
  reshapeToThemeRhythm,
  shapedFallbackPath,
  type ForecastTheme,
} from "@/lib/forecast-conviction";

/*
 * The research room drew a path nobody wrote.
 *
 * `page-build.ts` re-timed every path it built onto the theme's own
 * curve, with no check for whether the model had already given the path a
 * rhythm. Only the final year survived; each earlier year was moved to
 * wherever the theme put it. What a reader met was a smooth rise under a
 * sentence saying the price slipped in 2027, which is the one thing the
 * provenance mark exists to prevent: a figure stated as the model's that
 * the model did not write.
 *
 * These run the room's own arithmetic rather than the route, because the
 * whole fault was three correct-looking functions composed without the
 * one condition that makes the third of them legitimate.
 */

const SPOT = 226.6;

function pathOf(prices: number[]): Record<ForecastYear, number> {
  return Object.fromEntries(
    FORECAST_YEARS.map((y, i) => [y, prices[i]!])
  ) as Record<ForecastYear, number>;
}

/** Exactly what page-build.ts does, so a change there has to change here. */
function roomPath(
  ticker: string,
  prices: number[],
  spot = SPOT
): number[] {
  const theme = forecastThemeForTicker(ticker);
  const shaped = shapedFallbackPath(spot, theme);
  const filled = fillMissingForecastYears(pathOf(prices), shaped);
  const out =
    isNearLinearPath(filled, spot) && theme !== "index"
      ? reshapeToThemeRhythm(filled, shaped, spot)
      : filled;
  return FORECAST_YEARS.map((y) => out[y]!);
}

describe("the path the research room draws", () => {
  it("keeps a model path that already has a rhythm of its own", () => {
    /*
      The NBIS shape in the bug report, read off the rationale the room
      printed beside it: a rise, a slip when expected earnings turn
      negative, then a recovery. Every year is the model's.
    */
    const given = [300, 260, 340, 380, 430];
    expect(roomPath("NBIS", given)).toEqual(given);
  });

  it("does not flatten a mid-path drop into a smooth rise", () => {
    // The fault in its own terms: the drawn path must still go down
    // somewhere, because the reason printed beside it says it does.
    const out = roomPath("NBIS", [300, 260, 340, 380, 430]);
    const fell = out.some((p, i) => i > 0 && p < out[i - 1]!);
    expect(fell).toBe(true);
  });

  it("keeps the model's own early years rather than the theme's curve", () => {
    /*
      The re-timing is not only a shape change. A theme whose first year
      is a small share of its total move drags an aggressive first year
      down to meet it, so the reader is shown a number well below the one
      the model reasoned. Measured on the ai_infra curve, a model saying
      $420 at the end of this year came out in the $240s.
    */
    const out = roomPath("NBIS", [420, 500, 470, 900, 1200]);
    expect(out[0]).toBe(420);
    expect(out[out.length - 1]).toBe(1200);
  });

  it("still re-times a straight line, and still lands where it was sent", () => {
    // The rule the re-timing exists for is untouched: an even ramp has no
    // timing of its own, so it may borrow the theme's.
    const ramp = [260, 300, 340, 380, 420];
    const out = roomPath("NBIS", ramp);
    expect(out).not.toEqual(ramp);
    expect(out[out.length - 1]).toBe(420);
  });

  it("re-times a straight line down without turning it into a rise", () => {
    const out = roomPath("NBIS", [200, 180, 160, 140, 120]);
    expect(out[out.length - 1]).toBe(120);
    expect(out.every((p) => p < SPOT)).toBe(true);
  });

  it("still fills a year the model skipped", () => {
    const theme = forecastThemeForTicker("NBIS");
    const shaped = shapedFallbackPath(SPOT, theme);
    const partial = { [FORECAST_YEARS[0]!]: 300 } as Partial<
      Record<ForecastYear, number>
    >;
    const filled = fillMissingForecastYears(partial, shaped);
    expect(filled[FORECAST_YEARS[0]!]).toBe(300);
    for (const y of FORECAST_YEARS) expect(filled[y]).toBeGreaterThan(0);
  });
});

describe("the theme rhythms the re-timing borrows", () => {
  /*
    A shape rule whose shape is a smooth ramp does nothing.

    `ai_infra`, `healthcare` and `other` were strictly rising and
    decelerating, so re-timing a straight line onto one produced another
    smooth curve: the anti-straight-line machinery was a no-op for exactly
    the theme NBIS sits in. The file's own comment promised "a quiet year
    in the middle rather than a clean ramp" and four of the eleven entries
    did not have one.
  */
  const RESHAPED_THEMES: ForecastTheme[] = [
    "ai_infra",
    "ai_power",
    "crypto",
    "space",
    "semi",
    "fintech",
    "software",
    "healthcare",
    "drones",
    "other",
  ];

  it.each(RESHAPED_THEMES)("%s has a year that is not up", (theme) => {
    const shaped = shapedFallbackPath(100, theme);
    const seq = [100, ...FORECAST_YEARS.map((y) => shaped[y]!)];
    const fell = seq.some((p, i) => i > 0 && p <= seq[i - 1]!);
    expect(fell).toBe(true);
  });

  it("leaves the index alone, which is the one theme that may be smooth", () => {
    // Never re-timed, and a fund holding five hundred companies has no
    // drama to manufacture.
    const shaped = shapedFallbackPath(100, "index");
    const seq = FORECAST_YEARS.map((y) => shaped[y]!);
    expect(seq.every((p, i) => i === 0 || p > seq[i - 1]!)).toBe(true);
  });
});

describe("the room itself, not this file's copy of it", () => {
  /*
    `roomPath` above mirrors page-build.ts rather than importing it, which
    is what lets the arithmetic be tested without a model, a provider and
    a database behind it. The cost is that the mirror can go on passing
    while the room drifts, and drifting is exactly what happened last
    time: the comment over that code described the gate for months while
    the code had none. So read the source.
  */
  const src = readFileSync("src/lib/company/page-build.ts", "utf8");

  it("gates the re-timing on the straight-line test", () => {
    expect(src).toContain("isNearLinearPath(filled, spot)");
  });

  it("never re-times a path unconditionally", () => {
    const calls = src.match(/reshapeToThemeRhythm\(/g) ?? [];
    expect(calls).toHaveLength(1);
    const at = src.indexOf("reshapeToThemeRhythm(filled");
    expect(at).toBeGreaterThan(-1);
    // The gate has to be the thing that reaches it, on the same statement.
    const before = src.slice(Math.max(0, at - 220), at);
    expect(before).toContain("isNearLinearPath");
  });
});
