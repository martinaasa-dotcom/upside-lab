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
 * `shape` is the caller's, because the phone's cells are 48px squares and
 * the laptop's are 44px tall: the height is the only thing the two docks
 * do not share.
 */
export function DockMarker({
  state,
  shape,
}: {
  state: DockMarkerState;
  /** Vertical placement and radius of both panes, e.g. `top-1 h-12`. */
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
        style={hover ? { left: hover.left, right: hover.right } : undefined}
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
        style={mark ? { left: mark.left, right: mark.right } : undefined}
      />
    </>
  );
}

