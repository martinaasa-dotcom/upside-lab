/**
 * When the numbers on screen are STUCK, and what to call it.
 *
 * The hero used to go grey whenever the last fetch was older than the
 * view-freshness bar, which during the session is fifteen seconds while
 * the poll ran every thirty: the "updating" badge was on screen for the
 * back half of every cycle, over a price that was exactly as current as
 * the app could make it, and a reader learned to read it as decoration.
 * Worse, the stamp it read was the OLDEST print in the payload, so one
 * delisted or foreign name served from the server's cache greyed the
 * whole portfolio for as long as the reader held it.
 *
 * Grey means one thing now: the app could not get a current price. That
 * is the browser being offline, the last fetch having failed (a refused
 * request, a provider answering with nothing but its cache), or the poll
 * that should have replaced the figure having had two whole cycles to do
 * so and not done it. Between polls the figure is the newest one there
 * is and it is drawn at full weight.
 *
 * Pure, so the rule can be tested against a clock rather than a screen.
 */

import { quoteStuckAfterMs } from "@/lib/market/session";

export type QuoteHealthInput = {
  /** When the last successful fetch landed, or the saved snapshot's age. */
  fetchedAt: number | null | undefined;
  /** The last attempt failed, or answered with nothing live. */
  failing: boolean;
  /** `navigator.onLine`; a browser with no network is stuck by definition. */
  online: boolean;
  now?: number;
  at?: Date;
};

/** How stale a figure may be before a failed fetch counts against it. */
const FAILURE_GRACE_MS = 20_000;

export function quotesStuck({
  fetchedAt,
  failing,
  online,
  now = Date.now(),
  at = new Date(now),
}: QuoteHealthInput): boolean {
  if (!online) return true;
  if (fetchedAt == null || !Number.isFinite(fetchedAt)) return true;
  const age = now - fetchedAt;
  if (age < 0) return false;
  /*
    A failed poll does not grey the figure on its own: the previous
    answer is seconds old and the quick retry is already scheduled. It
    greys once the failure has cost the reader a real gap, so a single
    blip that the retry repairs never reaches the screen.
  */
  if (failing && age >= FAILURE_GRACE_MS) return true;
  return age >= quoteStuckAfterMs(at);
}

/**
 * The words beside a stuck figure, in the reader's own terms.
 *
 * "updating" while the gap is short enough that the fetch in flight is the
 * whole story; the age once it is not, because "updating" over a figure
 * that has not moved in an hour is a promise the app is not keeping.
 */
export function quotesAgeLabel(
  fetchedAt: number | null | undefined,
  online: boolean,
  now: number = Date.now()
): string {
  if (!online) return "offline";
  if (fetchedAt == null || !Number.isFinite(fetchedAt)) return "updating";
  const sec = Math.max(0, Math.round((now - fetchedAt) / 1000));
  if (sec < 60) return "updating";
  const min = Math.round(sec / 60);
  if (min < 60) return `as of ${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `as of ${hr}h ago`;
  return `as of ${Math.round(hr / 24)}d ago`;
}
