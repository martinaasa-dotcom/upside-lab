import { describe, expect, it } from "vitest";
import {
  insightWhen,
  isPastSessionLabel,
  isUsMarketDayOff,
  lastSessionName,
} from "@/lib/market-session";

/*
  A day off is a weekend or an exchange holiday, and the words for "the day
  these numbers are from" name the last real session. Before this, a Monday
  holiday said "today" over Friday's close, and the weekend after Good
  Friday said "Friday" over Thursday's.
*/
const at = (iso: string) => new Date(`${iso}T15:00:00Z`); // 11:00 in New York

describe("the last session, named", () => {
  it("is Friday on an ordinary weekend", () => {
    expect(lastSessionName(at("2026-09-26"))).toBe("Friday");
    expect(insightWhen("unknown", at("2026-09-26"))).toBe("friday");
  });

  it("is Friday on a Monday holiday, which is not today", () => {
    expect(isUsMarketDayOff(at("2026-09-07"))).toBe(true);
    expect(insightWhen("unknown", at("2026-09-07"))).toBe("friday");
    expect(lastSessionName(at("2026-09-07"))).toBe("Friday");
  });

  it("is Thursday the weekend after Good Friday", () => {
    expect(lastSessionName(at("2026-04-04"))).toBe("Thursday");
  });

  it("is Wednesday on Thanksgiving", () => {
    expect(lastSessionName(at("2026-11-26"))).toBe("Wednesday");
  });

  it("is today on an ordinary trading day", () => {
    expect(isUsMarketDayOff(at("2026-09-29"))).toBe(false);
    expect(insightWhen("unknown", at("2026-09-29"))).toBe("today");
  });

  it("recognises a weekday name as a past-session label and nothing else", () => {
    expect(isPastSessionLabel("Thursday")).toBe(true);
    expect(isPastSessionLabel("Today")).toBe(false);
    expect(isPastSessionLabel("After-hours")).toBe(false);
  });
});
