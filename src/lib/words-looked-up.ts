import { todayKeyInTz } from "@/lib/timezone";

/**
 * The words this reader has opened, and when.
 *
 * A record, not a score. The rule `visit-streak.ts` settled applies here
 * with more force, because this one is about learning and learning is
 * exactly where an app is most tempted to hand somebody a badge: nothing
 * built on this may celebrate a number, warn about losing one, set a
 * target, or tell the reader they are getting good at this. What it may do
 * is show them the words they found worth asking about, which is a useful
 * thing to have and is theirs.
 *
 * Honest by construction is the whole design. Only an opened definition is
 * written here -- not one that was on screen, not one in a room they
 * visited, not one this app decided they ought to know. So the list can
 * never claim something that did not happen, and a reader who has looked
 * up two words is shown two words rather than a progress bar at 7%.
 *
 * Purely local to this browser, like the visit count, and cleared with
 * everything else when a session is purged: the key carries the `upside-`
 * prefix `purge-session.ts` sweeps, so the next account on a shared
 * machine does not inherit somebody's reading.
 */

const KEY = "upside-words-looked-up-v1";

/**
 * A ceiling so a browser cannot accumulate an unbounded record, set well
 * above the glossary's own size: the list is one entry per distinct word,
 * and there are thirty words, so this can only bind if the glossary grows
 * fivefold. Oldest first out.
 */
const MAX_WORDS = 200;

export type WordLookedUp = {
  /** The glossary id, which is the stable thing. */
  id: string;
  /** Day key it was first opened. */
  first: string;
  /** Day key it was last opened. */
  last: string;
  /** How many times, which says which words did not stick first time. */
  times: number;
};

export type WordsLookedUp = Record<string, WordLookedUp>;

function read(): WordsLookedUp {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: WordsLookedUp = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const row = value as Partial<WordLookedUp>;
      if (typeof row.first !== "string" || typeof row.last !== "string") continue;
      out[id] = {
        id,
        first: row.first,
        last: row.last,
        times: Number.isFinite(row.times) ? Math.max(1, Number(row.times)) : 1,
      };
    }
    return out;
  } catch {
    /* storage off, or somebody else's JSON. An empty record is the right
       answer to both: this is a record of reading, not something to fail
       a room over. */
    return {};
  }
}

function write(words: WordsLookedUp): void {
  if (typeof window === "undefined") return;
  try {
    const entries = Object.values(words);
    const kept =
      entries.length <= MAX_WORDS
        ? entries
        : [...entries]
            .sort((a, b) => (a.last < b.last ? -1 : a.last > b.last ? 1 : 0))
            .slice(entries.length - MAX_WORDS);
    const out: WordsLookedUp = {};
    for (const row of kept) out[row.id] = row;
    window.localStorage.setItem(KEY, JSON.stringify(out));
  } catch {
    /* a browser with storage switched off simply keeps no record */
  }
}

export function loadWordsLookedUp(): WordsLookedUp {
  return read();
}

/**
 * Record that a definition was opened. Called when the panel opens, never
 * when the trigger renders: a word sitting on screen is not a word
 * somebody asked about, and counting it would make the whole record a
 * claim about what the reader read.
 */
export function recordWordLookedUp(id: string, today?: string): void {
  const key = id.trim();
  if (!key) return;
  const day = today ?? todayKeyInTz();
  const words = read();
  const prev = words[key];
  words[key] = prev
    ? { ...prev, last: day, times: prev.times + 1 }
    : { id: key, first: day, last: day, times: 1 };
  write(words);
}

/** Test seam. */
export function clearWordsLookedUpForTests(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
