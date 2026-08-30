"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type DockDir,
  type DockMark,
  GHOST_LAG_MS,
  GHOST_MS,
  MARKER_LAG_MS,
  MARKER_MS,
  SWELL_MS,
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
  if (!from || typeof el.animate !== "function" || stillMotion()) return;
  if (from.left === to.left && from.width === to.width) return;
  running.current?.cancel();
  running.current = el.animate(travelKeyframes(from, to, opts), {
    duration: opts.durationMs,
  });
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
  running: { current: Animation | null }
) {
  /*
   * The capsule itself, everything on it included. The bar is one object
   * and the reference moves all of it together; see `swellFrames` for the
   * measurements, and for why a one-axis scale is the thing to never do.
   */
  if (typeof host.animate !== "function" || stillMotion()) return;
  const frames = swellFrames(dir);
  if (!frames) return;
  /*
   * Cancel the one in flight rather than stacking on it. Two animations of
   * the same property both apply, the newer one winning, so when the newer
   * finishes and drops off, an older one still running takes the bar back
   * over and it jumps. Tapping along the dock quickly is exactly how
   * somebody would find that.
   */
  running.current = host.animate(frames, { duration: SWELL_MS });
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
export function useDockMarker(): DockMarkerState {
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
  const aimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const measure = useCallback(() => {
    const host = ref.current;
    if (!host) return;
    /*
     * Descendant, not `:scope >`. The laptop's folded picker puts `data-on`
     * on a trigger nested inside a dropdown, not on a direct child of the
     * well. A direct-child query would leave that cell unlit.
     */
    const on = host.querySelector<HTMLElement>("[data-on]");
    const pane = host.querySelector<HTMLElement>(".dock-marker");
    /*
     * A press outstanding, so the marker is already where the reader aimed
     * it and the router has not caught up yet. The bet is settled when the
     * room answers with that same cell, when it answers with a different
     * one (a redirect), or when the cell stops existing.
     */
    if (
      aimed.current &&
      (on === aimed.current || !host.contains(aimed.current))
    ) {
      aimed.current = null;
    }
    const target = aimed.current ?? on;
    const next = target ? markOf(target) : null;
    if (!sameMark(lastMark.current, next)) {
      if (lastMark.current && next) {
        const heading = travelDirection(lastMark.current, next);
        setDir(heading);
        swell(host, heading, breathing);
      }
      if (next) glide(pane, lastMark.current, next, gliding, {
        durationMs: MARKER_MS,
        lagMs: MARKER_LAG_MS,
      });
      lastMark.current = next;
      setMark(next);
    }

    const cell = hoverCell.current;
    const overIt = cell && host.contains(cell) ? markOf(cell) : null;
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
  }, []);

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
    const watch = new ResizeObserver(() => measure());
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

    const callOff = () => {
      if (aimTimer.current) {
        clearTimeout(aimTimer.current);
        aimTimer.current = null;
      }
      if (!aimed.current) return;
      aimed.current = null;
      measure();
    };

    const aim = (cell: HTMLElement) => {
      const host2 = ref.current;
      if (!host2 || !host2.contains(cell)) return;
      if (cell === host2.querySelector("[data-on]")) return;
      aimed.current = cell;
      if (aimTimer.current) clearTimeout(aimTimer.current);
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
      if (!aimed.current) return;
      const over =
        e.target instanceof Element
          ? e.target.closest<HTMLElement>("[data-dock-goes]")
          : null;
      if (over !== aimed.current) callOff();
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

    host.addEventListener("pointerdown", press);
    host.addEventListener("keydown", key);
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", callOff);
    return () => {
      host.removeEventListener("pointerdown", press);
      host.removeEventListener("keydown", key);
      document.removeEventListener("pointerup", release);
      document.removeEventListener("pointercancel", callOff);
      if (aimTimer.current) clearTimeout(aimTimer.current);
    };
  }, [measure]);

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
