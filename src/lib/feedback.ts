
import { NO_VALUE } from "@/lib/format";
/**
 * In-app feedback. The scheduled prompt walks one question at a time and
 * shows up once a month. Manual is a topic plus a rant.
 */

export const FEEDBACK_TO = "martin.aasa@upthink.ee";
/** How long a person is left alone: before the first prompt, and between prompts. */
export const FEEDBACK_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
export const FEEDBACK_STORAGE_KEY = "upside-feedback-v1";

export const MONTHLY_FEEL = [
  { id: "easy", label: "Easy to follow" },
  { id: "mixed", label: "Mixed" },
  { id: "stuck", label: "Confusing or in the way" },
] as const;

export const MONTHLY_HELPED = [
  { id: "prices", label: "Seeing what I own and today's prices" },
  { id: "pulse", label: "Pulse" },
  { id: "forecast", label: "Forecast" },
  { id: "circle", label: "Circle or a class" },
  { id: "emails", label: "The emails" },
  { id: "editing", label: "Adding or changing names" },
  { id: "nothing", label: "Nothing yet" },
] as const;

export const MONTHLY_BLOCKED = [
  { id: "crowded", label: "Too much on screen" },
  { id: "lost", label: "Couldn't find a thing" },
  { id: "next", label: "Didn't know what to do next" },
  { id: "trust", label: "Didn't trust a number" },
  { id: "none", label: "Nothing got in the way" },
] as const;

export const MONTHLY_CHANGE = [
  { id: "home", label: "Home and the briefing" },
  { id: "adding", label: "Adding names" },
  { id: "pulse", label: "Pulse" },
  { id: "forecast", label: "Forecast" },
  { id: "circle", label: "Circle or a class" },
  { id: "emails", label: "The emails" },
  { id: "other", label: "Something I haven't named" },
] as const;

export type MonthlyFeelId = (typeof MONTHLY_FEEL)[number]["id"];
export type MonthlyHelpedId = (typeof MONTHLY_HELPED)[number]["id"];
export type MonthlyBlockedId = (typeof MONTHLY_BLOCKED)[number]["id"];
export type MonthlyChangeId = (typeof MONTHLY_CHANGE)[number]["id"];

export type MonthlyFeedbackAnswers = {
  feel: MonthlyFeelId | null;
  helped: MonthlyHelpedId[];
  blocked: MonthlyBlockedId[];
  change: MonthlyChangeId | null;
  changeNote: string;
};

export type MonthlyStepId = keyof Omit<MonthlyFeedbackAnswers, "changeNote">;

/**
 * One row per question. The modal walks these one at a time, the summary
 * table lists them, and the email is built from the same rows — so the
 * three can never drift apart.
 */
export const MONTHLY_STEPS = [
  {
    id: "feel",
    /** Column label in the summary table. Keep it short enough to sit in a cell. */
    short: "The month",
    question: "How did the last month feel?",
    hint: null,
    multi: false,
    options: MONTHLY_FEEL,
    /** Line label in the email. */
    emailLabel: "How the month felt",
  },
  {
    id: "helped",
    short: "Helped",
    question: "What actually helped?",
    hint: "Pick every one that did.",
    multi: true,
    options: MONTHLY_HELPED,
    emailLabel: "What helped",
  },
  {
    id: "blocked",
    short: "In the way",
    question: "What got in the way?",
    hint: "Pick every one that did.",
    multi: true,
    options: MONTHLY_BLOCKED,
    emailLabel: "What got in the way",
  },
  {
    id: "change",
    short: "Change",
    question: "If you could change one thing for next month, what is it?",
    hint: null,
    multi: false,
    options: MONTHLY_CHANGE,
    emailLabel: "One thing to change",
  },
] as const satisfies readonly {
  id: MonthlyStepId;
  short: string;
  question: string;
  hint: string | null;
  multi: boolean;
  options: readonly { id: string; label: string }[];
  emailLabel: string;
}[];

export type MonthlyStep = (typeof MONTHLY_STEPS)[number];

/** Shown wherever a question has no answer yet. */
export const NO_ANSWER = NO_VALUE;

export type FeedbackSchedule = {
  firstSeenAt: string;
  lastPromptAt: string | null;
  lastSubmittedAt: string | null;
  snoozeUntil: string | null;
};

export type ManualFeedbackDraft = {
  topic: string;
  body: string;
};

const FEEL_IDS = new Set(MONTHLY_FEEL.map((o) => o.id));
const HELPED_IDS = new Set(MONTHLY_HELPED.map((o) => o.id));
const BLOCKED_IDS = new Set(MONTHLY_BLOCKED.map((o) => o.id));
const CHANGE_IDS = new Set(MONTHLY_CHANGE.map((o) => o.id));

function defaultSchedule(nowIso: string): FeedbackSchedule {
  return {
    firstSeenAt: nowIso,
    lastPromptAt: null,
    lastSubmittedAt: null,
    snoozeUntil: null,
  };
}

export function emptyMonthlyAnswers(): MonthlyFeedbackAnswers {
  return {
    feel: null,
    helped: [],
    blocked: [],
    change: null,
    changeNote: "",
  };
}

export function loadFeedbackSchedule(): FeedbackSchedule | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FeedbackSchedule>;
    if (typeof parsed.firstSeenAt !== "string") return null;
    return {
      firstSeenAt: parsed.firstSeenAt,
      lastPromptAt:
        typeof parsed.lastPromptAt === "string" ? parsed.lastPromptAt : null,
      lastSubmittedAt:
        typeof parsed.lastSubmittedAt === "string"
          ? parsed.lastSubmittedAt
          : null,
      snoozeUntil:
        typeof parsed.snoozeUntil === "string" ? parsed.snoozeUntil : null,
    };
  } catch {
    return null;
  }
}

export function saveFeedbackSchedule(state: FeedbackSchedule) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Stamp first seen. Older accounts keep their created date so a month is already due. */
export function touchFeedbackSchedule(
  accountCreatedAt?: string | null,
  now = Date.now()
): FeedbackSchedule {
  const stored = loadFeedbackSchedule();
  const created = accountCreatedAt ? Date.parse(accountCreatedAt) : NaN;
  const first = stored?.firstSeenAt
    ? stored.firstSeenAt
    : Number.isFinite(created)
      ? new Date(created).toISOString()
      : new Date(now).toISOString();
  const next: FeedbackSchedule = {
    ...(stored ?? defaultSchedule(first)),
    firstSeenAt: first,
  };
  saveFeedbackSchedule(next);
  return next;
}

function isAtLeastAMonthAfter(stamp: string | null, now: number): boolean {
  if (!stamp) return true;
  const at = Date.parse(stamp);
  if (!Number.isFinite(at)) return true;
  return now >= at + FEEDBACK_MONTH_MS;
}

/**
 * Due at most once a month: a month of use before the first one, then a
 * month clear of the last prompt and the last send. `lastPromptAt` is
 * checked on its own so a schedule written by an older build — which
 * snoozed only a week — still waits the full month.
 */
export function isMonthlyFeedbackDue(
  schedule: FeedbackSchedule,
  now = Date.now()
): boolean {
  const start = Date.parse(schedule.firstSeenAt);
  if (!Number.isFinite(start) || now < start + FEEDBACK_MONTH_MS) return false;
  const snooze = schedule.snoozeUntil ? Date.parse(schedule.snoozeUntil) : NaN;
  if (Number.isFinite(snooze) && now < snooze) return false;
  if (!isAtLeastAMonthAfter(schedule.lastPromptAt, now)) return false;
  return isAtLeastAMonthAfter(schedule.lastSubmittedAt, now);
}

export function snoozeFeedbackSchedule(
  schedule: FeedbackSchedule,
  now = Date.now()
): FeedbackSchedule {
  const next: FeedbackSchedule = {
    ...schedule,
    lastPromptAt: new Date(now).toISOString(),
    snoozeUntil: new Date(now + FEEDBACK_MONTH_MS).toISOString(),
  };
  saveFeedbackSchedule(next);
  return next;
}

export function markFeedbackSubmitted(
  schedule: FeedbackSchedule,
  now = Date.now()
): FeedbackSchedule {
  const next: FeedbackSchedule = {
    ...schedule,
    lastPromptAt: new Date(now).toISOString(),
    lastSubmittedAt: new Date(now).toISOString(),
    snoozeUntil: new Date(now + FEEDBACK_MONTH_MS).toISOString(),
  };
  saveFeedbackSchedule(next);
  return next;
}

function clip(s: string, max: number): string {
  return s.trim().slice(0, max);
}

function uniqueIds<T extends string>(raw: unknown, allowed: Set<T>): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string" || !allowed.has(item as T) || seen.has(item)) {
      continue;
    }
    seen.add(item);
    out.push(item as T);
  }
  return out;
}

export function monthlyHasAnswer(answers: MonthlyFeedbackAnswers): boolean {
  return Boolean(
    answers.feel ||
      answers.helped.length ||
      answers.blocked.length ||
      answers.change
  );
}

/** True once the reader has picked something for this question. */
export function stepIsAnswered(
  step: MonthlyStep,
  answers: MonthlyFeedbackAnswers
): boolean {
  const value = answers[step.id];
  return Array.isArray(value) ? value.length > 0 : value != null;
}

function labelOf(
  options: readonly { id: string; label: string }[],
  id: string
): string {
  return options.find((o) => o.id === id)?.label ?? id;
}

/** What a question currently reads as, for the summary table and the email. */
export function stepAnswerText(
  step: MonthlyStep,
  answers: MonthlyFeedbackAnswers
): string {
  const value = answers[step.id];
  if (Array.isArray(value)) {
    if (value.length === 0) return NO_ANSWER;
    return value.map((id) => labelOf(step.options, id)).join(", ");
  }
  return value ? labelOf(step.options, value) : NO_ANSWER;
}

export function parseMonthlyFeedback(body: unknown):
  | { ok: true; answers: MonthlyFeedbackAnswers }
  | { ok: false; error: string } {
  const raw = (body ?? {}) as Record<string, unknown>;
  const feel =
    typeof raw.feel === "string" && FEEL_IDS.has(raw.feel as MonthlyFeelId)
      ? (raw.feel as MonthlyFeelId)
      : null;
  const helped = uniqueIds(raw.helped, HELPED_IDS);
  const blocked = uniqueIds(raw.blocked, BLOCKED_IDS);
  const change =
    typeof raw.change === "string" &&
    CHANGE_IDS.has(raw.change as MonthlyChangeId)
      ? (raw.change as MonthlyChangeId)
      : null;
  const changeNote = clip(String(raw.changeNote ?? ""), 400);
  const answers: MonthlyFeedbackAnswers = {
    feel,
    helped,
    blocked,
    change,
    changeNote,
  };
  if (!monthlyHasAnswer(answers)) {
    return { ok: false, error: "Pick at least one answer." };
  }
  return { ok: true, answers };
}

export function parseManualFeedback(body: unknown):
  | { ok: true; draft: ManualFeedbackDraft }
  | { ok: false; error: string } {
  const raw = (body ?? {}) as Record<string, unknown>;
  const topic = clip(String(raw.topic ?? ""), 120);
  const text = clip(String(raw.body ?? ""), 8000);
  if (!topic) return { ok: false, error: "Say what this is about." };
  if (text.length < 8) {
    return { ok: false, error: "Give it a bit more than a line." };
  }
  return { ok: true, draft: { topic, body: text } };
}

export function formatMonthlyFeedbackText(
  answers: MonthlyFeedbackAnswers
): string {
  const lines = MONTHLY_STEPS.map(
    (step) => `${step.emailLabel}: ${stepAnswerText(step, answers)}`
  );
  if (answers.changeNote) lines.push("In their words: " + answers.changeNote);
  return lines.join("\n");
}
