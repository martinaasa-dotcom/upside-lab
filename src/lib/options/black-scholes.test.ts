import { describe, expect, it } from "vitest";
import {
  callDelta,
  callPrice,
  daysToExpiry,
  expiryInstant,
  impliedVol,
  normCdf,
  yearsToExpiry,
} from "@/lib/options/black-scholes";

describe("the formula", () => {
  it("matches the textbook normal distribution", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normCdf(-1)).toBeCloseTo(0.1587, 3);
  });

  it("reproduces the textbook call (Hull: S=42 K=40 r=10% vol=20% T=0.5)", () => {
    expect(callPrice(42, 40, 0.5, 0.2, 0.1)).toBeCloseTo(4.76, 2);
    expect(callDelta(42, 40, 0.5, 0.2, 0.1)).toBeCloseTo(0.7791, 3);
  });

  it("reads an at-the-money call a few weeks out as a little over even", () => {
    const d = callDelta(100, 100, 21 / 365, 0.3)!;
    expect(d).toBeGreaterThan(0.5);
    expect(d).toBeLessThan(0.56);
  });

  it("moves delta the way the share moves", () => {
    const low = callDelta(90, 100, 0.05, 0.4)!;
    const high = callDelta(110, 100, 0.05, 0.4)!;
    expect(low).toBeLessThan(0.3);
    expect(high).toBeGreaterThan(0.7);
  });

  it("settles to what the contract does at the bell", () => {
    expect(callDelta(101, 100, 0, 0.3)).toBe(1);
    expect(callDelta(99, 100, 0, 0.3)).toBe(0);
    expect(callPrice(105, 100, 0, 0.3)).toBe(5);
  });

  it("refuses nonsense rather than printing a figure", () => {
    expect(callDelta(0, 100, 0.1, 0.3)).toBeNull();
    expect(callDelta(100, -1, 0.1, 0.3)).toBeNull();
    expect(callDelta(100, 100, 0.1, 0)).toBeNull();
  });
});

describe("implied volatility", () => {
  it("round-trips the volatility a price was made from", () => {
    for (const vol of [0.15, 0.35, 0.8, 1.6]) {
      const price = callPrice(100, 110, 30 / 365, vol)!;
      expect(impliedVol(price, 100, 110, 30 / 365)).toBeCloseTo(vol, 3);
    }
  });

  it("refuses a price no volatility explains", () => {
    // Under what exercising it this instant is worth.
    expect(impliedVol(4, 110, 100, 0.1)).toBeNull();
    expect(impliedVol(0, 100, 100, 0.1)).toBeNull();
    expect(impliedVol(150, 100, 100, 0.1)).toBeNull();
  });
});

describe("the bell", () => {
  it("is 16:00 New York in both halves of the year", () => {
    // Summer: EDT, UTC-4.
    expect(expiryInstant("2026-10-16")!.toISOString()).toBe("2026-10-16T20:00:00.000Z");
    // Winter: EST, UTC-5.
    expect(expiryInstant("2026-12-18")!.toISOString()).toBe("2026-12-18T21:00:00.000Z");
  });

  it("counts time to that bell, not to midnight", () => {
    const now = new Date("2026-10-16T14:00:00Z");
    expect(yearsToExpiry("2026-10-16", now)! * 365 * 24).toBeCloseTo(6, 5);
    expect(daysToExpiry("2026-10-16", now)).toBe(1);
    expect(daysToExpiry("2026-10-15", now)).toBe(0);
    expect(yearsToExpiry("not a date", now)).toBeNull();
  });
});
