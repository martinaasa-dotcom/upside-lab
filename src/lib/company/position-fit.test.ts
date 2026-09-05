import { describe, expect, it } from "vitest";
import {
  SHOCK_FALL,
  concentrationNote,
  fitPresets,
  positionFit,
} from "@/lib/company/position-fit";

/**
 * This is the one card in the room that answers any part of "should I
 * buy", so its arithmetic has to be right in the cases people actually
 * hit: a company they already hold, a portfolio carrying borrowed money,
 * and an empty portfolio where the first holding is all of it.
 */

const HOLDINGS = [
  { ticker: "AAA", value: 6_000 },
  { ticker: "BBB", value: 3_000 },
  { ticker: "CCC", value: 1_000 },
];

describe("what the numbers become", () => {
  it("works out the new share against the new total", () => {
    const fit = positionFit({
      ticker: "DDD",
      amount: 2_500,
      holdings: HOLDINGS,
      cash: 0,
    })!;
    expect(fit.portfolioBefore).toBe(10_000);
    expect(fit.portfolioAfter).toBe(12_500);
    expect(fit.weight).toBeCloseTo(0.2, 6);
    expect(fit.holdingCount).toBe(4);
  });

  it("adds to a company you already hold rather than starting again", () => {
    const fit = positionFit({
      ticker: "AAA",
      amount: 4_000,
      holdings: HOLDINGS,
      cash: 0,
    })!;
    expect(fit.weightBefore).toBeCloseTo(0.6, 6);
    expect(fit.weight).toBeCloseTo(10_000 / 14_000, 6);
    expect(fit.rank).toBe(1);
    expect(fit.holdingCount).toBe(3);
  });

  it("counts borrowed money against the portfolio, not for it", () => {
    /*
      Negative cash is how this app records a loan from a broker, and a
      share of a portfolio that has one is a bigger share. Reading the
      loan as zero would understate every weight on the card.
    */
    const withLoan = positionFit({
      ticker: "DDD",
      amount: 1_000,
      holdings: HOLDINGS,
      cash: -5_000,
    })!;
    expect(withLoan.portfolioBefore).toBe(5_000);
    expect(withLoan.weight).toBeCloseTo(1_000 / 6_000, 6);
  });

  it("survives a portfolio with nothing in it", () => {
    const fit = positionFit({
      ticker: "DDD",
      amount: 1_000,
      holdings: [],
      cash: 0,
    })!;
    expect(fit.weight).toBeCloseTo(1, 6);
    expect(fit.rank).toBe(1);
    expect(fit.topThreeAfter).toBeCloseTo(1, 6);
  });

  it("prices the shock off the whole position, not just the new money", () => {
    const fit = positionFit({
      ticker: "AAA",
      amount: 4_000,
      holdings: HOLDINGS,
      cash: 0,
    })!;
    expect(fit.shockDollar).toBeCloseTo(10_000 * SHOCK_FALL, 6);
    expect(fit.shockOfPortfolio).toBeCloseTo((10_000 * SHOCK_FALL) / 14_000, 6);
  });

  it("shows the group getting heavier when the company joins one", () => {
    // NVDA and AMD are both in this app's technology list.
    const fit = positionFit({
      ticker: "NVDA",
      amount: 5_000,
      holdings: [
        { ticker: "AMD", value: 5_000 },
        { ticker: "KO", value: 5_000 },
      ],
      cash: 0,
    })!;
    expect(fit.sector).toBeTruthy();
    expect(fit.sectorAfter!).toBeGreaterThan(fit.sectorBefore!);
  });

  it("ignores a holding worth nothing rather than dividing by it", () => {
    const fit = positionFit({
      ticker: "DDD",
      amount: 1_000,
      holdings: [{ ticker: "ZZZ", value: 0 }],
      cash: 0,
    })!;
    expect(Number.isFinite(fit.weight)).toBe(true);
    expect(fit.weight).toBeCloseTo(1, 6);
  });

  it("refuses an empty ticker rather than answering about nothing", () => {
    expect(
      positionFit({ ticker: "  ", amount: 100, holdings: [], cash: 0 })
    ).toBeNull();
  });
});

describe("the one observation it is allowed to make", () => {
  it("says nothing about an ordinary size", () => {
    const fit = positionFit({
      ticker: "DDD",
      amount: 500,
      holdings: HOLDINGS,
      cash: 0,
    })!;
    expect(concentrationNote(fit)).toBeNull();
  });

  it("names the size when one company would decide the year", () => {
    const fit = positionFit({
      ticker: "DDD",
      amount: 10_000,
      holdings: HOLDINGS,
      cash: 0,
    })!;
    const note = concentrationNote(fit)!;
    expect(note).toContain("DDD");
    expect(note).toMatch(/\d+%/);
  });

  it("never tells anybody what to do about it", () => {
    const fit = positionFit({
      ticker: "DDD",
      amount: 10_000,
      holdings: HOLDINGS,
      cash: 0,
    })!;
    expect(concentrationNote(fit)).not.toMatch(
      /\b(buy|sell|avoid|should|recommend|too much)\b/i
    );
  });
});

describe("the preset amounts", () => {
  it("scales to the portfolio and stays round", () => {
    const presets = fitPresets(200_000);
    expect(presets.length).toBeGreaterThan(1);
    for (const p of presets) {
      expect(p).toBeGreaterThan(0);
      expect(p % 100).toBe(0);
    }
    expect([...presets].sort((a, b) => a - b)).toEqual(presets);
  });

  it("still offers something for a portfolio with nothing in it", () => {
    expect(fitPresets(0).length).toBeGreaterThan(0);
  });
});
