"use client";

import { cn } from "@/lib/format";
import type { DockMarkerState } from "@/lib/use-dock-marker";

/**
 * The two panes behind a dock's cells, drawn once for both docks.
 *
 * Order matters and is the whole of the layering: the pointer's pane is
 * first so it sits under the marker, both are before the cells in the
 * stacking order because the cells carry `z-[1]`, and neither takes a
 * pointer event. Hover the cell you are already in and the two stack,
 * which is right — that cell is both where you are and what you are
 * reaching for, and it should look like both.
 *
 * How they move is in `dock.css`; where they are is in `use-dock-marker`.
 * `shape` is the caller's, because the height is the only thing the two
 * docks do not share: the laptop's cells are a fixed 44px, and the phone's
 * are however tall an icon over its own name comes out, so that one is
 * `top-1 bottom-1` and lets the row decide.
 */
export function DockMarker({
  state,
  shape,
}: {
  state: DockMarkerState;
  /** Vertical placement of both panes, e.g. `top-1 h-11` or `top-1 bottom-1`. */
  shape: string;
}) {
  const { mark, dir, hover, hoverDir, hovering, travels } = state;
  return (
    <>
      <span
        aria-hidden
        data-dir={hoverDir ?? undefined}
        className={cn(
          "dock-ghost rounded-full bg-foreground/[0.055]",
          shape,
          hover && hovering ? "opacity-100" : "opacity-0"
        )}
        /* Geometry is written by `useDockMarker` on the element itself, so
           the resting state and the travel are one story. See `glide`. */
      />
      <span
        aria-hidden
        data-dir={dir ?? undefined}
        data-travels={travels ? "" : undefined}
        className={cn(
          "dock-marker rounded-full bg-foreground/10",
          shape,
          mark ? "opacity-100" : "opacity-0"
        )}

      />
    </>
  );
}

