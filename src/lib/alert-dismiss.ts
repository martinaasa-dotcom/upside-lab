/**
 * Two lists, and merging them is what emptied the Alerts room.
 *
 * "We have already popped a toast for this" and "the reader has dealt with
 * this" look like the same fact and are not. The room used one set for both:
 * the effect that toasts an alert wrote its id into the set, and the room
 * drew `alerts` minus that set, so an alert was gone from the room in the
 * same tick it first appeared in it. The set is persisted, so it never came
 * back, and the dock's news dot counted the same empty list. What a reader
 * saw was a toast about their margin sliding past a line, and then a room
 * that said nothing needed their attention, forever.
 *
 * So: `toasted` is written by the app and only ever stops toast spam, and
 * `dismissed` is written by nobody but a reader pressing Dismiss.
 *
 * The dismissed key is v2 on purpose. The v1 key on every existing reader's
 * device holds ids the toast effect wrote, which mean "toasted", so reading
 * it as "dismissed" would keep exactly the readers this fixes shut out of
 * the room. It is left where it is and read as the toast list, which is what
 * its contents have always actually meant.
 *
 * A third list joined them later and is a different kind of thing: not what
 * has been shown or waved off, but when each condition was first true and
 * when it was last true. See `reviseAlertMemory` below for what it buys.
 */

const TOASTED_KEY = "upside-alerts-dismissed-v1";
const DISMISSED_KEY = "upside-alerts-dismissed-v2";

/** Ids are short and a reader accumulates few, but the cap keeps it bounded. */
const KEEP = 200;

function loadIds(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr.filter((s) => typeof s === "string") : []);
  } catch {
    return new Set();
  }
}

function saveIds(key: string, ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify([...ids].slice(-KEEP)));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Alerts a toast has already been shown for. Never hides anything. */
export function loadToastedAlertIds(): Set<string> {
  return loadIds(TOASTED_KEY);
}

export function saveToastedAlertIds(ids: Set<string>) {
  saveIds(TOASTED_KEY, ids);
}

/** Alerts the reader has waved off. The only thing that empties the room. */
export function loadDismissedAlertIds(): Set<string> {
  return loadIds(DISMISSED_KEY);
}

export function saveDismissedAlertIds(ids: Set<string>) {
  saveIds(DISMISSED_KEY, ids);
}

/**
 * When each condition was first true, and when it was last true.
 *
 * Two things needed this and both were quietly wrong without it.
 *
 * A card could not say since when. Every alert carried `at: Date.now()`
 * stamped inside the memo that builds the list, so it was re-stamped on
 * every recompute and meant nothing; the stamp is gone from the alert and
 * lives here instead, where it is written once, the first time a condition
 * is seen, and read back as "Since Tuesday".
 *
 * And a dismissal was forever. Waving off "$NVDA reached the level the app
 * had pencilled in" in March meant never being told about crossing it
 * again in September, because the id carries no date and the set is
 * persisted. Two ways out were available: bucket the id by month, or
 * forget the dismissal once the condition itself has gone away. This is
 * the second, because it is the one that keys on the thing rather than on
 * the calendar: a loan that stays large is one fact and the reader has
 * dealt with it, however many months pass, and a target crossed twice is
 * genuinely two pieces of news. Absence is given `LAPSE_MS` before it
 * counts, so a price hovering either side of a level over an afternoon
 * does not resurrect a card the reader has already dismissed.
 */
const SEEN_KEY = "upside-alerts-seen-v1";

/** How long a condition must be gone before the app forgets it happened. */
export const LAPSE_MS = 7 * 24 * 60 * 60 * 1000;

export type AlertSeen = {
  /** When this condition was first true on this device. */
  first: number;
  /** The last recompute that still found it true. */
  last: number;
};

export function loadAlertSeen(): Record<string, AlertSeen> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, AlertSeen> = {};
    for (const [id, value] of Object.entries(parsed)) {
      const row = value as Partial<AlertSeen> | null;
      const first = Number(row?.first);
      const last = Number(row?.last);
      if (Number.isFinite(first) && Number.isFinite(last)) {
        out[id] = { first, last };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveAlertSeen(seen: Record<string, AlertSeen>) {
  if (typeof window === "undefined") return;
  try {
    // Newest last, so the cap drops the conditions longest gone.
    const rows = Object.entries(seen)
      .sort((a, b) => a[1].last - b[1].last)
      .slice(-KEEP);
    localStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries(rows)));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Bring the memory up to date with the conditions that are true right now.
 *
 * Pure, so the whole rule can be tested without a browser. `changed` is
 * whether anything is worth writing back: this runs on every recompute of
 * the alert list, and a `localStorage` write per recompute for a set that
 * has not moved is work nobody asked for.
 */
export function reviseAlertMemory(input: {
  seen: Record<string, AlertSeen>;
  dismissed: Set<string>;
  toasted: Set<string>;
  liveIds: string[];
  now: number;
  lapseMs?: number;
}): {
  seen: Record<string, AlertSeen>;
  dismissed: Set<string>;
  toasted: Set<string>;
  changed: boolean;
} {
  const lapseMs = input.lapseMs ?? LAPSE_MS;
  const seen: Record<string, AlertSeen> = { ...input.seen };
  const dismissed = new Set(input.dismissed);
  const toasted = new Set(input.toasted);
  const live = new Set(input.liveIds);
  let changed = false;

  for (const id of live) {
    const row = seen[id];
    if (!row) {
      seen[id] = { first: input.now, last: input.now };
      changed = true;
      continue;
    }
    // A whole day of granularity is all "since Tuesday" needs, and it keeps
    // the write down to one a day for a condition that is simply still true.
    if (input.now - row.last > 60 * 60 * 1000) {
      seen[id] = { first: row.first, last: input.now };
      changed = true;
    }
  }

  for (const [id, row] of Object.entries(seen)) {
    if (live.has(id)) continue;
    if (input.now - row.last <= lapseMs) continue;
    delete seen[id];
    changed = true;
    if (dismissed.delete(id)) changed = true;
    if (toasted.delete(id)) changed = true;
  }

  return { seen, dismissed, toasted, changed };
}

