"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type DockDir,
  type DockMark,
  SWELL_MS,
  markGeometry,
  sameMark,
  swellFrames,
  travelDirection,
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

function markOf(host: HTMLElement, cell: HTMLElement): DockMark {
  return markGeometry(host.clientWidth, cell.offsetLeft, cell.offsetWidth);
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
  running.current?.cancel();
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

  const measure = useCallback(() => {
    const host = ref.current;
    if (!host) return;
    /*
     * Descendant, not `:scope >`. The laptop's folded picker puts `data-on`
     * on a trigger nested inside a dropdown, not on a direct child of the
     * well. A direct-child query would leave that cell unlit.
     */
    const on = host.querySelector<HTMLElement>("[data-on]");
    const next = on ? markOf(host, on) : null;
    if (!sameMark(lastMark.current, next)) {
      if (lastMark.current && next) {
        const heading = travelDirection(lastMark.current, next);
        setDir(heading);
        swell(host, heading, breathing);
      }
      lastMark.current = next;
      setMark(next);
    }

    const cell = hoverCell.current;
    const overIt = cell && host.contains(cell) ? markOf(host, cell) : null;
    if (overIt && !sameMark(lastHover.current, overIt)) {
      if (lastHover.current) {
        setHoverDir(travelDirection(lastHover.current, overIt));
      }
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
   * The pointer's pane. On leaving, the geometry is kept and only the flag
   * drops, so the pane fades out where it was rather than snapping to the
   * left edge of the bar on its way to nothing.
   */
  useEffect(() => {
    const host = ref.current;
    if (!host) return;

    const cellUnder = (target: EventTarget | null): HTMLElement | null =>
      target instanceof Element
        ? target.closest<HTMLElement>("[data-dock-cell]")
        : null;

    const settle = (cell: HTMLElement) => {
      hoverCell.current = cell;
      const next = markOf(host, cell);
      if (lastHover.current) setHoverDir(travelDirection(lastHover.current, next));
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
      if (cell && host.contains(cell)) settle(cell);
    };

    const focus = (e: FocusEvent) => {
      const cell = cellUnder(e.target);
      if (cell && host.contains(cell)) settle(cell);
    };

    const leave = () => {
      hoverCell.current = null;
      setHovering(false);
    };

    host.addEventListener("pointerover", over);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    host.addEventListener("focusin", focus);
    host.addEventListener("focusout", leave);
    return () => {
      host.removeEventListener("pointerover", over);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
      host.removeEventListener("focusin", focus);
      host.removeEventListener("focusout", leave);
    };
  }, []);

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
