/**
 * Daily Duel — pick which holding finishes the next US cash session higher.
 * The live card is always the next session that has not closed yet
 * (weekend looks at Monday, Friday after 4pm ET looks at Monday).
 * Results stay off the live card so leftover Friday quotes cannot spoil it.
 */
import { dateKeyInTz } from "@/lib/timezone";

const KEY = "upside-daily-duel-v2";
const MAX_HISTORY = 60;
const US_TZ = "America/New_York";

function addDayKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const next = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + days));
  return next.toISOString().slice(0, 10);
}

function civilWeekday(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12)).getUTCDay();
}

function isWeekendKey(key: string): boolean {
  const dow = civilWeekday(key);
  return dow === 0 || dow === 6;
}

/** Offset of `timeZone` at `date`, as (wall-clock-as-UTC − actual UTC). */
function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const n = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    n("year"),
    n("month") - 1,
    n("day"),
    n("hour"),
    n("minute"),
    n("second")
  );
  return asUtc - date.getTime();
}

function zonedLocalToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0
): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const first = new Date(wallAsUtc - tzOffsetMs(new Date(wallAsUtc), timeZone));
  return new Date(wallAsUtc - tzOffsetMs(first, timeZone));
}

export function duelSessionCloseMs(sessionKey: string): number {
  const [y, m, d] = sessionKey.split("-").map(Number);
  return zonedLocalToUtc(US_TZ, y ?? 1970, m ?? 1, d ?? 1, 16, 0).getTime();
}

/** YYYY-MM-DD of the next US regular session that has not closed yet. */
export function currentDuelSessionKey(now: Date = new Date()): string {
  let key = dateKeyInTz(now, US_TZ);
  for (let i = 0; i < 10; i++) {
    if (!isWeekendKey(key) && now.getTime() < duelSessionCloseMs(key)) {
      return key;
    }
    key = addDayKey(key, 1);
  }
  return key;
}

/**
 * YYYY-MM-DD of the most recent US regular session that HAS closed.
 *
 * The circle's duel could never end without this. `currentDuelSessionKey`
 * always returns a session whose close is still ahead, by construction, and
 * both the route and the card asked `duelCanSettle(currentDuelSessionKey())`
 * to decide whether the result was in, which is false every time. After
 * 16:00 the key simply rolled to the next day and the picks everybody made
 * were never read again, so nobody in a circle ever saw who won.
 */
export function previousDuelSessionKey(now: Date = new Date()): string {
  let key = dateKeyInTz(now, US_TZ);
  for (let i = 0; i < 10; i++) {
    if (!isWeekendKey(key) && now.getTime() >= duelSessionCloseMs(key)) {
      return key;
    }
    key = addDayKey(key, -1);
  }
  return key;
}

/** The last `count` closed sessions, newest first. */
export function recentDuelSessionKeys(
  count: number,
  now: Date = new Date()
): string[] {
  const out: string[] = [];
  let key = previousDuelSessionKey(now);
  while (out.length < count) {
    if (!isWeekendKey(key)) out.push(key);
    key = addDayKey(key, -1);
  }
  return out;
}

/**
 * How a company moved on one session, from the dated closes a quote already
 * carries. `dailyCloses` is about fifteen sessions deep, which is what lets
 * a streak be counted over the fortnight the duel table holds picks for
 * without asking a provider for anything extra.
 *
 * Returns null when either that session or the one before it is missing,
 * because a percentage against the wrong day is worse than no percentage.
 */
export function duelDayPct(
  closes: { date: string; close: number }[] | undefined,
  sessionKey: string
): number | null {
  if (!closes || closes.length < 2) return null;
  const idx = closes.findIndex((c) => c.date === sessionKey);
  if (idx < 1) return null;
  const previous = closes[idx - 1]!.close;
  const settled = closes[idx]!.close;
  if (!(previous > 0) || !Number.isFinite(settled)) return null;
  return (settled - previous) / previous;
}

/** Which side won, or null for a tie or a session we cannot resolve. */
export function duelWinnerSide(
  pctA: number | null,
  pctB: number | null
): DuelPick | "tie" | null {
  if (pctA == null || pctB == null) return null;
  if (pctA === pctB) return "tie";
  return pctA > pctB ? "a" : "b";
}

/**
 * How many closed sessions in a row this person has called right, newest
 * first. A tie neither breaks it nor counts, a session they did not play is
 * skipped, and a session nobody can resolve stops the walk rather than being
 * treated as a win.
 */
export function duelStreak(
  sessions: Array<{ myPick: DuelPick | null; winner: DuelPick | "tie" | null }>
): number {
  let streak = 0;
  for (const session of sessions) {
    if (session.myPick == null) continue;
    if (session.winner == null) break;
    if (session.winner === "tie") continue;
    if (session.winner !== session.myPick) break;
    streak += 1;
  }
  return streak;
}

export function duelSessionLabel(
  sessionKey: string,
  now: Date = new Date()
): string {
  if (sessionKey === dateKeyInTz(now, US_TZ)) return "today";
  const [y, m, d] = sessionKey.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12)).toLocaleDateString(
    "en-US",
    { weekday: "long", timeZone: "UTC" }
  );
}

export function duelSessionCopy(
  sessionKey: string,
  now: Date = new Date()
): string {
  const when = duelSessionLabel(sessionKey, now);
  return when === "today"
    ? "Which one is higher when the US market closes today."
    : `Which one is higher when the US market closes on ${when}.`;
}

export type DuelPick = "a" | "b";
export type DuelOutcome = "pending" | "win" | "loss" | "push";

export type DuelRecord = {
  dayKey: string;
  tickerA: string;
  tickerB: string;
  pick: DuelPick | null;
  revealedPctA: number | null;
  revealedPctB: number | null;
  outcome: DuelOutcome;
};

export type DuelStats = {
  currentStreak: number;
  bestStreak: number;
  totalPlayed: number;
  totalCorrect: number;
  accuracyPct: number | null;
};

type DuelStorage = { history: DuelRecord[] };

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadStorage(): DuelStorage {
  if (typeof window === "undefined") return { history: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { history: [] };
    const parsed = JSON.parse(raw) as DuelStorage;
    return { history: Array.isArray(parsed.history) ? parsed.history : [] };
  } catch {
    return { history: [] };
  }
}

function saveStorage(s: DuelStorage) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ history: s.history.slice(-MAX_HISTORY) })
    );
  } catch {
    /* ignore */
  }
}

/** True once that session's regular US close (4pm ET) has passed. */
export function duelCanSettle(
  sessionKey: string,
  now: Date = new Date()
): boolean {
  if (isWeekendKey(sessionKey)) return false;
  return now.getTime() >= duelSessionCloseMs(sessionKey);
}

/** Deterministic pair for the session. Pass `salt` (a community id) so
 * each circle gets its own pair without changing the personal seed. */
export function pickTodaysDuel(
  tickers: string[],
  dayKey: string = currentDuelSessionKey(),
  salt = ""
): { a: string; b: string } | null {
  const pool = [...new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean))];
  if (pool.length < 2) return null;
  const rng = mulberry32(
    hashSeed(salt ? `upside-duel|${salt}|${dayKey}` : `upside-duel|${dayKey}`)
  );
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return { a: shuffled[0]!, b: shuffled[1]! };
}

/** Load (or create) today's matchup. Returns null if the book has <2 tickers. */
export function getOrCreateTodaysDuel(
  tickers: string[],
  dayKey: string = currentDuelSessionKey()
): DuelRecord | null {
  const storage = loadStorage();
  const existing = storage.history.find((r) => r.dayKey === dayKey);
  if (existing) return existing;

  const pair = pickTodaysDuel(tickers, dayKey);
  if (!pair) return null;

  const record: DuelRecord = {
    dayKey,
    tickerA: pair.a,
    tickerB: pair.b,
    pick: null,
    revealedPctA: null,
    revealedPctB: null,
    outcome: "pending",
  };
  saveStorage({ history: [...storage.history, record] });
  return record;
}

/**
 * Lock in a pick. Does not reveal session % until after the US close —
 * otherwise live quotes spoil the prediction.
 */
export function makeDuelPick(
  dayKey: string,
  pick: DuelPick,
  todayPctByTicker: Record<string, number | null | undefined>
): DuelRecord | null {
  const storage = loadStorage();
  const idx = storage.history.findIndex((r) => r.dayKey === dayKey);
  if (idx < 0) return null;
  const rec = storage.history[idx]!;
  if (rec.pick != null) return rec; // no take-backs

  const locked: DuelRecord = {
    ...rec,
    pick,
    revealedPctA: null,
    revealedPctB: null,
    outcome: "pending",
  };
  const updated = duelCanSettle(dayKey)
    ? resolveOutcome(locked, todayPctByTicker)
    : locked;
  const nextHistory = [...storage.history];
  nextHistory[idx] = updated;
  saveStorage({ history: nextHistory });
  return updated;
}

/** Settle a locked pick once the US cash session is done and quotes exist. */
export function resolvePendingOutcome(
  dayKey: string,
  todayPctByTicker: Record<string, number | null | undefined>
): DuelRecord | null {
  const storage = loadStorage();
  const idx = storage.history.findIndex((r) => r.dayKey === dayKey);
  if (idx < 0) return null;
  const rec = storage.history[idx]!;
  if (rec.pick == null || rec.outcome !== "pending") return rec;
  if (!duelCanSettle(dayKey)) return rec;

  const updated = resolveOutcome(rec, todayPctByTicker);
  if (updated.outcome === "pending") return rec;
  const nextHistory = [...storage.history];
  nextHistory[idx] = updated;
  saveStorage({ history: nextHistory });
  return updated;
}

function resolveOutcome(
  rec: DuelRecord,
  todayPctByTicker: Record<string, number | null | undefined>
): DuelRecord {
  if (rec.pick == null || !duelCanSettle(rec.dayKey)) {
    return {
      ...rec,
      revealedPctA: null,
      revealedPctB: null,
      outcome: "pending",
    };
  }
  const pctA = todayPctByTicker[rec.tickerA] ?? null;
  const pctB = todayPctByTicker[rec.tickerB] ?? null;
  if (pctA == null || pctB == null) {
    return {
      ...rec,
      revealedPctA: null,
      revealedPctB: null,
      outcome: "pending",
    };
  }
  let outcome: DuelOutcome;
  if (pctA === pctB) outcome = "push";
  else {
    const winner: DuelPick = pctA > pctB ? "a" : "b";
    outcome = rec.pick === winner ? "win" : "loss";
  }
  return { ...rec, revealedPctA: pctA, revealedPctB: pctB, outcome };
}

export function loadDuelHistory(): DuelRecord[] {
  return loadStorage().history;
}

/** Everything derives from history — no separately-mutated counters to drift. */
export function duelStats(history: DuelRecord[]): DuelStats {
  const decided = history.filter(
    (r) => r.outcome === "win" || r.outcome === "loss"
  );
  const totalPlayed = decided.length;
  const totalCorrect = decided.filter((r) => r.outcome === "win").length;

  let currentStreak = 0;
  for (let i = decided.length - 1; i >= 0; i--) {
    if (decided[i]!.outcome === "win") currentStreak++;
    else break;
  }

  let bestStreak = 0;
  let run = 0;
  for (const r of decided) {
    if (r.outcome === "win") {
      run++;
      bestStreak = Math.max(bestStreak, run);
    } else {
      run = 0;
    }
  }

  return {
    currentStreak,
    bestStreak,
    totalPlayed,
    totalCorrect,
    accuracyPct: totalPlayed > 0 ? totalCorrect / totalPlayed : null,
  };
}

const WIN_LINES = [
  (t: string) => `You called it. ${t} finished higher.`,
  (t: string) => `Good eye. ${t} won the day.`,
  (t: string) => `${t} came out ahead, just as you said.`,
  (t: string) => `Right on. ${t} finished higher.`,
];
const LOSS_LINES = [
  (t: string) => `Not this time. ${t} finished higher.`,
  (t: string) => `The other one won. ${t} finished higher today.`,
  (t: string) => `Close, but ${t} came out ahead.`,
  (t: string) => `${t} had the better day. Another go tomorrow.`,
];
const PUSH_LINE = "A tie. Both finished level.";

function pick<T>(seed: string, items: T[]): T {
  const rng = mulberry32(hashSeed(seed));
  return items[Math.floor(rng() * items.length) % items.length]!;
}

export function duelResultLine(rec: DuelRecord): string | null {
  if (rec.outcome === "pending") return null;
  if (rec.outcome === "push") return PUSH_LINE;
  const winnerTicker =
    (rec.revealedPctA ?? 0) >= (rec.revealedPctB ?? 0)
      ? rec.tickerA
      : rec.tickerB;
  const lines = rec.outcome === "win" ? WIN_LINES : LOSS_LINES;
  return pick(`${rec.dayKey}|${rec.outcome}`, lines)(winnerTicker);
}
