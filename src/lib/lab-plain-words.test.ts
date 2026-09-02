import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { allocationBySector } from "@/lib/allocation";
import { SCENARIO_MAINTENANCE_RATE, SHOCKS } from "@/lib/book-shock";
import { MAINTENANCE_RATE } from "@/lib/margin-health";
import { buildActionSignals } from "@/lib/market/seasonality";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const lab = read("src/components/LabSheet.tsx");
const scenario = read("src/components/ScenarioSimulator.tsx");
const seasonality = read("src/components/SeasonalityPage.tsx");
const trends = read("src/components/TrendsPanel.tsx");
const shock = read("src/lib/book-shock.ts");

describe("Lab says what it means", () => {
  it("keeps the desk words off the screens", () => {
    /*
     * These are the words a grandma does not have: a holding was called a
     * position, a company a name, a trading day a session, a fund a
     * benchmark, and one year of the election cycle a cycle phase.
     */
    const reader = [lab, scenario, seasonality, trends]
      .join("\n")
      .split("\n")
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
      .join("\n");
    expect(reader).not.toMatch(/>\s*Every position|positions"|"position"/);
    expect(reader).not.toMatch(/Largest position|Your only position/);
    expect(reader).not.toMatch(/No equity to allocate/);
    expect(reader).not.toMatch(/cycle phase|prior sessions|session return/i);
    expect(reader).not.toMatch(/Benchmark/);
    expect(reader).not.toMatch(/index-broad/);
  });

  it("gives every Lab tab a sentence about the reader's own figures", () => {
    for (const tab of ["alloc:", "risk:", "trends:", "seasonality:"]) {
      expect(lab).toContain(tab);
    }
    expect(lab).toMatch(/const tabIntro: Record<LabTab, string>/);
    expect(lab).toMatch(/\{tabIntro\[tab\]\}/);
    // Each of the three portfolio tabs quotes a figure worked out here.
    expect(lab).toMatch(/topThree\}% of your stocks/);
    expect(lab).toMatch(/topWeight\}% of your stocks/);
    expect(lab).toMatch(/risingCount\} of your \$\{holdingCount\}/);
  });

  it("labels an unsorted holding in words", () => {
    const slices = allocationBySector([
      { ticker: "ZZZZ", currentValue: 100 },
    ]);
    expect(slices[0]!.label).toBe("Not sorted yet");
  });
});

describe("a scenario names the floor it assumed", () => {
  it("prints the broker floor beside the cushion", () => {
    expect(scenario).toMatch(/SCENARIO_MAINTENANCE_RATE/);
    expect(scenario).toMatch(/room before a forced sale/);
    expect(scenario).toMatch(/25% to 30%/);
  });

  it("keeps the two rooms' floors apart on purpose", () => {
    /*
     * The Cash card on Home plans against a stricter half, because it is a
     * standing warning about a real loan. This is a what-if about one bad
     * day, so it uses the ordinary 30%. They agree by each naming its own.
     */
    expect(SCENARIO_MAINTENANCE_RATE).toBe(0.3);
    expect(MAINTENANCE_RATE).toBe(0.5);
    expect(shock).toMatch(/margin-health/);
  });

  it("carries no copy nothing renders", () => {
    /*
     * `tagline`, `tacticalAction`, `statusBlurb` and `tacticalNotes` were all
     * written, none were ever drawn, and one of them told the reader to
     * "keep the debt in check", which is an order this app does not give.
     */
    expect(shock).not.toMatch(/tagline:/);
    expect(shock).not.toMatch(/tacticalAction:/);
    expect(shock).not.toMatch(/statusBlurb/);
    expect(shock).not.toMatch(/tacticalNotes/);
    expect(shock).not.toMatch(/Keep the debt in check/);
    for (const s of SHOCKS) {
      expect(s.mechanism.length).toBeGreaterThan(10);
    }
  });

  it("labels the headline percentage as the group that gets hit hardest", () => {
    expect(scenario).toMatch(/Move assumed for the group hit hardest/);
    expect(scenario).not.toMatch(/Headline move/);
  });
});

describe("seasonality speaks in months, not abbreviations", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    label: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i]!,
    avgMonthReturnPct: i === 7 ? 2.4 : -1.2,
    winRate: i === 7 ? 70 : 40,
    samples: 6,
    history: [],
  }));

  it("spells the month out and describes the cycle", () => {
    const strong = buildActionSignals({ cycleMonthly: rows, asOfMonth: 8 })[0]!;
    expect(strong.headline).toContain("August");
    expect(strong.headline).not.toMatch(/\bAug\b/);
    expect(strong.detail).toContain("earlier Augusts");
    expect(strong.detail).toContain("four-year US election cycle");
    expect(strong.detail).not.toMatch(/presidential-cycle/);

    const soft = buildActionSignals({ cycleMonthly: rows, asOfMonth: 1 })[0]!;
    expect(soft.headline).toContain("January");
    expect(soft.headline).toContain("years like this one");
  });

  it("does not claim a norm from a handful of years", () => {
    expect(seasonality).toMatch(/What this month has done before/);
    expect(seasonality).not.toMatch(/What this month usually does/);
  });

  it("says what each ticker in the list is", () => {
    expect(seasonality).toMatch(/S&P 500 fund \(SPY\)/);
    expect(seasonality).toMatch(/Smaller US companies \(IWM\)/);
    expect(seasonality).toMatch(/Look at/);
  });
});

describe("a trend card explains its own news", () => {
  it("never says RSI, a higher high, or a week as one letter", () => {
    expect(trends).not.toMatch(/RSI went/);
    expect(trends).not.toMatch(/higher high|lower low/);
    expect(trends).not.toMatch(/weeksAgo\}w ago/);
    expect(trends).toMatch(/how hard it\n?\s*was moving/);
  });
});
