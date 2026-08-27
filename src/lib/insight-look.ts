/**
 * One "look" at Home is a sitting, not a render. Quote polls must not
 * shuffle the cards. Coming back after a break should.
 */
import { todayKeyInTz } from "@/lib/timezone";

const KEY = "upside-insight-look-v1";
/** Same sitting if you are still in this window. */
export const INSIGHT_SITTING_MS = 20 * 60 * 1000;

type Stored = {
  dayKey: string;
  n: number;
  lastAt: number;
};

function read(): Stored | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    if (!parsed?.dayKey || !Number.isFinite(parsed.n) || !Number.isFinite(parsed.lastAt)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function write(next: Stored) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/**
 * First look of a Tallinn day is 0. Later looks increment only after
 * `INSIGHT_SITTING_MS`, so a refresh or a quote poll keeps the same cards.
 */
export function bumpInsightLook(now = Date.now()): number {
  const dayKey = todayKeyInTz();
  const prev = read();
  if (!prev || prev.dayKey !== dayKey) {
    write({ dayKey, n: 0, lastAt: now });
    return 0;
  }
  if (now - prev.lastAt < INSIGHT_SITTING_MS) return prev.n;
  const n = prev.n + 1;
  write({ dayKey, n, lastAt: now });
  return n;
}
