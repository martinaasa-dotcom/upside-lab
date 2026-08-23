/**
 * Which walkthrough is current, and therefore who is owed one.
 *
 * Raise this by one and every reader in the database is behind it again, so
 * everybody — including someone who signed in yesterday and has owned things
 * here for months — gets the new walkthrough on their next visit, once. That
 * is the whole mechanism: there is no "reset onboarding" script to run and no
 * flag to clear anywhere.
 *
 * Raise it only when the walkthrough says something materially different.
 * Fixing a typo in it and re-interrupting everybody is a worse trade than the
 * typo.
 *
 * 1 — the first walkthrough that actually explains the app (2026-08-23). What
 *     it replaces asked two questions about the reader and said four
 *     sentences about the product, and had been switched off since
 *     2026-08-18 besides.
 */
export const WELCOME_TOUR_VERSION = 1;

const STORAGE_KEY = "portfell-welcome-tour";

/**
 * The browser's copy of the server's number.
 *
 * Only ever an optimisation: the server row is the truth, and the gate does
 * not decide anything from this alone. It exists so a reader who has just
 * finished the walkthrough does not see it flicker back on the next
 * navigation while the profile fetch is still in flight.
 */
export function loadSeenTourVersion(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const n = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function saveSeenTourVersion(version: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(version));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Asking for it again from Account. Zero is "has never seen one". */
export function clearSeenTourVersion() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Fired when Account asks for a replay, so the gate re-opens without a reload. */
export const WELCOME_TOUR_EVENT = "upside:welcome-tour";

export function requestWelcomeTour() {
  if (typeof window === "undefined") return;
  clearSeenTourVersion();
  window.dispatchEvent(new Event(WELCOME_TOUR_EVENT));
}

export function tourIsDue(seenVersion: number | null | undefined): boolean {
  return (seenVersion ?? 0) < WELCOME_TOUR_VERSION;
}
