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

/** A finger that has moved this far is scrolling, not pressing. */
export const AIM_TAP_SLOP = 10;
/** A press held this long is asking for the browser's link preview. */
export const AIM_TAP_HOLD_MS = 700;
/** How long after the release the link's own click can still arrive. */
export const AIM_CLICK_FOLLOWS_MS = 300;

type PressLike = {
  currentTarget?: unknown;
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  clientX?: number;
  clientY?: number;
  timeStamp?: number;
  pointerId?: number;
};

/**
 * AIM A LINK ON THE PRESS, AND TAKE THE TAP WHERE IT WAS GOING.
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
 * **And the press must navigate by itself, because the aim destroys the
 * click that would have.** Aiming a circle from its row mounts the circle
 * on the press, and `WorkspaceShell` hides the list room the row is in.
 * A browser dispatches a click only when the press and the release land
 * on the same element, and the element under the release is now the new
 * room. Measured in Chromium with a harness that hides the pressed anchor
 * on `pointerdown`: with a mouse the click landed on `body`, with touch
 * it landed on the room, and in neither case did the anchor hear it, so
 * `<Link>` never navigated. The reader saw the circle they asked for,
 * the URL never moved, and `AIM_GIVES_UP_MS` later the list came back --
 * four seconds of the right room followed by the wrong one.
 *
 * So the tap is judged here, on the same evidence the dock uses: the
 * release came inside `AIM_TAP_HOLD_MS` and the pointer never wandered
 * past `AIM_TAP_SLOP`. That is a tap and `go` is called with the path.
 * The release's target is deliberately not consulted: it is the one
 * reading the aim itself has made unreliable. If the anchor is still on
 * screen and does fire its click, that click is `preventDefault`ed,
 * which Next's `<Link>` stands down on, so no room is entered twice.
 *
 * A row in a scrolling list is not a hard target the way a dock cell is,
 * so the ways this stands down are stricter than the dock's: a finger
 * that moved past the slop is scrolling, `pointercancel` (which is what a
 * scroll actually fires once the browser claims the gesture) is a scroll,
 * and a hold is a long press. All three call the aim off, and the same
 * `AIM_GIVES_UP_MS` backstop the dock uses covers a press that never
 * releases at all.
 */
export function aimOnPress(
  event: PointerEvent | MouseEvent,
  path: string,
  go?: (path: string) => void
) {
  const e = event as unknown as PressLike;
  /*
   * A middle click or a held modifier opens the address in another tab,
   * and moving this tab to a room it is not going to is the one way this
   * is worse than waiting.
   */
  if (e.button !== 0) return;
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  if (typeof window === "undefined") return;

  /*
   * Duck-typed rather than `instanceof Element`, so this can be tested.
   * `Element` is a browser global and this repo's tests run in node.
   */
  const el = e.currentTarget as {
    addEventListener?: (t: string, fn: (ev: Event) => void) => void;
    removeEventListener?: (t: string, fn: (ev: Event) => void) => void;
  } | null;
  const from = { x: e.clientX ?? 0, y: e.clientY ?? 0 };
  const pressedAt = e.timeStamp ?? 0;
  const pointerId = e.pointerId;
  let strayed = false;
  let went = false;

  aimRoute(path);

  let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timer = null;
    standDown();
  }, AIM_GIVES_UP_MS);

  function standDown() {
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onCancel, true);
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function samePointer(ev: Event) {
    const id = (ev as { pointerId?: number }).pointerId;
    return pointerId === undefined || id === undefined || id === pointerId;
  }

  function onMove(ev: Event) {
    if (!samePointer(ev)) return;
    const m = ev as { clientX?: number; clientY?: number };
    if (
      Math.hypot((m.clientX ?? 0) - from.x, (m.clientY ?? 0) - from.y) >
      AIM_TAP_SLOP
    ) {
      strayed = true;
    }
  }

  function onCancel(ev: Event) {
    if (!samePointer(ev)) return;
    standDown();
    aimRoute(null);
  }

  function onUp(ev: Event) {
    if (!samePointer(ev)) return;
    standDown();
    const held = ((ev as { timeStamp?: number }).timeStamp ?? 0) - pressedAt;
    if (strayed || held > AIM_TAP_HOLD_MS) {
      aimRoute(null);
      return;
    }
    /* Without a navigator the anchor's own click still does the work. */
    if (!go) return;
    went = true;
    go(path);
  }

  /*
   * The anchor's own click, if it still arrives, must not enter the room
   * a second time. Only for as long as a click can follow a release.
   */
  function onClick(ev: Event) {
    el?.removeEventListener?.("click", onClick);
    if (went) ev.preventDefault();
    else went = true;
  }
  if (el?.addEventListener) {
    el.addEventListener("click", onClick);
    setTimeout(
      () => el.removeEventListener?.("click", onClick),
      AIM_GIVES_UP_MS + AIM_CLICK_FOLLOWS_MS
    );
  }

  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onCancel, true);
}
