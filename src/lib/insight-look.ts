/**
 * One "look" at Home is a sitting, not a render. Quote polls must not
 * shuffle the cards. Coming back after a break should pick a new note,
 * and a note you already saw this fortnight should stay in the drawer
 * unless the facts actually moved.
 */
import { todayKeyInTz } from "@/lib/timezone";

const LOOK_KEY = "upside-insight-look-v1";
const SHOWN_KEY = "upside-insight-shown-v1";
/** Same sitting if you are still in this window. */
export const INSIGHT_SITTING_MS = 20 * 60 * 1000;
/** How long a used note stays off the desk. */
export const INSIGHT_SHOWN_MS = 14 * 24 * 60 * 60 * 1000;
const SHOWN_MAX = 48;

type LookStored = {
  dayKey: string;
  n: number;
  lastAt: number;
  noticeId: string | null;
  gapId: string | null;
};

export type InsightLook = {
  n: number;
  noticeId: string | null;
  gapId: string | null;
};

type ShownEntry = { fp: string; at: number };

function lookRead(): LookStored | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOOK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LookStored;
    if (!parsed?.dayKey || !Number.isFinite(parsed.n) || !Number.isFinite(parsed.lastAt)) {
      return null;
    }
    return {
      dayKey: parsed.dayKey,
      n: parsed.n,
      lastAt: parsed.lastAt,
      noticeId: parsed.noticeId ?? null,
      gapId: parsed.gapId ?? null,
    };
  } catch {
    return null;
  }
}

function lookWrite(next: LookStored) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/**
 * First look of a Tallinn day is 0. Later looks increment only after
 * `INSIGHT_SITTING_MS`, so a refresh or a quote poll keeps the same cards.
 * The locked ids are the cards chosen for this sitting.
 */
export function bumpInsightLook(now = Date.now()): InsightLook {
  const dayKey = todayKeyInTz();
  const prev = lookRead();
  if (!prev || prev.dayKey !== dayKey) {
    const next = { dayKey, n: 0, lastAt: now, noticeId: null, gapId: null };
    lookWrite(next);
    return { n: 0, noticeId: null, gapId: null };
  }
  if (now - prev.lastAt < INSIGHT_SITTING_MS) {
    return { n: prev.n, noticeId: prev.noticeId, gapId: prev.gapId };
  }
  const n = prev.n + 1;
  lookWrite({ dayKey, n, lastAt: now, noticeId: null, gapId: null });
  return { n, noticeId: null, gapId: null };
}

export function lockInsightLook(
  noticeId: string | null,
  gapId: string | null
): void {
  const prev = lookRead();
  if (!prev) return;
  lookWrite({ ...prev, noticeId, gapId });
}

function shownRead(now: number): ShownEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SHOWN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ShownEntry[];
    if (!Array.isArray(parsed)) return [];
    const floor = now - INSIGHT_SHOWN_MS;
    return parsed.filter(
      (e) => e && typeof e.fp === "string" && Number.isFinite(e.at) && e.at >= floor
    );
  } catch {
    return [];
  }
}

function shownWrite(entries: ShownEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify(entries.slice(-SHOWN_MAX)));
  } catch {
    /* ignore */
  }
}

export function loadShownInsights(now = Date.now()): Set<string> {
  return new Set(shownRead(now).map((e) => e.fp));
}

export function rememberShownInsights(fps: string[], now = Date.now()): void {
  const clean = fps.map((fp) => fp.trim()).filter(Boolean);
  if (clean.length === 0) return;
  const prev = shownRead(now);
  const have = new Set(prev.map((e) => e.fp));
  const next = [...prev];
  for (const fp of clean) {
    if (have.has(fp)) continue;
    have.add(fp);
    next.push({ fp, at: now });
  }
  shownWrite(next);
}

/** 2-point buckets, so 4% and 5% are the same note, 6% is a new one. */
export function insightFingerprint(
  story: string,
  subject: string,
  mag: number,
  sign?: "up" | "down" | "flat"
): string {
  const dir =
    sign ?? (mag > 0.005 ? "up" : mag < -0.005 ? "down" : "flat");
  const bucket = Math.floor(Math.abs(mag) * 50);
  return `${story}|${subject}|${dir}|${bucket}`;
}
