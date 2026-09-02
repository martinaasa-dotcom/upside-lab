import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { calculateCompound, DEFAULT_COMPOUND_INPUTS } from "@/lib/compound-interest";
import {
  BROAD_MARKET_ANNUAL_PCT,
  buildCompareScenarios,
  buildMilestoneTakeaway,
  buildNarrative,
  buildYearStories,
  findTippingYear,
  storyYears,
} from "@/lib/compound-play";

const INPUTS = {
  ...DEFAULT_COMPOUND_INPUTS,
  principal: 20_000,
  ratePercent: 20,
  ratePeriod: "annual" as const,
  compound: "monthly" as const,
  years: 30,
  months: 0,
  contributionMode: "none" as const,
};

const sheet = readFileSync(
  join(process.cwd(), "src/components/CompoundInterestSheet.tsx"),
  "utf8"
);

/** Every sentence a reader can be shown out of one of these builders. */
function allProse(): string[] {
  const out: string[] = [];
  for (const rate of [4, 10, 20, 35]) {
    for (const mode of ["none", "deposits"] as const) {
      const inputs = {
        ...INPUTS,
        ratePercent: rate,
        contributionMode: mode,
        depositAmount: mode === "none" ? 0 : 500,
      };
      const result = calculateCompound(inputs);
      const tip = findTippingYear(result.yearly);
      out.push(...buildNarrative(result).map((b) => `${b.label}. ${b.body}`));
      out.push(
        ...buildYearStories(result, storyYears(inputs.years), tip).values()
      );
      out.push(...buildCompareScenarios(inputs).map((s) => `${s.label}. ${s.tagline}`));
    }
  }
  return out;
}

describe("the four paths", () => {
  it("draws the reader's own rate and nothing added to it", () => {
    /*
     * The fourth path used to be the reader's rate plus six points a year
     * assumed from selling covered calls, compounded for the whole horizon,
     * under a label that said "your rate". Nothing on screen said so. The
     * check is arithmetic rather than wording: this path must land exactly
     * where a plain compounding of the number in the box lands.
     */
    const scenarios = buildCompareScenarios(INPUTS);
    const yours = scenarios.find((s) => s.id === "upside")!;
    const plain = calculateCompound({ ...INPUTS, ratePercent: 20 });
    expect(yours.result.futureValue).toBeCloseTo(plain.futureValue, 6);
    expect(yours.tagline).toContain("20% a year");
    expect(yours.tagline).toContain("the number in the box");
  });

  it("says whose assumption each of the other three is", () => {
    const scenarios = buildCompareScenarios(INPUTS);
    const byId = Object.fromEntries(scenarios.map((s) => [s.id, s.tagline]));
    expect(byId.mattress).toMatch(/assumption/i);
    expect(byId.cash).toMatch(/assumption, not a quote/i);
    expect(byId.spy).toMatch(/long run average/i);
    expect(byId.spy).toContain(`${BROAD_MARKET_ANNUAL_PCT}%`);
  });
});

describe("growth prose", () => {
  it("writes every figure in the currency it is handed", () => {
    /*
     * The calculator can be switched to euros. These sentences used to build
     * their own dollar formatter, so the heading said one currency and the
     * sentence under it said another about the same pot.
     */
    const result = calculateCompound(INPUTS);
    const euro = (n: number) => `EUR ${Math.round(n)}`;
    const beats = buildNarrative(result, euro);
    expect(beats.some((b) => b.body.includes("EUR "))).toBe(true);
    expect(beats.some((b) => b.body.includes("$"))).toBe(false);

    const stories = [
      ...buildYearStories(result, storyYears(30), null, euro).values(),
    ];
    expect(stories.some((line) => line.includes("EUR "))).toBe(true);
    expect(stories.join(" ")).not.toContain("$");

    const takeaway = buildMilestoneTakeaway(
      [
        { goal: 50_000, hit: true, yearsUntil: 0, targetDate: null, actualDate: null, estGrowthPct: 10, cagrPct: null },
        { goal: 100_000, hit: false, yearsUntil: 4.2, targetDate: null, actualDate: null, estGrowthPct: 10, cagrPct: null },
      ],
      euro
    );
    expect(takeaway).toContain("EUR ");
  });

  it("never tells the reader to sit still, and keeps the slang out", () => {
    const prose = allProse().join("\n");
    // Instructions. A projection may not tell anybody what to do.
    expect(prose).not.toMatch(/stay the course|patience is|reason to quit|hold on/i);
    // Desk words and the AI tells the repo scans for.
    expect(prose).not.toMatch(/s-curve|free lunch|unlocked|bragging|pullback|breather|scoreboard/i);
    // Abbreviations nobody says out loud.
    expect(prose).not.toMatch(/\d+y \d+m|~|≈|→| vs /);
    // A prices-in-dollars aside written for one country's rents and flights.
    expect(prose).not.toMatch(/months of rent|round-trip flights|down payments/i);
  });

  it("keeps a projection in the conditional, never the past tense", () => {
    const prose = allProse().join("\n");
    expect(prose).not.toMatch(/came from|earned its keep|money the market made/i);
  });
});

describe("the rate the page opens on", () => {
  it("is the broad market average, not what this mix has usually done", () => {
    /*
     * A theme-heavy portfolio blends to about 30% a year. Opening on that
     * compounds the most flattering number this page can produce for up to
     * fifty years for a reader who changes nothing.
     */
    expect(BROAD_MARKET_ANNUAL_PCT).toBe(10);
    expect(DEFAULT_COMPOUND_INPUTS.ratePercent).toBe(BROAD_MARKET_ANNUAL_PCT);
    // Nothing may write the blended rate into the box behind the reader.
    expect(sheet).not.toMatch(/ratePercent: portfolioExpectedRatePct/);
    expect(sheet).toMatch(/applyRatePreset/);
  });

  it("names every preset and prints the caveat beside the field", () => {
    expect(sheet).toMatch(/What this mix has usually done/);
    expect(sheet).toMatch(/function rateCaveat/);
    expect(sheet).toMatch(/\{rateCaveat\(ratePreset, portfolioExpectedRatePct\)\}/);
  });
});

describe("the teaching chart", () => {
  it("draws itself along its own stroke and stands down for reduced motion", () => {
    const chart = sheet.slice(
      sheet.indexOf("function GrowthPathChart"),
      sheet.indexOf("export const CompoundInterestSheet")
    );
    expect(chart).toMatch(/strokeDashoffset/);
    expect(chart).toMatch(/prefers-reduced-motion: reduce/);
    // A transform would move the drawing rather than draw it.
    expect(chart).not.toMatch(/transform:/);
    // One sentence, read off whichever year the reader is on.
    expect(chart).toMatch(/you would have put in/);
    expect(chart).toMatch(/aria-valuetext=\{readout\}/);
  });

  it("sits above the fold, not inside the deferred half of the room", () => {
    const heroEnd = sheet.indexOf("<GrowthPathChart");
    const deferred = sheet.indexOf("<BelowFold");
    expect(heroEnd).toBeGreaterThan(0);
    expect(heroEnd).toBeLessThan(deferred);
  });
});
