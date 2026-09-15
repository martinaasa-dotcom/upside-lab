import { describe, expect, it } from "vitest";
import { FORECAST_YEARS, resolveTickerForecastPath } from "@/lib/forecast";
import {
  blendedExpectedAnnualReturn,
  impliedAnnualReturnForTicker,
} from "@/lib/forecast-conviction";
import { growthAnchorFor, TICKER_GROWTH } from "@/lib/forecast-growth";
import { forecastPathProvenance } from "@/lib/provenance";
import {
  PORTFOLIO_RATE_CEILING_PCT,
  portfolioRealReturnPct,
} from "@/lib/retirement/returns";

/*
 * ONE RATE PER NAME, READ BY EVERY SURFACE THAT DRAWS OR EXPLAINS IT.
 *
 * Adding the per-name growth table created a second answer to "how fast
 * does this app assume this name compounds", and three callers were left
 * reading the first one. None of them failed, none of them looked wrong,
 * and every one of them put a different number in front of a reader for
 * the same company.
 *
 * These are the guards. Each was checked by restoring the real fault and
 * watching the case fail.
 */

const NAMES = ["NBIS", "NVDA", "INTC", "PFE", "SPY", "APLD"];

describe("the rate a surface draws and the rate it explains", () => {
  it.each(NAMES)("%s: the fallback mark states the rate actually drawn", (t) => {
    /*
      `shapeRateLine` read the sector while the drawn path read the name.
      Measured before the fix: INTC drew a path compounding at 6% a year
      under a mark that said 29%, and NBIS drew 41.5% under a mark saying
      37%. A figure whose own explanation contradicts it is the precise
      thing the provenance panel exists to prevent.
    */
    const p = forecastPathProvenance({ ticker: t, spot: 100, fallback: true });
    const step = (p.steps ?? []).find((s) => s.includes("works out at about"));
    expect(step, `no rate line for ${t}`).toBeTruthy();
    const said = Number(step!.match(/about (-?\d+)% a year/)?.[1]);
    expect(said).toBe(Math.round(impliedAnnualReturnForTicker(t) * 100));
  });

  it("says whether the rate is the name's own or its sector's", () => {
    // A reader deciding whether to argue with a figure needs to know
    // whether anybody looked at this company in particular.
    const own = forecastPathProvenance({ ticker: "NBIS", spot: 100, fallback: true });
    expect((own.steps ?? []).join(" ")).toMatch(/for this company on its own/i);

    // APLD is classified ai_infra but carries no view of its own.
    const sector = forecastPathProvenance({ ticker: "APLD", spot: 100, fallback: true });
    expect((sector.steps ?? []).join(" ")).toMatch(/its kind of business/i);
  });

  it("says 'below' rather than 'against' for a rate under the market", () => {
    // The old line only had a branch for at-or-above, so a name this app
    // is cautious about read as though it beat the market.
    const p = forecastPathProvenance({ ticker: "INTC", spot: 100, fallback: true });
    const step = (p.steps ?? []).find((s) => s.includes("works out at about")) ?? "";
    expect(step).toMatch(/below the 10%/i);
  });
});

describe("the rooms agree about one company", () => {
  it.each(NAMES)("%s: the ticker resolver ends where the growth anchor does", (t) => {
    /*
      `resolveTickerForecastPath` feeds StockRoom and `holdingLadders`, so
      a sector-only shape here against a per-name rate in the Growth room
      put two answers in the product for one holding, and the ladder those
      prices anchor drives the price plan and the alerts. Measured off a
      $100 spot before the fix: INTC ended at 357 here and 134 in the
      Growth room.
    */
    const spot = 100;
    const drawn = resolveTickerForecastPath(t, spot);
    expect(drawn.fiveYearPrice).toBeCloseTo(
      spot * growthAnchorFor(t).terminalMultiple,
      1
    );
  });

  it("still lets the reader's own typed price win over the shape", () => {
    const last = FORECAST_YEARS[FORECAST_YEARS.length - 1]!;
    const out = resolveTickerForecastPath("NBIS", 100, {
      NBIS: { [last]: 999 },
    } as never);
    expect(out.fiveYearPrice).toBe(999);
    expect(out.hasOverrides).toBe(true);
  });
});

describe("a five year rate is not a forty year rate", () => {
  /*
    `blendedExpectedAnnualReturn` reads the forecast growth assumptions,
    which describe a specific stretch of years. The retirement module
    compounds whatever it is handed for a lifetime, and applies this blend
    as the OPENING equity assumption for anybody arriving with a
    portfolio. Uncapped, an all-NBIS book reached that page at 37.4% real,
    which over forty years is a multiple in the hundreds of thousands and
    would have told the reader to stop working immediately.
  */
  it("caps what a concentrated portfolio may assume for a lifetime", () => {
    const hot = portfolioRealReturnPct([{ ticker: "NBIS", value: 100_000 }], 0);
    expect(hot).toBeLessThanOrEqual(PORTFOLIO_RATE_CEILING_PCT);
  });

  it("caps an ordinary growth-tilted portfolio too, which is intended", () => {
    const tilted = portfolioRealReturnPct(
      [
        { ticker: "NVDA", value: 20_000 },
        { ticker: "MSFT", value: 30_000 },
        { ticker: "SPY", value: 50_000 },
      ],
      0
    );
    expect(tilted).toBe(PORTFOLIO_RATE_CEILING_PCT);
  });

  it("leaves an index portfolio exactly where it was", () => {
    // The cap must not quietly become the answer for everybody, or it is
    // a house rate wearing a safety rail's clothes.
    const index = portfolioRealReturnPct([{ ticker: "SPY", value: 100_000 }], 0);
    expect(index).toBeLessThan(PORTFOLIO_RATE_CEILING_PCT);
    expect(index).toBeGreaterThan(0);
  });

  it("lets a laggard drag the rate below a plain index book", () => {
    // Proof the blend can point down, which is what makes the per-name
    // table a model rather than a mood.
    const withLaggard = portfolioRealReturnPct(
      [
        { ticker: "SPY", value: 80_000 },
        { ticker: "INTC", value: 20_000 },
      ],
      0
    );
    const plain = portfolioRealReturnPct([{ ticker: "SPY", value: 100_000 }], 0);
    expect(withLaggard).toBeLessThan(plain);
  });

  it("is a ceiling well above anything the sources support", () => {
    // Guards the constant itself: if somebody lowers it to the audited
    // world figure it stops being a rail and becomes the assumption.
    expect(PORTFOLIO_RATE_CEILING_PCT).toBeGreaterThan(7);
    expect(PORTFOLIO_RATE_CEILING_PCT).toBeLessThanOrEqual(12);
  });
});

describe("nothing with a ticker in hand reaches for the sector shaper", () => {
  /*
    `shapedFallbackPath` takes a theme, so every caller that has a ticker
    and uses it has thrown the per-name rate away. That is exactly how the
    rooms came to disagree, and the function is still exported because the
    sector-level primitive is what the per-name one is built on and the
    theme tests need it. So the guard is on the callers rather than the
    export: a surface holding a ticker uses `shapedPathForTicker`.
  */
  const SRC = "src";

  it("has no production caller of shapedFallbackPath", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
        // The file that defines it, and comments naming it, are fine.
        if (full.endsWith(join("lib", "forecast-conviction.ts"))) continue;
        const text = readFileSync(full, "utf8");
        for (const line of text.split("\n")) {
          const code = line.split("//")[0] ?? "";
          if (/\bshapedFallbackPath\s*\(/.test(code)) offenders.push(full);
        }
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });
});

describe("the blend reads the name, not only its sector", () => {
  it("separates two names sitting in the same sector", () => {
    // If this ever collapses back to the sector, every per-name rate in
    // the table stops reaching the Compound tab and the retirement page.
    const a = blendedExpectedAnnualReturn([{ ticker: "NBIS", value: 100 }]);
    const b = blendedExpectedAnnualReturn([{ ticker: "DELL", value: 100 }]);
    expect(a).not.toBeCloseTo(b, 4);
    expect(a).toBeCloseTo(TICKER_GROWTH.NBIS!.cagr, 10);
    expect(b).toBeCloseTo(TICKER_GROWTH.DELL!.cagr, 10);
  });
});
