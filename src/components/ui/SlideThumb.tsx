"use client";

import { useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/format";
import {
  sameRect,
  thumbRest,
  thumbTravel,
  thumbTravelMs,
  type ThumbRect,
} from "@/lib/slide-thumb";

/**
 * The one thumb behind a row of choices, gliding to the one that is on.
 *
 * It is the track's own child. The track carries `seg-track`, every
 * choice `seg-cell`, and the chosen one `data-on`. Until this has measured, the chosen cell paints its own
 * fill exactly as it always did, so the server's first frame and a browser
 * with scripts off both look right; the moment the thumb is placed the
 * track takes `data-thumb` and the cell hands its fill over (motion.css).
 *
 * Three rules, each the dock's own, because the dock found them first:
 *
 *  - A hidden track does not measure. `WorkspaceShell` keeps rooms mounted
 *    behind `hidden`, where every offset reads 0, and a thumb that recorded
 *    that would sweep in from the corner the next time the room is shown.
 *  - The first placement, and any placement after a resize, arrives rather
 *    than travels. Only a change of choice is a journey.
 *  - Reduced motion arrives every time.
 */
export function SlideThumb({
  on,
  className,
}: {
  /** Whatever identifies the chosen cell; a change of it is a journey. */
  on: unknown;
  className?: string;
}) {
  const thumb = useRef<HTMLSpanElement>(null);
  const at = useRef<ThumbRect | null>(null);
  const flight = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    /*
     * The track is read off the thumb's own parent rather than handed in as
     * a ref, and that is not tidiness: a child's layout effect runs before
     * its parent's ref is attached, so on mount a ref from the track is
     * still null here and the thumb never placed itself.
     */
    const pane = thumb.current;
    const el = pane?.parentElement;
    if (!el || !pane) return;

    const still = () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const place = (travel: boolean) => {
      if (el.offsetWidth === 0) return;
      const cell = el.querySelector<HTMLElement>(":scope > [data-on]");
      if (!cell || cell.offsetWidth === 0) {
        el.removeAttribute("data-thumb");
        at.current = null;
        return;
      }
      const next: ThumbRect = {
        x: cell.offsetLeft,
        y: cell.offsetTop,
        w: cell.offsetWidth,
        h: cell.offsetHeight,
      };
      const was = at.current;
      at.current = next;
      if (sameRect(was, next) && el.hasAttribute("data-thumb")) return;
      const rest = thumbRest(next);
      flight.current?.cancel();
      flight.current = null;
      pane.style.width = rest.width;
      pane.style.height = rest.height;
      pane.style.transform = rest.transform;
      el.setAttribute("data-thumb", "");
      if (!travel || !was || still() || typeof pane.animate !== "function") {
        return;
      }
      flight.current = pane.animate(thumbTravel(was, next), {
        duration: thumbTravelMs(),
        easing: "linear",
      });
    };

    place(true);

    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => place(false));
    watch.observe(el);
    for (const child of Array.from(el.children)) {
      if (child !== pane) watch.observe(child);
    }
    return () => watch.disconnect();
  }, [on]);

  return (
    <span
      ref={thumb}
      aria-hidden
      data-slot="slide-thumb"
      className={cn(
        "slide-thumb card-sheen rounded-md bg-primary shadow-sm",
        className
      )}
    />
  );
}
