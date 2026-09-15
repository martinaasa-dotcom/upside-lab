import { describe, expect, it } from "vitest";
import {
  MAX_CAGR,
  MIN_CAGR,
  SECTOR_GROWTH,
  TICKER_GROWTH,
  forecastThemeForTicker,
  growthAnchorFor,
  growthTerminalPrice,
  growthYears,
  normalizeGrowthTicker,
  type ForecastTheme,
} from "@/lib/forecast-growth";

const THEMES: ForecastTheme[] = [
  "ai_infra",
  "ai_power",
  "crypto",
  "space",
  "semi",
  "fintech",
  "software",
  "healthcare",
  "drones",
  "index",
  "other",
];

/*
 * These assumptions are the most consequential numbers in the product: the
 * figure on a forecast card is almost entirely whichever of them applies.
 * So every entry is checked for the things that make it arguable rather
 * than merely present, and the suite is the review gate for an edit.
 */
describe("every growth entry is one somebody could argue with", () => {
  const entries = [
    ...THEMES.map((t) => [`sector:${t}`, SECTOR_GROWTH[t]] as const),
    ...Object.entries(TICKER_GROWTH).map(
      ([t, e]) => [`ticker:${t}`, e] as const
    ),
  ];

  it.each(entries)("%s carries a real reason", (_name, entry) => {
    expect(entry.because.trim().length).toBeGreaterThan(40);
    // A rate with a slogan behind it is a rate nobody can check.
    expect(entry.because).not.toMatch(/to the moon|best in class|no.brainer/i);
  });

  it.each(entries)("%s says when a person last checked it", (_name, entry) => {
    expect(entry.validated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const age = Date.now() - Date.parse(entry.validated);
    // A year. These are five year assumptions, not a running commentary,
    // but one nobody has looked at since the last cycle is not a view.
    expect(age).toBeLessThan(370 * 24 * 60 * 60 * 1000);
  });

  it.each(entries)("%s sits inside the sanity band", (_name, entry) => {
    expect(entry.cagr).toBeGreaterThanOrEqual(MIN_CAGR);
    expect(entry.cagr).toBeLessThanOrEqual(MAX_CAGR);
  });

  it.each(entries)("%s has no dash used as a clause break", (_name, entry) => {
    expect(entry.because).not.toMatch(/[—–]/);
  });
});

describe("the sector ladder", () => {
  it("assumes the market for a company it cannot place", () => {
    // An unrecognised company is one this app knows least about, so the
    // honest assumption is that it does what the market does.
    expect(SECTOR_GROWTH.other.cagr).toBeCloseTo(SECTOR_GROWTH.index.cagr, 10);
  });

  it("puts a fund at the market and nowhere else", () => {
    expect(growthAnchorFor("SPY").cagr).toBeCloseTo(SECTOR_GROWTH.index.cagr, 10);
    expect(growthAnchorFor("VOO").basis).toBe("sector");
  });

  it("orders the ladder by how much is being assumed", () => {
    // Not a claim that these groups beat the market, but the ladder should
    // at least be internally consistent about which ones it leans on.
    expect(SECTOR_GROWTH.ai_infra.cagr).toBeGreaterThan(SECTOR_GROWTH.semi.cagr);
    expect(SECTOR_GROWTH.semi.cagr).toBeGreaterThan(SECTOR_GROWTH.software.cagr);
    expect(SECTOR_GROWTH.software.cagr).toBeGreaterThan(
      SECTOR_GROWTH.healthcare.cagr
    );
    expect(SECTOR_GROWTH.healthcare.cagr).toBeGreaterThan(
      SECTOR_GROWTH.index.cagr
    );
  });
});

describe("the per-name table is a model, not a cheer", () => {
  /*
    The one structural check that keeps this table honest. A list on which
    every entry beats the market is not a set of views, it is a mood, and
    the first question to ask of a new entry is whether you would ever
    write a number under the index here. These are the proof that the
    answer is yes.
  */
  it("holds names below the market, with reasons", () => {
    const market = SECTOR_GROWTH.index.cagr;
    const under = Object.entries(TICKER_GROWTH).filter(
      ([, e]) => e.cagr < market
    );
    expect(under.length).toBeGreaterThanOrEqual(3);
    for (const [, entry] of under) {
      expect(entry.because.trim().length).toBeGreaterThan(40);
    }
  });

  it("does not put every name in a sector at the same rate", () => {
    // If it did, the per-name table would be doing nothing the sector
    // ladder was not already doing.
    const infra = ["NBIS", "SMCI", "DELL"].map((t) => growthAnchorFor(t).cagr);
    expect(new Set(infra).size).toBe(infra.length);
  });

  it("reports which of the two answered", () => {
    expect(growthAnchorFor("NBIS").basis).toBe("ticker");
    // APLD is classified as ai_infra but has no view of its own on file.
    expect(growthAnchorFor("APLD").basis).toBe("sector");
    expect(growthAnchorFor("APLD").cagr).toBeCloseTo(
      SECTOR_GROWTH.ai_infra.cagr,
      10
    );
  });

  it("keeps every named ticker in a sector it is actually classified into", () => {
    // A per-name entry for a ticker the classifier has never heard of is
    // almost always a typo, and it would fall back to `other` in silence.
    for (const ticker of Object.keys(TICKER_GROWTH)) {
      expect(normalizeGrowthTicker(ticker)).toBe(ticker);
      expect(forecastThemeForTicker(ticker)).not.toBe("other");
    }
  });
});

describe("the numbers this was built to produce", () => {
  it("puts NBIS around the figure the model was built around", () => {
    /*
      The brief was explicit: roughly $1,200 by the end of the path at the
      price it was trading around, and higher is fine. This pins the
      arithmetic so a later edit to the rate cannot move it silently.
    */
    const at = growthTerminalPrice("NBIS", 212.19);
    expect(at).toBeGreaterThan(1_100);
    expect(at).toBeLessThan(1_350);
  });

  it("is a rate, so the figure tracks the price it starts from", () => {
    expect(growthTerminalPrice("NBIS", 400)).toBeCloseTo(
      growthTerminalPrice("NBIS", 200) * 2,
      1
    );
  });

  it("compounds the rate over exactly the path's own years", () => {
    const anchor = growthAnchorFor("NVDA");
    expect(anchor.terminalMultiple).toBeCloseTo(
      Math.pow(1 + anchor.cagr, growthYears()),
      10
    );
  });

  it("gives the same answer every time it is asked", () => {
    const once = growthAnchorFor("NBIS");
    const twice = growthAnchorFor("nbis.us");
    expect(twice.cagr).toBe(once.cagr);
    expect(twice.terminalMultiple).toBe(once.terminalMultiple);
  });
});
