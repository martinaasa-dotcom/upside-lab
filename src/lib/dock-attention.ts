/**
 * A one-time nudge toward the bottom dock, for a reader who has been away
 * long enough that they might not remember it is there at all.
 *
 * The dock is deliberately quiet chrome (thin glass, muted icons, no
 * standing labels -- see `dock.css`), which is right for somebody who
 * already knows it is there and wrong for somebody who does not: a
 * reader who used the app for ten minutes once, weeks ago, and has not
 * been back since has no reason to remember a control that never asked
 * for their attention in the first place. The welcome tour teaches it
 * once on the way in; this is the same lesson repeated, but only when
 * enough time has passed that it is plausible the first one did not
 * stick, never on every visit.
 *
 * Kept local rather than a profile column: this is a cosmetic nudge, not
 * a fact about the account, and it does not need to follow a reader
 * across devices the way `welcome_tour_version` does. A cleared browser
 * or a second device simply sees it again, which costs nothing.
 */

const STORAGE_KEY = "upside-dock-cue-last-seen-v1";

/**
 * How long a reader has to be away before the cue is worth showing again.
 * Two weeks: long enough that a reader who checks in most days never sees
 * it twice, short enough that somebody who tried the app once and did not
 * come back for a month gets the reminder on the visit that matters.
 */
export const DOCK_CUE_IDLE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * True when the cue is due: no record at all (first real visit past the
 * tour, or a cleared browser), or the gap since it was last shown/reset
 * is at least the idle window.
 */
export function dockCueDue(
  lastSeenAt: number | null,
  now: number = Date.now()
): boolean {
  if (lastSeenAt == null || !Number.isFinite(lastSeenAt)) return true;
  return now - lastSeenAt >= DOCK_CUE_IDLE_MS;
}

export function loadDockCueLastSeen(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Marks the clock as reset from `now`, whether or not the cue actually
 * fired. Every mount that checks `dockCueDue` writes this, so the first
 * one to see a stale (or absent) record wins the check and every other
 * dock instance mounted afterwards -- a reader visiting several rooms in
 * one sitting mounts a separate dock per room, see `dock-motion.test.ts`
 * -- correctly reads the gap as freshly closed rather than each firing
 * its own cue.
 */
export function recordDockCueSeen(now: number = Date.now()) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(now));
  } catch {
    /* ignore quota / private mode */
  }
}
