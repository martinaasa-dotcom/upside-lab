/**
 * HOW OFTEN THIS DEVICE HAS BEEN OPENED. A COUNT, NOT A SCORE.
 *
 * This was a Duolingo streak, and everything around it said so: a card
 * called "Showing up", a run of days to protect, flavour lines running from
 * "Day 1. Historic. Frame it." through "Certified degenerate (affectionate)"
 * to "Certified market menace", and a toast on Home with a fire emoji and
 * the word "unlocked" in it.
 *
 * The mechanic was arguing with the product. The walkthrough promises "no
 * daily note, no alert, and no come back", Help says most days nothing has
 * changed at the companies you own, and the Sunday letter exists precisely
 * so nobody has to look more often than that. A counter that resets is a
 * reason to open a price app on a day there is nothing in it, which is the
 * one habit this app is not trying to build. The gambling vocabulary was
 * the loud half of the problem and the easy half to fix; the reward was the
 * quiet half.
 *
 * So the numbers stay and the reward goes. The count is honest, it is the
 * reader's own, and it is genuinely useful to somebody wondering whether
 * they are checking their money more often than they meant to. Every
 * sentence built from it now says what the rest of the app says: looking is
 * fine, and nothing here needs you daily. Nothing celebrates a number,
 * nothing warns about losing one, and there is no milestone below a week.
 *
 * Purely local to this browser. Two devices are two counts, and neither
 * reaches the server.
 */
import { todayKeyInTz } from "@/lib/timezone";

const KEY = "upside-visit-streak-v1";
const MAX_RECENT_DAYS = 14;

/**
 * The days that say something out loud, once each.
 *
 * Deliberately starting at a week. Three days is not a fact about anybody,
 * and a message on day three is the app asking to be opened on day four.
 */
export const STREAK_MILESTONES = [7, 30, 100, 365] as const;

export type VisitStreakState = {
  lastVisitDayKey: string | null;
  currentStreak: number;
  longestStreak: number;
  totalVisits: number;
  /** Day keys visited, oldest first, capped. Powers the week strip. */
  recentDays: string[];
};

function defaultStreak(): VisitStreakState {
  return {
    lastVisitDayKey: null,
    currentStreak: 0,
    longestStreak: 0,
    totalVisits: 0,
    recentDays: [],
  };
}

export function loadVisitStreak(): VisitStreakState {
  if (typeof window === "undefined") return defaultStreak();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultStreak();
    return { ...defaultStreak(), ...(JSON.parse(raw) as VisitStreakState) };
  } catch {
    return defaultStreak();
  }
}

function saveVisitStreak(state: VisitStreakState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** Integer day difference (b minus a) for two "YYYY-MM-DD" keys, DST-safe. */
function daysBetweenKeys(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00Z`).getTime();
  const db = new Date(`${b}T12:00:00Z`).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return NaN;
  return Math.round((db - da) / 86400000);
}

/**
 * Call once per app load. Bumps the count at most once per Tallinn calendar
 * day, so it's safe to call on every mount/refresh.
 */
export function recordVisitToday(
  dayKey: string = todayKeyInTz()
): {
  state: VisitStreakState;
  isNewToday: boolean;
  justHitMilestone: number | null;
} {
  const prev = loadVisitStreak();
  if (prev.lastVisitDayKey === dayKey) {
    return { state: prev, isNewToday: false, justHitMilestone: null };
  }

  const gap = prev.lastVisitDayKey
    ? daysBetweenKeys(prev.lastVisitDayKey, dayKey)
    : null;
  const nextStreak = gap === 1 ? prev.currentStreak + 1 : 1;
  const recentDays = [...prev.recentDays, dayKey].slice(-MAX_RECENT_DAYS);

  const next: VisitStreakState = {
    lastVisitDayKey: dayKey,
    currentStreak: nextStreak,
    longestStreak: Math.max(prev.longestStreak, nextStreak),
    totalVisits: prev.totalVisits + 1,
    recentDays,
  };
  saveVisitStreak(next);

  const justHitMilestone = (STREAK_MILESTONES as readonly number[]).includes(
    nextStreak
  )
    ? nextStreak
    : null;

  return { state: next, isNewToday: true, justHitMilestone };
}

/** Sunday first, matching `Date.prototype.getUTCDay`. */
const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"] as const;

export type StreakDay = {
  /** "YYYY-MM-DD" in the app's timezone. */
  key: string;
  /** One letter, for the label under the pill. */
  initial: string;
  visited: boolean;
  isToday: boolean;
};

/**
 * The last 7 Tallinn days, oldest first, each one labelled.
 *
 * Seven bare pills with only a `title` on the row told a reader nothing: a
 * tooltip never appears on a phone, so nobody could tell which pill was
 * today or which way round the week ran. The letter under each one answers
 * both without needing a sentence.
 */
export function last7Days(
  state: VisitStreakState,
  todayKey: string = todayKeyInTz()
): StreakDay[] {
  const visited = new Set(state.recentDays);
  const base = new Date(`${todayKey}T12:00:00Z`).getTime();
  const out: StreakDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(base - i * 86400000);
    const key = day.toISOString().slice(0, 10);
    out.push({
      key,
      initial: DAY_INITIALS[day.getUTCDay()]!,
      visited: visited.has(key),
      isToday: i === 0,
    });
  }
  return out;
}

/**
 * The line under the card's title.
 *
 * Warm, plain, and defusing rather than congratulating: every one of these
 * ends by saying the reader does not have to be here. That is not modesty,
 * it is the product's actual position, and it is the sentence somebody who
 * has been checking every evening most needs to read.
 */
export function streakFlavor(streak: number): string {
  if (streak <= 0) {
    return "You have not looked in a few days. Nothing here needed you, which is the usual answer.";
  }
  if (streak === 1) {
    return "One day so far. Nothing you own needs checking again tomorrow.";
  }
  if (streak < 7) {
    return `${streak} days in a row. Looking is fine, and nothing you own needs it daily.`;
  }
  if (streak < 30) {
    return `${streak} days in a row. That is a habit now. Most days nothing will have changed, and that is the normal answer.`;
  }
  if (streak < 100) {
    return `${streak} days in a row. Worth saying again: on most of them nothing happened at the companies you own.`;
  }
  return `${streak} days in a row. You have seen enough quiet days by now to know how many of them are quiet.`;
}

/**
 * The sentence under the strip.
 *
 * It was `10 day streak - best 12 - 32 visits on this device`, which puts
 * hyphens between numbers in a line sitting beside mono figures, where they
 * read as minus signs. Three facts in one sentence instead, with the
 * punctuation a person would use.
 */
export function streakSentence(
  state: VisitStreakState,
  todayKey: string = todayKeyInTz()
): string {
  const week = last7Days(state, todayKey).filter((d) => d.visited).length;
  const opens =
    state.totalVisits === 1
      ? "once on this device"
      : `${state.totalVisits} times on this device`;
  const best =
    state.longestStreak > 1
      ? ` Your longest run is ${state.longestStreak} days.`
      : "";
  return `You looked on ${week} of the last 7 days, and you have opened Upside Lab ${opens}.${best}`;
}

/**
 * Said once, when a run reaches a week, a month, a hundred days or a year.
 *
 * No emoji, no "unlocked", and a second sentence that takes the pressure
 * straight back off. A number said plainly is a fact; the same number with a
 * flame beside it is a reward, and rewarding attendance is the thing this
 * file stopped doing.
 */
export function milestoneToast(days: number): string {
  return `${days} days in a row. Looking is fine, and nothing you own needs it daily.`;
}
