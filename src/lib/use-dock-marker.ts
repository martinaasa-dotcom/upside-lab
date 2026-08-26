"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

type Mark = { left: number; width: number };

/**
 * The sliding pill behind a dock cell.
 *
 * Both docks mark the current cell with `data-on` from the room id, never
 * from whether that room has rows. This hook is the only reader of that
 * flag, so the phone bar and the laptop bar cannot drift apart on how the
 * pill is found or when it is allowed to move.
 */
export function useDockMarker() {
  const ref = useRef<HTMLDivElement>(null);
  const [mark, setMark] = useState<Mark | null>(null);
  const [travels, setTravels] = useState(false);

  const measure = useCallback(() => {
    const host = ref.current;
    if (!host) return;
    /*
     * Descendant, not `:scope >`. The laptop's folded picker puts `data-on`
     * on a trigger nested inside a dropdown, not on a direct child of the
     * well. A direct-child query would leave that cell unlit.
     */
    const on = host.querySelector<HTMLElement>("[data-on]");
    /*
     * Same object, same state. A freshly built object on every measurement
     * makes every measurement a re-render, and a layout effect that
     * measures after every render then never settles: React error #185.
     * Returning the previous value when the numbers have not moved makes
     * measuring idempotent.
     */
    setMark((was) => {
      if (!was && !on) return was;
      if (!on) return null;
      const next = { left: on.offsetLeft, width: on.offsetWidth };
      return was && was.left === next.left && was.width === next.width
        ? was
        : next;
    });
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
    for (const cell of Array.from(host.children)) watch.observe(cell);
    return () => watch.disconnect();
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

  return { ref, mark, travels };
}
