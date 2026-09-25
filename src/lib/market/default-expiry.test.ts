import { beforeEach, describe, expect, it } from "vitest";
import { STRATEGY } from "@/lib/calculations";
import { defaultExpiryFrom, scanCoveredCall } from "@/lib/market/covered-call";
import { noteMarketFailure, resetMarketCircuits } from "@/lib/market/circuit-breaker";

/*
  The default expiry is the first listed date at least three weeks out,
  rounded up and never down. It used to be whichever listing sat nearest
  17 days, which on a weekly chain meant 14.
*/
describe("the default expiry", () => {
  it("is at least three weeks out", () => {
    expect(STRATEGY.minDaysToExpiry).toBe(21);
  });

  it("rounds up to the next listing, never down to a nearer one", () => {
    const listed = [7, 14, 20, 27, 34, 55].map((days) => ({ days }));
    expect(defaultExpiryFrom(listed)?.days).toBe(27);
  });

  it("takes a listing on exactly the floor", () => {
    expect(defaultExpiryFrom([14, 21, 28].map((days) => ({ days })))?.days).toBe(21);
  });

  it("goes past a month when only monthly dates are listed", () => {
    expect(defaultExpiryFrom([13, 48].map((days) => ({ days })))?.days).toBe(48);
  });

  it("takes the furthest listing only when nothing reaches the floor", () => {
    expect(defaultExpiryFrom([6, 13].map((days) => ({ days })))?.days).toBe(13);
    expect(defaultExpiryFrom([])).toBeNull();
  });
});

describe("the estimate when no chain is available", () => {
  beforeEach(() => resetMarketCircuits());

  it("is never priced for fewer than three weeks", async () => {
    noteMarketFailure("yahoo");
    noteMarketFailure("yahoo");
    noteMarketFailure("yahoo");
    const c = await scanCoveredCall({ ticker: "NVDA", spot: 100, shares: 200 });
    expect(c!.daysToExpiry).toBeGreaterThanOrEqual(21);
    expect(c!.daysToExpiry).toBeLessThanOrEqual(28);
    expect(new Date(`${c!.expiration}T12:00:00Z`).getUTCDay()).toBe(5);
  });
});
