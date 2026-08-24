import { describe, expect, it } from "vitest";
import {
  isOvernightGap,
  lastUsPrintAt,
  legChange,
  nextUsPrintAt,
  overnightDirection,
} from "./overnight";

/** New York wall clock for an instant, so a failure reads as a time. */
const ny = (ms: number) =>
  new Date(ms).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

// August 2026 is EDT, so New York is UTC-4. 2026-08-24 is a Monday.
const AT = {
  monEarly: new Date("2026-08-24T06:00:00Z"), // Mon 02:00
  monEvening: new Date("2026-08-25T01:00:00Z"), // Mon 21:00
  sunEvening: new Date("2026-08-23T23:00:00Z"), // Sun 19:00
  sunAfternoon: new Date("2026-08-23T16:00:00Z"), // Sun 12:00
  satAfternoon: new Date("2026-08-22T18:00:00Z"), // Sat 14:00
  friEvening: new Date("2026-08-22T01:00:00Z"), // Fri 21:00
  monOpen: new Date("2026-08-24T15:00:00Z"), // Mon 11:00
  monPre: new Date("2026-08-24T09:00:00Z"), // Mon 05:00
  monAfterHours: new Date("2026-08-24T22:00:00Z"), // Mon 18:00
};

describe("isOvernightGap", () => {
  it("is true through the small hours of a trading day", () => {
    expect(isOvernightGap(AT.monEarly)).toBe(true);
  });

  it("is true on a weekday evening once after-hours has ended", () => {
    expect(isOvernightGap(AT.monEvening)).toBe(true);
  });

  it("is true from Sunday evening, when the futures week reopens", () => {
    expect(isOvernightGap(AT.sunEvening)).toBe(true);
    expect(isOvernightGap(AT.sunAfternoon)).toBe(false);
  });

  it("is false while any US venue is printing a per-name price", () => {
    // Pre-market, the regular session and after-hours all print, so the
    // portfolio is already showing real prices and needs no indication.
    expect(isOvernightGap(AT.monPre)).toBe(false);
    expect(isOvernightGap(AT.monOpen)).toBe(false);
    expect(isOvernightGap(AT.monAfterHours)).toBe(false);
  });

  it("is false when futures are shut too, so there is nothing to indicate", () => {
    // Friday evening through Saturday: stocks shut, CME shut. A weekend-old
    // number beside the portfolio is worse than no number at all.
    expect(isOvernightGap(AT.friEvening)).toBe(false);
    expect(isOvernightGap(AT.satAfternoon)).toBe(false);
  });
});

describe("lastUsPrintAt", () => {
  it("anchors to 20:00 the same evening", () => {
    expect(ny(lastUsPrintAt(AT.monEvening))).toContain("20:00");
    expect(ny(lastUsPrintAt(AT.monEvening))).toContain("Mon");
  });

  it("anchors to the previous evening in the small hours", () => {
    // Monday 02:00 reaches back over the weekend to Friday 20:00, not to
    // Sunday, which never had a session to print one.
    const anchor = ny(lastUsPrintAt(AT.monEarly));
    expect(anchor).toContain("Fri");
    expect(anchor).toContain("20:00");
  });

  it("reaches back to Friday from Sunday evening", () => {
    const anchor = ny(lastUsPrintAt(AT.sunEvening));
    expect(anchor).toContain("Fri");
    expect(anchor).toContain("20:00");
  });

  it("always lands in the past", () => {
    for (const at of Object.values(AT)) {
      expect(lastUsPrintAt(at)).toBeLessThan(at.getTime());
    }
  });
});

describe("nextUsPrintAt", () => {
  it("is 04:00 New York, when pre-market starts carrying prints", () => {
    expect(ny(nextUsPrintAt(AT.monEarly))).toContain("04:00");
    expect(ny(nextUsPrintAt(AT.monEvening))).toContain("04:00");
  });

  it("is the coming 04:00, not one already gone", () => {
    for (const at of Object.values(AT)) {
      expect(nextUsPrintAt(at)).toBeGreaterThan(at.getTime());
    }
  });

  it("reads as 11:00 in Tallinn, which is the whole point of showing it", () => {
    const local = new Date(nextUsPrintAt(AT.monEarly)).toLocaleString("en-GB", {
      timeZone: "Europe/Tallinn",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    expect(local).toBe("11:00");
  });
});

describe("legChange", () => {
  it("is the plain percent move against the anchor", () => {
    expect(legChange(100, 101)).toBeCloseTo(0.01, 10);
    expect(legChange(100, 99)).toBeCloseTo(-0.01, 10);
  });

  it("refuses anything that is not a usable pair of prices", () => {
    expect(legChange(null, 100)).toBeNull();
    expect(legChange(100, null)).toBeNull();
    expect(legChange(0, 100)).toBeNull();
    expect(legChange(100, 0)).toBeNull();
    expect(legChange(-100, 100)).toBeNull();
    expect(legChange(Number.NaN, 100)).toBeNull();
  });

  it("refuses a move no overnight session produces", () => {
    // A contract roll or a bad bar, not a 40% night. It must not reach a
    // reader as a number, because they would act on it.
    expect(legChange(100, 140)).toBeNull();
    expect(legChange(100, 60)).toBeNull();
    expect(legChange(100, 124)).toBeCloseTo(0.24, 10);
  });
});

describe("overnightDirection", () => {
  const leg = (changePercent: number) => ({
    symbol: "X=F",
    name: "X",
    changePercent,
  });
  const wrap = (legs: ReturnType<typeof leg>[]) => ({
    legs,
    asOf: 0,
    since: 0,
    resumesAt: 0,
  });

  it("averages the legs", () => {
    expect(overnightDirection(wrap([leg(-0.01), leg(-0.03)]))).toBeCloseTo(
      -0.02,
      10
    );
  });

  it("has no direction without legs", () => {
    expect(overnightDirection(null)).toBeNull();
    expect(overnightDirection(wrap([]))).toBeNull();
  });
});
