"use client";

import { aimRoute } from "@/lib/route-aim";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type DockDir,
  type DockMark,
  DOCK_MOTION,
  type DockVariant,
  GHOST_LAG_MS,
  GHOST_MS,
  markGeometry,
  restingStyle,
  sameMark,
  swellFrames,
  travelDirection,
  travelKeyframes,
} from "@/lib/dock-motion";

export type { DockDir, DockMark } from "@/lib/dock-motion";

export type DockMarkerState = {
  ref: React.RefObject<HTMLDivElement | null>;
  /** The current room's cell, as two insets. Null when no cell is on. */
  mark: DockMark | null;
  /** Which way the marker last went, so the leading edge can lead. */
  dir: DockDir;
  /** The cell under the pointer or the keyboard, as two insets. */
  hover: DockMark | null;
  hoverDir: DockDir;
  /** Whether anything is under the pointer right now. */
  hovering: boolean;
  /** False until the marker has been placed once, so it does not fly in. */
  travels: boolean;
};

/**
 * How long the marker will stand where a press put it with no answer from
 * the room. Long on purpose: see the press effect below.
 */
const AIM_GIVES_UP_MS = 4000;

/**
 * How long after the finger comes up a click has to arrive before the
 * press is judged not to have been a tap at all.
 *
 * A tap dispatches its click about 2ms after `pointerdown` (measured on
 * the real bar), so any number here is generous; what it must not be is
 * the four seconds above. On a phone a press on the dock very often does
 * not become a click: a touch that lands while the page is still flinging
 * is spent stopping the fling, and a thumb that drifts a couple of pixels
 * starts a pan. Both leave `pointerup` on the cell and no navigation
 * behind it, which is the one way out of the three that neither the
 * release rule nor `pointercancel` can see.
 */
const CLICK_FOLLOWS_MS = 300;

function markOf(cell: HTMLElement): DockMark {
  return markGeometry(cell.offsetLeft, cell.offsetWidth);
}

/**
 * Move a pane to a cell on the compositor.
 *
 * The resting width and transform go on the element first, so it is
 * correct the instant the animation ends and `scaleX` is exactly 1 while
 * it stands still. Then the travel is played over the top from where the
 * pane actually was. `fill` is left alone deliberately: the element's own
 * style is already the destination.
 */
function glide(
  el: HTMLElement | null,
  from: DockMark | null,
  to: DockMark,
  running: { current: Animation | null },
  opts: { durationMs: number; lagMs: number }
) {
  if (!el) return;
  Object.assign(el.style, restingStyle(to));
  /*
   * A duration of zero is a dock saying it does not travel: the resting
   * geometry above is already the whole answer, and the marker arrives on
   * the cell rather than crossing the bar to reach it. The laptop dock
   * asks for this; see `DOCK_MOTION.wide.travelMs`.
   */
  if (opts.durationMs <= 0) return;
  if (!from || typeof el.animate !== "function" || stillMotion()) return;
  if (from.left === to.left && from.width === to.width) return;
  running.current?.cancel();
  running.current = el.animate(travelKeyframes(from, to, opts), {
    duration: opts.durationMs,
  });
}

/**
 * A BAR IN A HIDDEN ROOM MUST NOT MEASURE ITSELF, AND THIS IS THE WHOLE
 * REASON THE MARKER COULD END UP ON THE WRONG CELL.
 *
 * `WorkspaceShell` keeps every room you have visited mounted behind
 * `hidden`, and each room draws its own dock, so there are two of these on
 * the book and three once you have been to Circle. A hidden element has no
 * layout box, so `offsetLeft` and `offsetWidth` are both **0** -- and
 * measuring one records `{left: 0, width: 0}` as the marker's last known
 * place. The next time that room is shown, the travel is computed from
 * there, which is a zero-width pill at the far left sweeping across the
 * whole bar to reach the cell you are actually on.
 *
 * Worse, the cell you PRESS belongs to the bar that is about to be hidden,
 * while the bar you end up looking at is a different element with a
 * different hook instance. A bet placed on one bar and settled on another
 * is incoherent by construction.
 *
 * So: no layout box, no measuring, no animating, no state written. And the
 * first measure after a room is shown again ARRIVES rather than travels,
 * because whatever the reader last saw on that bar is not a place the
 * marker should be seen crossing back from.
 *
 * THE ANSWER IS CACHED, AND THAT IS NOT AN OPTIMISATION FOR ITS OWN SAKE.
 * `measure` runs in a layout effect with no dependency list, so it runs
 * after every render of the bar, and a route change renders it many times;
 * asking `getClientRects()` there forces a synchronous layout of the whole
 * document, once per render per mounted dock, of which there are up to
 * three. Profiled on one Pulse hop at 4x CPU it was **323ms of 942ms, 16%
 * of the whole navigation**, which is more than the marker's own work by a
 * wide margin. The ResizeObserver already watching the host hands the size
 * over for free (a hidden element reports 0x0), so the check becomes a ref
 * read and the layout is forced once, at mount.
 */
function onScreen(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

function stillMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * The capsule's own breath, run on the well itself for the length of one
 * travel. See `swellFrames` for where the numbers come from.
 *
 * The Web Animations API rather than a class the CSS animates, because
 * this has to restart on every travel and two journeys in the same
 * direction do not change a single attribute between them, so nothing in
 * the markup would tell CSS to run it again. One call per navigation, no
 * per-frame work, and `scaleX` alone so the browser can keep it on the
 * compositor.
 *
 * It transforms the capsule and everything in it together, which is the
 * point: a marker that stretched inside a rigid tray would read as two
 * materials. The marker's own geometry is measured from `offsetLeft` and
 * `clientWidth`, which are layout and untouched by a transform, so the
 * measurement stays still while the picture stretches.
 */
function swell(
  host: HTMLElement,
  dir: DockDir,
  running: { current: Animation | null },
  tune: (typeof DOCK_MOTION)[DockVariant]
) {
  /*
   * The capsule itself, everything on it included. The bar is one object
   * and the reference moves all of it together; see `swellFrames` for the
   * measurements, and for why a one-axis scale is the thing to never do.
   */
  if (typeof host.animate !== "function" || stillMotion()) return;
  const frames = swellFrames(dir, tune.swellPeak);
  if (!frames) return;
  /*
   * Cancel the one in flight rather than stacking on it. Two animations of
   * the same property both apply, the newer one winning, so when the newer
   * finishes and drops off, an older one still running takes the bar back
   * over and it jumps. Tapping along the dock quickly is exactly how
   * somebody would find that.
   */
  running.current = host.animate(frames, { duration: tune.swellMs });
}

/**
 * The two panes behind a dock's cells: the marker that says which room you
 * are in, and the fainter one that follows your pointer.
 *
 * Both docks mark the current cell with `data-on` from the room id, never
 * from whether that room has rows, and every cell carries `data-dock-cell`
 * so the pointer can find the one under it. This hook is the only reader
 * of either flag, so the phone bar and the laptop bar cannot drift apart
 * on how a pane is found or when it is allowed to move.
 *
 * The hover pane is wired here rather than passed in as props on purpose:
 * it listens on the well itself, so a dock that grows a cell gets it with
 * nothing to remember. See `dock-motion.ts` for why a pane is two insets
 * rather than a position and a width.
 */
export function useDockMarker(variant: DockVariant = "wide"): DockMarkerState {
  const tune = DOCK_MOTION[variant];
  const router = useRouter();
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const [mark, setMark] = useState<DockMark | null>(null);
  const [dir, setDir] = useState<DockDir>(null);
  const [hover, setHover] = useState<DockMark | null>(null);
  const [hoverDir, setHoverDir] = useState<DockDir>(null);
  const [hovering, setHovering] = useState(false);
  const [travels, setTravels] = useState(false);

  /*
   * The last measurement, kept beside the state rather than read out of
   * it. Measuring runs after every render, so the comparison that decides
   * whether anything moved has to be readable without waiting for a
   * render, and a state updater is the wrong place to work out a direction
   * — React may call one twice.
   */
  const lastMark = useRef<DockMark | null>(null);
  const lastHover = useRef<DockMark | null>(null);
  /** The cell the pointer or the keyboard is on, so a resize can re-measure it. */
  const hoverCell = useRef<HTMLElement | null>(null);
  /** The capsule's breath, so a second travel replaces it rather than stacking. */
  const breathing = useRef<Animation | null>(null);
  /** The two panes' travels, so a second one replaces rather than stacks. */
  const gliding = useRef<Animation | null>(null);
  const ghosting = useRef<Animation | null>(null);
  /** The cell a press is betting on, until the router agrees or the bet is off. */
  const aimed = useRef<HTMLElement | null>(null);
  /*
   * The address the bar was showing when the bet was placed, which is what
   * "the router answered" is read against. See the settle rule in
   * `measure`: it cannot be read off `[data-on]`, because the bet moves
   * `[data-on]` itself.
   */
  const aimedFrom = useRef<string | null>(null);
  /*
   * Whether the rest of the app has been told where this press is going.
   * Kept apart from `aimed`, which is only the marker's own geometry: the
   * bar can stop betting for reasons of its own (its room was hidden, the
   * cell went) while the page is still drawing the room that was aimed
   * for, and the page has to be told either way.
   */
  const published = useRef(false);
  const aimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Waiting to see whether the release becomes a click. */
  const clickWatch = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The address on screen, readable from a layout effect with no deps. */
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  /*
   * Whether the press has already become a click, which is to say a
   * navigation is under way. See the press effect: a bet the router is
   * about to confirm must not be called off, or the marker walks all the
   * way home and all the way back for nothing.
   */
  const going = useRef(false);
  /** A bet being reverted arrives rather than travels. See `callOff`. */
  const reverting = useRef(false);
  /** Whether this bar's room was hidden when it was last looked at. */
  const wasHidden = useRef(false);
  /*
   * Whether the bar has a box, kept here rather than asked for. See
   * `onScreen`: asking costs a forced layout, and this is read after every
   * render. The observer below keeps it true.
   */
  const visible = useRef<boolean | null>(null);
  /*
   * The cell and the hovered cell this bar last measured, as ELEMENTS, so
   * the layout effect can tell "nothing I care about moved" from "measure
   * me" without touching layout to find out. See the early-out in
   * `measure`.
   */
  const lastTarget = useRef<HTMLElement | null>(null);
  const lastHoverEl = useRef<HTMLElement | null>(null);

  /*
   * Everything a bet leaves behind, dropped in one place. Deliberately
   * silent: it is called both when the router has answered (the page has
   * already settled on the new address by itself) and from `callOff`,
   * which is the one that speaks.
   */
  const forgetAim = useCallback(() => {
    aimed.current = null;
    aimedFrom.current = null;
    published.current = false;
    going.current = false;
    if (aimTimer.current) {
      clearTimeout(aimTimer.current);
      aimTimer.current = null;
    }
    if (clickWatch.current) {
      clearTimeout(clickWatch.current);
      clickWatch.current = null;
    }
  }, []);

  const measure = useCallback(() => {
    const host = ref.current;
    if (!host) return;
    if (visible.current === null) visible.current = onScreen(host);
    if (!visible.current) {
      /*
       * A hidden room's bar. Measuring here writes zeroes; see `onScreen`.
       * The marker's own bet goes with it, because the press that placed
       * it was on a bar the reader is no longer looking at.
       *
       * What the bet said to the PAGE outlives that, and has to, since
       * hiding this bar is usually the aim itself working: a press on
       * Circle mounts Circle's room on the press, which hides the book and
       * this bar with it, and a cancelled press still has to put the
       * reader back. So the backstop stays armed unless the address has
       * moved on -- and once it has, the bet is finished and the timer
       * must go, or it fires four seconds later and withdraws somebody
       * else's aim.
       */
      wasHidden.current = true;
      if (aimed.current && pathRef.current !== aimedFrom.current) forgetAim();
      else aimed.current = null;
      return;
    }
    /* Shown again: arrive on the cell, never travel across the bar to it. */
    const arriving = wasHidden.current;
    wasHidden.current = false;
    /*
     * Descendant, not `:scope >`. The laptop's folded picker puts `data-on`
     * on a trigger nested inside a dropdown, not on a direct child of the
     * well. A direct-child query would leave that cell unlit.
     */
    const on = host.querySelector<HTMLElement>("[data-on]");
    const pane = host.querySelector<HTMLElement>(".dock-marker");
    /*
     * A press outstanding, so the marker is already where the reader aimed
     * it and the router has not caught up yet.
     *
     * THE ROUTER SETTLES THE BET, AND `[data-on]` CANNOT, BECAUSE THE BET
     * IS WHAT MOVES `[data-on]`. This used to read `on === aimed.current`,
     * which was true while the lit cell came from `pathname` alone. It
     * stopped being true the moment the page started answering the press
     * too (`route-aim.ts`): the aim reaches `Dashboard` in the same event,
     * the room it names renders, and that render lights the pressed cell
     * -- so the very next `measure` declared the bet won, about two frames
     * after it was placed and long before the finger came up.
     *
     * That is not a cosmetic mistake, because every way this bar has of
     * standing down begins `if (!aimed.current) return`. With the bet
     * already cleared, a release that landed off the cell, a
     * `pointercancel`, and the four-second backstop all became no-ops, so
     * `aimRoute(null)` was never published and nothing told the page its
     * bet had lost. A press that never became a navigation left the whole
     * app showing a room it had not gone to for the full
     * `AIM_GIVES_UP_MS`, and then dropped the reader back where they
     * started with no explanation. Measured against the real app at
     * 390x844: press Home on `/lab`, cancel the press as a scroll does,
     * and Home is on screen for 4000ms before Lab returns.
     *
     * So the bet is over when the address changes -- to this cell's room
     * or, on a redirect, to another one, which is the same "the room
     * answered" either way -- and the marker stops betting on a cell that
     * has stopped existing. The timer stays armed in that second case,
     * since the page still has to be told.
     */
    if (aimed.current && pathRef.current !== aimedFrom.current) {
      forgetAim();
    } else if (aimed.current && !host.contains(aimed.current)) {
      aimed.current = null;
    }
    const target = aimed.current ?? on;

    /*
     * NOTHING BELOW THIS LINE MAY RUN ON AN ORDINARY RE-RENDER, BECAUSE
     * EVERYTHING BELOW IT READS LAYOUT.
     *
     * This effect has no dependency list on purpose (see below), so it runs
     * after every render of the bar -- and `markOf` reads `offsetLeft` and
     * `offsetWidth`, each of which forces the browser to recompute style
     * and layout for the document before it can answer. A route change
     * renders the bar many times, there are up to three bars mounted at
     * once, and the result was a stack of forced layouts per navigation.
     *
     * Measured on the real app at 4x CPU, against a baseline of 7ms of
     * style recalc over 2.2 idle seconds: a single hop was costing
     * **134-261ms of `UpdateLayoutTree`** for a document of about a
     * thousand elements, which is far more than styling that document once.
     *
     * What actually moves the marker is the active cell changing or the
     * pointer moving, both of which are element identity and cost nothing
     * to compare. Geometry changing under a still marker is the
     * ResizeObserver's job and always was. So an ordinary re-render now
     * costs two pointer comparisons and returns.
     */
    if (
      !arriving &&
      lastMark.current &&
      target === lastTarget.current &&
      hoverCell.current === lastHoverEl.current
    ) {
      return;
    }
    lastTarget.current = target;
    lastHoverEl.current = hoverCell.current;

    const next = target ? markOf(target) : null;
    if (!sameMark(lastMark.current, next)) {
      if (lastMark.current && next && !reverting.current && !arriving) {
        const heading = travelDirection(lastMark.current, next);
        setDir(heading);
        swell(host, heading, breathing, tune);
      }
      /*
       * A reverted bet ARRIVES, it does not travel. Reverting is a
       * correction, not a journey: animating it draws a second full trip
       * across the bar for a room the reader never went to, which is
       * exactly the thing they would report as a glitch.
       */
      if (next) glide(pane, reverting.current || arriving ? null : lastMark.current, next, gliding, {
        durationMs: tune.travelMs,
        lagMs: tune.lagMs,
      });
      lastMark.current = next;
      setMark(next);
    }

    const cell = hoverCell.current;
    const overIt =
      cell && host.contains(cell) && onScreen(cell) ? markOf(cell) : null;
    if (overIt && !sameMark(lastHover.current, overIt)) {
      if (lastHover.current) {
        setHoverDir(travelDirection(lastHover.current, overIt));
      }
      glide(
        host.querySelector<HTMLElement>(".dock-ghost"),
        lastHover.current,
        overIt,
        ghosting,
        { durationMs: GHOST_MS, lagMs: GHOST_LAG_MS }
      );
      lastHover.current = overIt;
      setHover(overIt);
    }
  }, [tune, forgetAim]);

  /*
   * No dependency list on purpose. What moves the marker is not one value
   * but the active id, the viewer's tier, how many cells are drawn, and
   * how long the labels turned out to be. Listing those goes stale;
   * measuring after every render does not, and the guard above converges
   * in one extra pass.
   */
  useLayoutEffect(() => {
    measure();
  });

  useEffect(() => {
    const host = ref.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver((entries) => {
      /*
       * The host's own entry answers "does this bar have a box" for free,
       * which is what keeps that question off the render path entirely.
       * A hidden room's bar reports 0x0.
       */
      for (const entry of entries) {
        if (entry.target === host) {
          visible.current = entry.contentRect.width > 0;
        }
      }
      /*
       * Geometry moved, which is the one thing the early-out above cannot
       * see, so clear the memory of what was measured and measure again.
       */
      lastTarget.current = null;
      measure();
    });
    watch.observe(host);
    /*
     * The cells, never every child. The two panes are children too, and
     * both of them change width continuously for the length of a travel
     * now that a pane is two insets — so observing them would put a
     * measurement, and the layout read inside it, on every frame of every
     * transition, to answer a question about cells that have not moved.
     */
    for (const cell of Array.from(
      host.querySelectorAll<HTMLElement>("[data-dock-cell]")
    )) {
      watch.observe(cell);
    }
    return () => watch.disconnect();
  }, [measure]);

  /*
   * The pointer's pane. Two sources, tracked apart: where the pointer is
   * and where the keyboard is. They have to be separate, because they come
   * and go independently and either one alone is reason to draw the pane.
   * One shared flag gets this wrong in a way you find immediately:
   * pressing a cell moves focus to it, which fires `focusout` on whatever
   * held focus before, and a single flag cleared there takes the pane away
   * from under the cursor that is still sitting on the cell.
   *
   * The pointer wins when both are on something, because it is the more
   * immediate of the two. On leaving, the geometry is kept and only the
   * flag drops, so the pane fades out where it was rather than snapping to
   * the left edge of the bar on its way to nothing.
   */
  useEffect(() => {
    const host = ref.current;
    if (!host) return;

    const cellUnder = (target: EventTarget | null): HTMLElement | null =>
      target instanceof Element
        ? target.closest<HTMLElement>("[data-dock-cell]")
        : null;

    let pointerOn: HTMLElement | null = null;
    let focusOn: HTMLElement | null = null;

    const settle = () => {
      const cell = pointerOn ?? focusOn;
      if (!cell) {
        setHovering(false);
        return;
      }
      hoverCell.current = cell;
      const next = markOf(cell);
      if (lastHover.current) setHoverDir(travelDirection(lastHover.current, next));
      glide(
        host.querySelector<HTMLElement>(".dock-ghost"),
        lastHover.current,
        next,
        ghosting,
        { durationMs: GHOST_MS, lagMs: GHOST_LAG_MS }
      );
      lastHover.current = next;
      setHover(next);
      setHovering(true);
    };

    const over = (e: PointerEvent) => {
      /*
       * A finger does not hover. Without this the pane is left sitting
       * under the last cell tapped, which on a phone is every cell the
       * reader has ever pressed, one at a time, forever.
       */
      if (e.pointerType === "touch") return;
      const cell = cellUnder(e.target);
      if (!cell || !host.contains(cell)) return;
      pointerOn = cell;
      settle();
    };

    const out = () => {
      pointerOn = null;
      settle();
    };

    const focus = (e: FocusEvent) => {
      const cell = cellUnder(e.target);
      if (!cell || !host.contains(cell)) return;
      /*
       * `:focus-visible`, not plain focus. Tapping a link focuses it, so a
       * bare `focusin` handler shows the pane on a phone and leaves it
       * under the last cell tapped, which is the exact failure the touch
       * guard above exists to prevent, arriving through the other door. The
       * browser already decides this question: it sets focus-visible for a
       * keyboard and withholds it for a pointer or a finger, which is the
       * same line we want.
       */
      if (typeof cell.matches === "function" && !cell.matches(":focus-visible")) {
        return;
      }
      focusOn = cell;
      settle();
    };

    const blur = () => {
      focusOn = null;
      settle();
    };

    host.addEventListener("pointerover", over);
    host.addEventListener("pointerleave", out);
    host.addEventListener("pointercancel", out);
    host.addEventListener("focusin", focus);
    host.addEventListener("focusout", blur);
    return () => {
      host.removeEventListener("pointerover", over);
      host.removeEventListener("pointerleave", out);
      host.removeEventListener("pointercancel", out);
      host.removeEventListener("focusin", focus);
      host.removeEventListener("focusout", blur);
    };
  }, []);

  /*
   * THE MARKER LEAVES ON THE PRESS, NOT ON THE ROUTE.
   *
   * `activeId` is read from `usePathname()`, so without this the marker
   * cannot begin moving until the App Router commits the new route. Every
   * bit of the motion above is downstream of that, which means the whole
   * bar is tied to the network rather than to the finger. Prefetching
   * makes the wait short on a good connection; short and attached are
   * different feelings, and the gap widens exactly when the connection is
   * worst. iOS moves its indicator on touch-down, and this is that.
   *
   * It is a bet, so it has to be able to lose. Three ways it is called off:
   * the release landed somewhere other than the cell (a press dragged off
   * is not a tap), the room answered with a different cell than the one
   * predicted, or nothing happened at all inside `AIM_GIVES_UP_MS`. The
   * last is the backstop for a navigation that is silently refused, and it
   * is long on purpose: snapping the marker home mid-wait would look far
   * more broken than letting it sit where the reader put it.
   */
  useEffect(() => {
    const host = ref.current;
    if (!host) return;

    /*
     * The bet lost. Withdraw it from the page as well as from the bar.
     *
     * `published` rather than `aimed` decides whether there is anything to
     * say, because the two come apart: this bar stops betting the moment
     * its room is hidden or its cell goes, and the page is still drawing
     * the room the press asked for until somebody tells it otherwise.
     */
    const callOff = () => {
      const cell = aimed.current;
      const told = published.current;
      if (!cell && !told) return;
      aimed.current = null;
      if (told) aimRoute(null);
      aimedFrom.current = null;
      published.current = false;
      going.current = false;
      if (aimTimer.current) {
        clearTimeout(aimTimer.current);
        aimTimer.current = null;
      }
      if (clickWatch.current) {
        clearTimeout(clickWatch.current);
        clickWatch.current = null;
      }
      if (!cell) return;
      reverting.current = true;
      try {
        measure();
      } finally {
        reverting.current = false;
      }
    };

    const aim = (cell: HTMLElement) => {
      const host2 = ref.current;
      if (!host2 || !host2.contains(cell)) return;
      if (cell === host2.querySelector("[data-on]")) return;
      /*
       * WARM THE ROOM ON THE PRESS, NOT ON THE COMMIT.
       *
       * Measured on the real bar, a tap dispatches its click about 2ms
       * after `pointerdown`, so nothing about the navigation is waiting on
       * the motion above -- what a reader reads as the animation gating the
       * page is the two simply finishing together. Every cell here is a
       * `<Link prefetch>` and the dock is never out of the viewport, so
       * most of these are already warm; this covers the ones that are not.
       * The Circle cell's href is resolved in the browser (`useCircleHref`)
       * and changes after mount, so the payload Link warmed can be for the
       * wrong address, and a portfolio cell added while the page is open
       * has never had its turn. `router.prefetch` on an address already in
       * the cache is a no-op, so the cost of asking is nothing and the
       * saving on a cold one is the whole round trip.
       */
      const href = cell.getAttribute("href");
      if (href) {
        try {
          router.prefetch(href);
        } catch {
          /* A dialog cell or a menu trigger has no address to warm. */
        }
        /*
         * And tell whoever owns that address that it is coming, so the
         * page can change on the press rather than when the router
         * finishes. See `route-aim.ts` for the measurement behind it.
         */
        aimRoute(href);
        published.current = true;
      }
      aimed.current = cell;
      aimedFrom.current = pathRef.current;
      going.current = false;
      if (aimTimer.current) clearTimeout(aimTimer.current);
      if (clickWatch.current) {
        clearTimeout(clickWatch.current);
        clickWatch.current = null;
      }
      aimTimer.current = setTimeout(callOff, AIM_GIVES_UP_MS);
      measure();
    };

    const press = (e: PointerEvent) => {
      /*
       * Only a plain primary press goes anywhere in this tab. A middle
       * click or a held modifier opens the room in a new one, and the
       * marker moving for a room the reader is still not in is the one
       * way this can be worse than waiting.
       */
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const cell =
        e.target instanceof Element
          ? e.target.closest<HTMLElement>("[data-dock-goes]")
          : null;
      if (cell) aim(cell);
    };

    /*
     * A release anywhere but on the cell it started on is not a tap, and
     * no navigation follows it. `document` rather than the well, because
     * the finger that wandered off has usually left the bar entirely.
     */
    const release = (e: PointerEvent) => {
      if (!aimed.current || going.current) return;
      const over =
        e.target instanceof Element
          ? e.target.closest<HTMLElement>("[data-dock-goes]")
          : null;
      if (over !== aimed.current) {
        callOff();
        return;
      }
      /*
       * A RELEASE ON THE CELL IS NOT YET A NAVIGATION, AND ON A PHONE IT
       * OFTEN IS NOT ONE AT ALL.
       *
       * A press becomes a navigation by becoming a click, and a browser
       * has several reasons to withhold one from a press that looked like
       * a tap: a touch that lands while the page is still flinging is
       * spent stopping the fling, and a thumb that drifts a couple of
       * pixels has started a pan. Some of those arrive as
       * `pointercancel`, which `abandon` already hears; the rest leave an
       * ordinary `pointerup` on the cell and simply never fire a click,
       * and that one is invisible to both of the rules above.
       *
       * So the click gets a deadline. Missing it means the press was not
       * a tap, and the room the reader was shown has to be taken back
       * now rather than left standing for the four seconds the backstop
       * allows a navigation that is merely slow.
       */
      if (clickWatch.current) clearTimeout(clickWatch.current);
      clickWatch.current = setTimeout(callOff, CLICK_FOLLOWS_MS);
    };

    /*
     * ONCE THE PRESS HAS BECOME A CLICK IT IS NO LONGER A BET.
     *
     * A navigation is under way and the only things allowed to settle the
     * marker are the room answering and the timeout. Without this, any
     * later pointer event that lands off the cell -- a second tap, a
     * `pointercancel` from the browser taking the gesture, a press anywhere
     * on the page while the room is still rendering -- calls the bet off,
     * and `callOff` repositions to whatever is still lit, which during a
     * navigation is the cell you are LEAVING.
     *
     * Measured on a recording of the real app, that is exactly what the
     * reader was seeing: the marker completed its travel, sat on the new
     * cell for ~350ms, then teleported back to the old one and replayed
     * the whole journey the moment the room arrived. Reproduced against
     * the real component with a 350ms commit, it logged two travels 7ms
     * apart -- `312 -> 4` then `4 -> 312`.
     */
    const went = (e: MouseEvent) => {
      if (!aimed.current) return;
      const cell =
        e.target instanceof Element
          ? e.target.closest<HTMLElement>("[data-dock-goes]")
          : null;
      if (cell !== aimed.current) return;
      going.current = true;
      if (clickWatch.current) {
        clearTimeout(clickWatch.current);
        clickWatch.current = null;
      }
    };

    /* A keyboard never presses, and Enter is how it opens a link. */
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.metaKey || e.ctrlKey) return;
      const cell =
        e.target instanceof Element
          ? e.target.closest<HTMLElement>("[data-dock-goes]")
          : null;
      if (cell) aim(cell);
    };

    /* A cancel before the click is a genuinely abandoned press. */
    const abandon = () => {
      if (going.current) return;
      callOff();
    };

    host.addEventListener("pointerdown", press);
    host.addEventListener("click", went);
    host.addEventListener("keydown", key);
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", abandon);
    return () => {
      host.removeEventListener("pointerdown", press);
      host.removeEventListener("click", went);
      host.removeEventListener("keydown", key);
      document.removeEventListener("pointerup", release);
      document.removeEventListener("pointercancel", abandon);
      if (aimTimer.current) clearTimeout(aimTimer.current);
      if (clickWatch.current) clearTimeout(clickWatch.current);
    };
  }, [measure, router]);

  /*
   * Held still until it has been placed once, or the first paint draws a
   * marker sliding in from the left edge of a bar nobody has touched.
   */
  useEffect(() => {
    if (!mark || travels) return;
    const frame = requestAnimationFrame(() => setTravels(true));
    return () => cancelAnimationFrame(frame);
  }, [mark, travels]);

  return { ref, mark, dir, hover, hoverDir, hovering, travels };
}
