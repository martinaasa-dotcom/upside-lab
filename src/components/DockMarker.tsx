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

/**
 * The capsule's material, drawn as its own layer behind the cells.
 *
 * IT IS A SEPARATE ELEMENT SO THE BAR CAN BREATHE WITHOUT MOVING A SINGLE
 * WORD WRITTEN ON IT, and that is not a refinement, it is the whole reason
 * this exists. The swell used to scale the capsule itself, which scales
 * everything inside it: measured on the laptop dock at 1440, walking one
 * cell from Home to Pulse slid the label "Circle" **28 pixels sideways**
 * and stretched every label's letterforms by **4.5%**, on every
 * navigation. A reader moving between two neighbouring rooms watched the
 * far end of the bar lurch.
 *
 * This repo had already decided that. `dock-stability.test.ts` exists
 * because a dropped cell made "the whole bar resize and re-centre under
 * the cursor, every label sliding sideways mid-click" -- the same failure,
 * arrived at from the other direction and written down as a rule. The
 * animation had been reintroducing it several times a minute.
 *
 * So the material scales and the contents do not. The reference does move
 * its labels, by about 11px on a 1181px bar, and that is a phone bar of
 * glyphs with 11px captions under them where the shift is invisible; on a
 * floating capsule of 14px labels it is the loudest thing on the screen.
 * Fidelity to the recording is not the goal, the feel is.
 *
 * It costs nothing to give up, either: scaling a subtree of text is what
 * made the swell measurable at all, because text has to be re-rasterised
 * at every scale factor while a plain pane does not.
 */
export function DockPane() {
  return (
    <span
      aria-hidden
      className="dock-pane card-sheen glass glass-dock pointer-events-none absolute inset-0 rounded-full ring-1 ring-foreground/20"
    />
  );
}
