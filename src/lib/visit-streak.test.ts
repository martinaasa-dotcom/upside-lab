import { describe, expect, it } from "vitest";
import {
  STREAK_MILESTONES,
  last7Days,
  milestoneToast,
  streakFlavor,
  streakSentence,
  type VisitStreakState,
} from "@/lib/visit-streak";

function state(over: Partial<VisitStreakState> = {}): VisitStreakState {
  return {
    lastVisitDayKey: "2026-09-02",
    currentStreak: 3,
    longestStreak: 12,
    totalVisits: 32,
    recentDays: ["2026-08-31", "2026-09-01", "2026-09-02"],
    ...over,
  };
}

describe("the week strip", () => {
  it("runs oldest to newest and puts today last", () => {
    const days = last7Days(state(), "2026-09-02");
    expect(days).toHaveLength(7);
    expect(days[0]!.key).toBe("2026-08-27");
    expect(days[6]!.key).toBe("2026-09-02");
    expect(days[6]!.isToday).toBe(true);
    expect(days.filter((d) => d.isToday)).toHaveLength(1);
  });

  it("labels each pill with its own day, so a phone can read it", () => {
    // 2026-09-02 is a Wednesday.
    const days = last7Days(state(), "2026-09-02");
    expect(days.map((d) => d.initial)).toEqual([
      "T",
      "F",
      "S",
      "S",
      "M",
      "T",
      "W",
    ]);
  });

  it("marks only the days that were really visited", () => {
    const days = last7Days(state(), "2026-09-02");
    expect(days.filter((d) => d.visited).map((d) => d.key)).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
    ]);
  });
});

describe("the sentence under it", () => {
  /*
    The old line was `10 day streak - best 12 - 32 visits on this device`.
    Those hyphens sit beside mono figures and read as minus signs, which is
    the whole reason this is a sentence now.
  */
  it("is a sentence, with no separators between numbers", () => {
    const line = streakSentence(state(), "2026-09-02");
    expect(line).toBe(
      "You looked on 3 of the last 7 days, and you have opened Upside Lab 32 times on this device. Your longest run is 12 days."
    );
    expect(line).not.toContain(" - ");
  });

  it("does not boast about a longest run of one day", () => {
    const line = streakSentence(
      state({ longestStreak: 1, totalVisits: 1, recentDays: ["2026-09-02"] }),
      "2026-09-02"
    );
    expect(line).toContain("once on this device");
    expect(line).not.toContain("longest run");
  });
});

describe("the voice", () => {
  /*
    Every line used to be a joke about compulsive checking: "Certified
    degenerate (affectionate)", "Your broker knows your face by now", "Send
    help", "Certified market menace". A grandmother gets none of those, and
    "degen" is gambling slang in an app about somebody's savings.
  */
  it("has no gambling slang and no bragging left in it", () => {
    const banned =
      /\b(degen|degenerate|menace|addict|send help|thriving|historic|frame it)\b/i;
    for (const days of [0, 1, 2, 6, 7, 13, 29, 59, 99, 200, 400]) {
      expect(streakFlavor(days), `streakFlavor(${days})`).not.toMatch(banned);
    }
  });

  /*
    The point of keeping the card at all. Every line has to end by saying
    the reader does not have to be here, or it is a reward again.
  */
  it("always says the reader does not need to look daily", () => {
    for (const days of [0, 1, 2, 6, 7, 13, 29, 59, 99, 200, 400]) {
      expect(streakFlavor(days), `streakFlavor(${days})`).toMatch(
        /nothing (here|you own)|nothing happened|quiet|normal answer/i
      );
    }
  });

  it("counts the days without ever spending an exclamation mark", () => {
    for (const days of [1, 7, 30, 100]) {
      expect(streakFlavor(days)).not.toContain("!");
    }
  });
});

describe("the milestone said on Home", () => {
  it("has no emoji and does not say unlocked", () => {
    const line = milestoneToast(7);
    expect(line).toBe(
      "7 days in a row. Looking is fine, and nothing you own needs it daily."
    );
    expect(line).not.toMatch(/\bunlock/i);
    expect(line).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  /*
    A note on day three is the app asking to be opened on day four. The
    first thing worth saying out loud is a week.
  */
  it("says nothing before a week has passed", () => {
    expect(Math.min(...STREAK_MILESTONES)).toBe(7);
    expect([...STREAK_MILESTONES]).toEqual([7, 30, 100, 365]);
  });
});
