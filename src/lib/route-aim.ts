/**
 * THE PAGE CHANGES ON THE PRESS, NOT WHEN THE ROUTER FINISHES.
 *
 * Next's `<Link>` navigates inside `startTransition`, and the defining
 * behaviour of a transition is that **the old screen stays until the new
 * one is completely built**. Measured frame by frame off a screencast of
 * the real app at 4x CPU, tapping Growth: for 600ms only about 2% of the
 * pixels changed -- the dock marker, and nothing else -- and then 21% of
 * the screen swapped in a single frame. Nothing, nothing, then everything.
 *
 * That is what "the page selects feel slow" is. It is not the total time,
 * which at 1x is 70-180ms of ordinary work; it is that a tap buys no
 * answer at all until the very end. The dock already refuses to wait for
 * the router before moving its marker, for exactly this reason. This is
 * the same idea applied to the thing the reader is actually looking at.
 *
 * A press publishes where it is going. The book hears it and shows that
 * tab immediately, with an ordinary state update rather than a transition,
 * so it renders on the next frame. The router's URL is still the source of
 * truth and still settles it; this only fills the gap.
 *
 * It is a bet, so it can lose, and it loses the same three ways the
 * marker's does: the room answers with somewhere else, nothing answers
 * inside `AIM_GIVES_UP_MS`, or the press never became a navigation. Losing
 * is cheap here -- the reader sees the room they asked for and then the
 * room they got, which is what they would have seen anyway.
 */

export type RouteAimListener = (path: string | null) => void;

const listeners = new Set<RouteAimListener>();

/** How long a room has to answer before the bet is off. */
export const AIM_GIVES_UP_MS = 4000;

/** Say where a press is going, so the room that owns it can show it now. */
export function aimRoute(path: string | null) {
  for (const listener of listeners) listener(path);
}

/** Hear presses. Returns the unsubscribe. */
export function onRouteAim(listener: RouteAimListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
