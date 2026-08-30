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

/**
 * AIM A LINK ON THE PRESS, AND CALL IT OFF IF THE PRESS WAS A SCROLL.
 *
 * The dock does this itself, in `use-dock-marker`, because it has a marker
 * to move on the same press. Anything else that wants the room to change
 * on touch-down uses this.
 *
 * **It has to be `pointerdown`, and that was measured rather than
 * assumed.** Publishing from `onClick` reads as the safe choice -- the
 * browser only fires a click when the press and the release land on the
 * same element, so a drag can never be mistaken for a tap -- but it buys
 * nothing: a click handler runs in the same event as the navigation it is
 * attached to, React batches the aim with the transition, and the aim gets
 * no head start. Measured opening a circle at 4x CPU, the room appeared at
 * 514ms from a click and 457ms from the press.
 *
 * So the drag has to be ruled out afterwards instead. A row in a scrolling
 * list is not a hard target the way a dock cell is: a finger that lands on
 * one and then moves is starting a scroll, and flashing up a room nobody
 * asked for is worse than the 57ms. The release decides. `pointerup`
 * outside the element, `pointercancel` (which is what a scroll actually
 * fires once the browser claims the gesture), and the same
 * `AIM_GIVES_UP_MS` backstop the dock uses all call it off.
 */
export function aimOnPress(event: PointerEvent | MouseEvent, path: string) {
  /*
   * Duck-typed rather than `instanceof Node`, so the release rule can be
   * tested. `Node` is a browser global and this repo's tests run in node.
   */
  const el = event.currentTarget as { contains?: (n: unknown) => boolean } | null;
  /*
   * A middle click or a held modifier opens the address in another tab,
   * and moving this tab to a room it is not going to is the one way this
   * is worse than waiting.
   */
  if (event.button !== 0) return;
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  if (typeof window === "undefined") return;

  aimRoute(path);

  let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timer = null;
    standDown();
  }, AIM_GIVES_UP_MS);

  function standDown() {
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onCancel, true);
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function onCancel() {
    standDown();
    aimRoute(null);
  }

  function onUp(e: Event) {
    standDown();
    /* A press dragged off the row is not a tap. */
    const landed = el?.contains?.(e.target) ?? false;
    if (!landed) aimRoute(null);
  }

  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onCancel, true);
}
