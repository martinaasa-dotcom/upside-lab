"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A SECTION NOBODY CAN SEE IS BUILT WHEN THEY COME TO IT, NOT BEFORE.
 *
 * Measured on the real app at 390x800: **59% to 81% of every room is
 * entirely below the fold**, and the rooms are three to eight screens tall.
 * Holdings draws 957 elements over 8.1 screens, Pulse 548 over 7.9, Growth
 * 713 over 6.1. Every tap laid all of that out and painted it, and the
 * reader saw the first screen.
 *
 *     room       elements   below the fold   screens
 *     Home            485      326 (67%)        5.7
 *     Pulse           548      396 (72%)        7.9
 *     Lab             250      202 (81%)        2.9
 *     Growth          713      565 (79%)        6.1
 *     Holdings        957      563 (59%)        8.1
 *
 * So the biggest blocks down there wait for the reader. This is a real
 * mount, not a paint trick: the children do not exist until it fires, so
 * their effects, their fetches and their render cost all wait with them.
 *
 * **It fires a whole screen early** (`rootMargin`), which is the number
 * that makes this safe rather than clever: by the time a section could be
 * looked at it has been mounted for a screen's worth of scrolling, so
 * nobody sees it arrive. `reserve` holds a plausible height in the
 * meantime so the scrollbar does not lurch, and the swap happens off
 * screen where a few pixels of difference cost nothing.
 *
 * Do not wrap anything above the fold in this, and do not wrap anything a
 * reader can reach without scrolling to it -- an anchor, a print view, or
 * a section some other control scrolls to would all arrive empty.
 */
export function BelowFold({
  children,
  reserve = 320,
  className,
}: {
  children: ReactNode;
  /** Height held while the section is still folded away, in pixels. */
  reserve?: number;
  /**
   * Classes for the wrapper. A wrapped child is no longer a child of the
   * original parent, so anything that parent's layout reads off it -- a
   * flex `order`, a grid placement -- has to move out here or it stops
   * applying. `CircleHome` orders its sections that way.
   */
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) return;
    const el = ref.current;
    if (!el) return;
    /*
     * No observer (an old browser, a test environment): show it. The
     * failure mode of this component must be the behaviour it replaced,
     * never a section that never arrives.
     */
    if (typeof IntersectionObserver === "undefined") {
      setOpen(true);
      return;
    }
    const watch = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setOpen(true);
          watch.disconnect();
        }
      },
      { rootMargin: "100% 0px" }
    );
    watch.observe(el);
    return () => watch.disconnect();
  }, [open]);

  return (
    <div
      ref={ref}
      className={className}
      style={open ? undefined : { minHeight: reserve }}
    >
      {open ? children : null}
    </div>
  );
}
