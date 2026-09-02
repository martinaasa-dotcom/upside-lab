import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  Every one of these was a literal, and a literal here does not fail on the
  first of January. It goes quiet. The panel keeps offering an editable price
  target for a year that has already ended, the model is asked to reason a
  path to a date in the past, `prices[2030]` on a 2027 to 2031 path is
  undefined so Margus loses the forecast from its context, and the five year
  forecast the landing page sells is four years and a receipt. Nothing throws
  and nothing logs.

  So the test moves the clock rather than reading today's list.
*/
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Source with comments removed, since a year in a comment is the record. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

async function yearsOn(iso: string): Promise<readonly number[]> {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
  const { FORECAST_YEARS } = await import("@/lib/forecast");
  return FORECAST_YEARS;
}

describe("the years roll", () => {
  it("covers this year and the next four, whenever it is asked", async () => {
    expect(await yearsOn("2026-09-02T12:00:00Z")).toEqual([
      2026, 2027, 2028, 2029, 2030,
    ]);
    expect(await yearsOn("2027-01-01T00:00:01Z")).toEqual([
      2027, 2028, 2029, 2030, 2031,
    ]);
    expect(await yearsOn("2031-06-30T12:00:00Z")).toEqual([
      2031, 2032, 2033, 2034, 2035,
    ]);
  });

  it("never begins on a year that has already finished", async () => {
    for (const day of [
      "2026-12-31T23:59:59Z",
      "2027-01-01T00:00:00Z",
      "2029-02-28T09:00:00Z",
    ]) {
      const years = await yearsOn(day);
      expect(years[0], day).toBe(new Date(day).getFullYear());
      expect(years, day).toHaveLength(5);
    }
  });
});

describe("nothing reads a year by typing it out", () => {
  const YEAR = /\b20(2[6-9]|3[0-9])\b/;

  it("keeps the plan schema's keys derived, so the model is asked for the right five", () => {
    expect(read("src/lib/forecast-plan-schema.ts")).toContain(
      "FORECAST_YEARS.map"
    );
    // Prompt descriptions count: a description naming 2026-2030 is an
    // instruction to the model, not a note to a reader of the file.
    expect(code("src/lib/forecast-plan-schema.ts")).not.toMatch(YEAR);
  });

  it("keeps the drawer's horizons and the year they read on one list", () => {
    expect(code("src/components/TickerDrawer.tsx")).not.toMatch(YEAR);
    expect(read("src/components/TickerDrawer.tsx")).toContain(
      "FORECAST_YEARS[THREE_YEAR_INDEX]"
    );
  });

  it("keeps the last year Margus is handed derived from the list", () => {
    const advisor = read("src/lib/ai/cc-advisor.ts");
    expect(advisor).toContain(
      "const lastYear = FORECAST_YEARS[FORECAST_YEARS.length - 1]!"
    );
    expect(advisor).not.toContain("row.prices?.[2030]");
  });

  it("says how far the forecast reaches without naming the year", () => {
    // A landing page cannot import the list at build time and stay honest
    // about a statically rendered page, so it says "five years out", which
    // is true every year.
    const landing = read("src/components/SignedOutLanding.tsx");
    const forecastCard = landing.slice(
      landing.indexOf('title: "Forecast"'),
      landing.indexOf('title: "A letter on Sunday"')
    );
    expect(forecastCard).not.toMatch(YEAR);
    expect(forecastCard).toContain("five years out");
  });
});
