import { describe, expect, it } from "vitest";
import {
  lastCompletedUsSessionKey,
  quotePollMs,
  quoteViewMaxAgeMs,
  tradingDaysBetween,
} from "./session";

describe("lastCompletedUsSessionKey", () => {
  it("is today once the session has closed on a weekday", () => {
    // 2026-08-18 is a Tuesday. 21:00 UTC is 17:00 ET in August (EDT).
    expect(lastCompletedUsSessionKey(new Date("2026-08-18T21:00:00.000Z"))).toBe(
      "2026-08-18"
    );
  });

  it("is yesterday before the close on a weekday", () => {
    // 12:00 UTC is 08:00 ET, before the 16:00 ET close.
    expect(lastCompletedUsSessionKey(new Date("2026-08-18T12:00:00.000Z"))).toBe(
      "2026-08-17"
    );
  });

  it("walks back over the weekend from Monday morning", () => {
    // 2026-08-17 is a Monday. Before the close, so the last completed
    // session is Friday 2026-08-14.
    expect(lastCompletedUsSessionKey(new Date("2026-08-17T12:00:00.000Z"))).toBe(
      "2026-08-14"
    );
  });
});

describe("tradingDaysBetween", () => {
  it("returns nothing when already caught up", () => {
    expect(tradingDaysBetween("2026-08-18", "2026-08-18")).toEqual([]);
  });

  it("returns the single next weekday", () => {
    expect(tradingDaysBetween("2026-08-17", "2026-08-18")).toEqual([
      "2026-08-18",
    ]);
  });

  it("skips the weekend between a Friday report and a Monday session", () => {
    // Last report Friday 2026-08-14, caught up to Monday 2026-08-17.
    expect(tradingDaysBetween("2026-08-14", "2026-08-17")).toEqual([
      "2026-08-17",
    ]);
  });

  it("lists every missed weekday in order, oldest first", () => {
    // Last report Monday 2026-08-17, now caught up through Thursday.
    expect(tradingDaysBetween("2026-08-17", "2026-08-20")).toEqual([
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
    ]);
  });
});

/**
 * Cadence. Every case is written as a UTC instant with the New York wall
 * clock in the comment, because that is the clock the curve is keyed to.
 * August is EDT, so ET is UTC-4. 2026-08-24 is a Monday.
 */
describe("quotePollMs", () => {
  const at = (iso: string) => new Date(iso);

  it("is tightest at the bell and at the close", () => {
    expect(quotePollMs(at("2026-08-24T13:45:00Z"))).toBe(20_000); // 09:45
    expect(quotePollMs(at("2026-08-24T19:45:00Z"))).toBe(20_000); // 15:45
    expect(quotePollMs(at("2026-08-24T13:15:00Z"))).toBe(20_000); // 09:15 pre
  });

  it("eases through the middle of the regular session", () => {
    expect(quotePollMs(at("2026-08-24T15:00:00Z"))).toBe(30_000); // 11:00
  });

  it("thins out as after-hours goes on", () => {
    expect(quotePollMs(at("2026-08-24T20:30:00Z"))).toBe(45_000); // 16:30
    expect(quotePollMs(at("2026-08-24T22:00:00Z"))).toBe(120_000); // 18:00
  });

  it("ramps up through pre-market as the open approaches", () => {
    expect(quotePollMs(at("2026-08-25T09:00:00Z"))).toBe(60_000); // 05:00
    expect(quotePollMs(at("2026-08-25T12:00:00Z"))).toBe(30_000); // 08:00
  });

  it("goes slack overnight, when no US venue is printing at all", () => {
    // 21:00 and 02:00. Yahoo carries pre and post market only inside 04:00
    // to 20:00, so a tighter cadence here buys the same frozen close twice.
    expect(quotePollMs(at("2026-08-25T01:00:00Z"))).toBe(10 * 60_000);
    expect(quotePollMs(at("2026-08-25T06:00:00Z"))).toBe(10 * 60_000);
  });

  it("tightens again on the approach to the 04:00 pre-market open", () => {
    // 03:30, so the first pre-market print lands within a poll of appearing
    // rather than up to ten minutes after it.
    expect(quotePollMs(at("2026-08-25T07:30:00Z"))).toBe(2 * 60_000);
  });

  it("drops to a trickle across the weekend", () => {
    expect(quotePollMs(at("2026-08-22T16:00:00Z"))).toBe(30 * 60_000); // Sat
    expect(quotePollMs(at("2026-08-23T16:00:00Z"))).toBe(30 * 60_000); // Sun
    // Friday evening runs into the same trickle: nothing prints until Monday.
    expect(quotePollMs(at("2026-08-22T01:00:00Z"))).toBe(30 * 60_000);
  });

  it("keeps the weekday evening on the overnight cadence, not the weekend one", () => {
    // Monday 20:00, the moment after-hours ends.
    expect(quotePollMs(at("2026-08-25T00:00:00Z"))).toBe(10 * 60_000);
  });
});

describe("quoteViewMaxAgeMs", () => {
  it("is far tighter than the background cadence overnight", () => {
    const night = new Date("2026-08-25T06:00:00Z"); // 02:00
    expect(quotePollMs(night)).toBe(10 * 60_000);
    expect(quoteViewMaxAgeMs(night)).toBe(60_000);
  });

  it("is tightest while the market is open", () => {
    expect(quoteViewMaxAgeMs(new Date("2026-08-24T15:00:00Z"))).toBe(15_000);
    expect(quoteViewMaxAgeMs(new Date("2026-08-25T09:00:00Z"))).toBe(20_000);
  });
});
