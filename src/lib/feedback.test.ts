import { describe, expect, it } from "vitest";
import {
  FEEDBACK_MONTH_MS,
  MONTHLY_STEPS,
  NO_ANSWER,
  emptyMonthlyAnswers,
  formatMonthlyFeedbackText,
  isMonthlyFeedbackDue,
  markFeedbackSubmitted,
  monthlyHasAnswer,
  parseMonthlyFeedback,
  snoozeFeedbackSchedule,
  stepAnswerText,
  stepIsAnswered,
  type FeedbackSchedule,
  type MonthlyFeedbackAnswers,
} from "@/lib/feedback";

const NOW = Date.parse("2026-08-21T12:00:00Z");

function schedule(over: Partial<FeedbackSchedule> = {}): FeedbackSchedule {
  return {
    firstSeenAt: new Date(NOW - 6 * FEEDBACK_MONTH_MS).toISOString(),
    lastPromptAt: null,
    lastSubmittedAt: null,
    snoozeUntil: null,
    ...over,
  };
}

describe("the prompt shows up once a month", () => {
  it("leaves a new account alone for its first month", () => {
    const fresh = schedule({
      firstSeenAt: new Date(NOW - 29 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(isMonthlyFeedbackDue(fresh, NOW)).toBe(false);
    expect(isMonthlyFeedbackDue(fresh, NOW + 2 * 24 * 60 * 60 * 1000)).toBe(
      true
    );
  });

  it("is due once a month of use is behind you", () => {
    expect(isMonthlyFeedbackDue(schedule(), NOW)).toBe(true);
  });

  it("waits a month after a dismissal", () => {
    const after = snoozeFeedbackSchedule(schedule(), NOW);
    expect(isMonthlyFeedbackDue(after, NOW)).toBe(false);
    expect(isMonthlyFeedbackDue(after, NOW + FEEDBACK_MONTH_MS - 1000)).toBe(
      false
    );
    expect(isMonthlyFeedbackDue(after, NOW + FEEDBACK_MONTH_MS)).toBe(true);
  });

  it("waits a month after a send", () => {
    const after = markFeedbackSubmitted(schedule(), NOW);
    expect(isMonthlyFeedbackDue(after, NOW + FEEDBACK_MONTH_MS - 1000)).toBe(
      false
    );
    expect(isMonthlyFeedbackDue(after, NOW + FEEDBACK_MONTH_MS)).toBe(true);
  });

  it("holds for a month even when an older build only snoozed a week", () => {
    const weekSnooze = schedule({
      lastPromptAt: new Date(NOW - 8 * 24 * 60 * 60 * 1000).toISOString(),
      snoozeUntil: new Date(NOW - 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(isMonthlyFeedbackDue(weekSnooze, NOW)).toBe(false);
    expect(isMonthlyFeedbackDue(weekSnooze, NOW + FEEDBACK_MONTH_MS)).toBe(
      true
    );
  });

  it("ignores a schedule it can't read a date out of", () => {
    expect(isMonthlyFeedbackDue(schedule({ firstSeenAt: "nope" }), NOW)).toBe(
      false
    );
  });
});

describe("the questions and what they read as", () => {
  it("walks four questions, each with its own options", () => {
    expect(MONTHLY_STEPS).toHaveLength(4);
    for (const step of MONTHLY_STEPS) {
      expect(step.options.length).toBeGreaterThan(2);
      expect(step.question.length).toBeGreaterThan(0);
    }
  });

  it("reads as a dash until something is picked", () => {
    const empty = emptyMonthlyAnswers();
    expect(monthlyHasAnswer(empty)).toBe(false);
    for (const step of MONTHLY_STEPS) {
      expect(stepIsAnswered(step, empty)).toBe(false);
      expect(stepAnswerText(step, empty)).toBe(NO_ANSWER);
    }
  });

  it("lists every pick on a many-answer question", () => {
    const answers: MonthlyFeedbackAnswers = {
      ...emptyMonthlyAnswers(),
      helped: ["pulse", "emails"],
    };
    const helped = MONTHLY_STEPS[1]!;
    expect(stepIsAnswered(helped, answers)).toBe(true);
    expect(stepAnswerText(helped, answers)).toBe("Pulse, The emails");
  });

  it("writes the email off the same rows the table shows", () => {
    const text = formatMonthlyFeedbackText({
      feel: "mixed",
      helped: ["prices"],
      blocked: ["crowded", "lost"],
      change: "pulse",
      changeNote: "Fewer numbers on Home.",
    });
    expect(text).toBe(
      [
        "How the month felt: Mixed",
        "What helped: Seeing what I own and today's prices",
        "What got in the way: Too much on screen, Could not find something",
        "One thing to change: Pulse",
        "In their words: Fewer numbers on Home.",
      ].join("\n")
    );
  });

  it("drops answers it doesn't recognise and needs at least one real pick", () => {
    expect(parseMonthlyFeedback({}).ok).toBe(false);
    expect(parseMonthlyFeedback({ feel: "elated" }).ok).toBe(false);
    const parsed = parseMonthlyFeedback({
      feel: "easy",
      helped: ["pulse", "pulse", "made up"],
      changeNote: "  trimmed  ",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.answers.helped).toEqual(["pulse"]);
    expect(parsed.answers.changeNote).toBe("trimmed");
  });
});
