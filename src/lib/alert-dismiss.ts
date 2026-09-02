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
