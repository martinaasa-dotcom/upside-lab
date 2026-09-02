import { describe, expect, it } from "vitest";
import {
  currentDuelSessionKey,
  duelCanSettle,
  duelDayPct,
  duelSessionCopy,
  duelStreak,
  duelWinnerSide,
  previousDuelSessionKey,
  recentDuelSessionKeys,
} from "@/lib/daily-duel";

/*
  The circle's only game could never end.

  `currentDuelSessionKey` returns a session whose close is still ahead, by
  construction, and both the route and the card asked `duelCanSettle` about
  that very key to decide whether the result was in. It is false every time,
  so the card said "Results come after the US close" forever and, at 16:00,
  the key rolled to the next day and the picks everybody had made were never
  read again. The first test here is the one that would have caught it.
*/

// 20:00 UTC on a Wednesday is 16:00 New York in summer, so Wednesday's
// session has just closed and Thursday's is the live one.
const wedAfterClose = new Date("2026-06-10T20:30:00Z");
const wedMidday = new Date("2026-06-10T15:00:00Z");
const sunday = new Date("2026-06-14T12:00:00Z");

describe("a duel has a session that has already closed", () => {
  it("never returns a key the live one is still waiting on", () => {
    for (const now of [wedMidday, wedAfterClose, sunday]) {
      const live = currentDuelSessionKey(now);
      const done = previousDuelSessionKey(now);
      expect(duelCanSettle(live, now), `live ${live}`).toBe(false);
      expect(duelCanSettle(done, now), `closed ${done}`).toBe(true);
      expect(done < live).toBe(true);
    }
  });

  it("moves on the moment the bell goes, and not before", () => {
    expect(previousDuelSessionKey(wedMidday)).toBe("2026-06-09");
    expect(previousDuelSessionKey(wedAfterClose)).toBe("2026-06-10");
  });

  it("skips the weekend in both directions", () => {
    expect(previousDuelSessionKey(sunday)).toBe("2026-06-12");
    expect(currentDuelSessionKey(sunday)).toBe("2026-06-15");
    const keys = recentDuelSessionKeys(4, new Date("2026-06-15T21:00:00Z"));
    expect(keys).toEqual(["2026-06-15", "2026-06-12", "2026-06-11", "2026-06-10"]);
  });
});

describe("resolving a closed session from the dated closes a quote carries", () => {
  const closes = [
    { date: "2026-06-08", close: 100 },
    { date: "2026-06-09", close: 110 },
    { date: "2026-06-10", close: 99 },
  ];

  it("measures a day against the day before it", () => {
    expect(duelDayPct(closes, "2026-06-09")).toBeCloseTo(0.1, 6);
    expect(duelDayPct(closes, "2026-06-10")).toBeCloseTo(-0.1, 6);
  });

  it("answers null rather than guessing", () => {
    // The first close has nothing before it to measure against, and a day
    // the provider did not report is not a day we can price.
    expect(duelDayPct(closes, "2026-06-08")).toBeNull();
    expect(duelDayPct(closes, "2026-06-11")).toBeNull();
    expect(duelDayPct(undefined, "2026-06-10")).toBeNull();
    expect(duelDayPct([{ date: "2026-06-10", close: 5 }], "2026-06-10")).toBeNull();
  });

  it("names the winner, a tie, and a day it cannot settle", () => {
    expect(duelWinnerSide(0.02, -0.01)).toBe("a");
    expect(duelWinnerSide(-0.03, -0.01)).toBe("b");
    expect(duelWinnerSide(0.01, 0.01)).toBe("tie");
    expect(duelWinnerSide(0.01, null)).toBeNull();
  });
});

describe("a streak counts what it can stand behind", () => {
  it("counts the run of correct calls, newest first", () => {
    expect(
      duelStreak([
        { myPick: "a", winner: "a" },
        { myPick: "b", winner: "b" },
        { myPick: "a", winner: "b" },
        { myPick: "a", winner: "a" },
      ])
    ).toBe(2);
  });

  it("skips a session the reader sat out", () => {
    expect(
      duelStreak([
        { myPick: "a", winner: "a" },
        { myPick: null, winner: "b" },
        { myPick: "b", winner: "b" },
      ])
    ).toBe(2);
  });

  it("passes over a tie without counting it", () => {
    expect(
      duelStreak([
        { myPick: "a", winner: "tie" },
        { myPick: "a", winner: "a" },
      ])
    ).toBe(1);
  });

  it("stops at a day nobody could resolve rather than assuming a win", () => {
    expect(
      duelStreak([
        { myPick: "a", winner: "a" },
        { myPick: "a", winner: null },
        { myPick: "a", winner: "a" },
      ])
    ).toBe(1);
  });
});

describe("the question a duel asks", () => {
  it("asks which one, about two companies, and never says session", () => {
    for (const key of ["2026-06-10", "2026-06-15"]) {
      const copy = duelSessionCopy(key, wedMidday);
      expect(copy).not.toMatch(/session/i);
      expect(copy).not.toMatch(/^who\b/i);
      expect(copy).toMatch(/^Which one is higher/);
    }
  });
});
