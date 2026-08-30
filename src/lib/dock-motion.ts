/**
 * The geometry and the direction behind the dock's travelling marker.
 *
 * The marker used to be `translateX(left)` with a width, moved on one
 * transition, which is a rigid slide: the pill leaves as a rectangle,
 * arrives as the same rectangle, and the only thing that happened in
 * between is that it was somewhere else. iOS does not do that, and the
 * difference is not decoration. The pill's leading edge sets off first and
 * its trailing edge follows, so it stretches across the distance it is
 * covering and gathers itself back up on arrival. What that says, without
 * a word, is where it came from, and it says it for exactly as long as the
 * eye needs to follow it.
 *
 * Which means the marker is TWO EDGES, not a position and a size, and both
 * of them are insets from the well: `left` and `right`, each with its own
 * duration. Give the leading edge the short one and the trailing edge the
 * long one and the stretch falls out of the transition itself, with no
 * animation loop, no per-frame JavaScript, and a stretch that scales with
 * the distance travelled: one cell across is a nudge, four cells across is
 * a smear, which is exactly right and is what a fixed keyframe cannot do.
 *
 * The durations and the curves are in `src/app/dock.css`; which edge is
 * leading is the direction, which is all this file computes.
 */

/** A cell's two insets from the well's padding box, in pixels. */
export type DockMark = { left: number; right: number };

/** Which way the marker is going. Null before it has been anywhere. */
export type DockDir = "left" | "right" | null;

/**
 * A cell's insets, measured from its own layout box.
 *
 * `hostWidth` is the well's `clientWidth`, which is its padding box, and
 * `cellLeft` is the cell's `offsetLeft`, which is measured from the same
 * edge. The marker is absolutely positioned, so its `left: 0` resolves to
 * that padding box too and the three agree.
 */
export function markGeometry(
  hostWidth: number,
  cellLeft: number,
  cellWidth: number
): DockMark {
  return {
    left: cellLeft,
    right: Math.max(0, hostWidth - (cellLeft + cellWidth)),
  };
}

/** Whether two measurements are the same, so measuring can be idempotent. */
export function sameMark(a: DockMark | null, b: DockMark | null): boolean {
  if (!a || !b) return a === b;
  return a.left === b.left && a.right === b.right;
}

/**
 * Which edge leads.
 *
 * Read off the left inset alone: a cell further right has a larger one.
 * Two cells of different widths can share a left edge only if they are the
 * same cell, so this cannot mistake a resize for a move; a pure resize
 * answers null and both edges settle at the same speed, which is right,
 * because a cell that grew under a still marker has no direction.
 */
export function travelDirection(was: DockMark, next: DockMark): DockDir {
  if (next.left > was.left) return "right";
  if (next.left < was.left) return "left";
  return null;
}

/**
 * The capsule breathes, and the WHOLE bar breathes as one object.
 *
 * Traced frame by frame off the reference recording at 30fps, tracking the
 * capsule's own four edges with a sub-pixel gradient fit. Both axes move
 * together and by the same fraction:
 *
 *     frame   width    height
 *     n53     +1.96%   +2.04%
 *     n56     +3.99%   +3.95%     <- peak
 *     n58     +2.66%   +2.31%
 *     n60     +0.67%   +0.68%
 *
 * So it is a **uniform `scale()` about the centre**, not a horizontal one:
 * at the peak the left edge moved -23.8px while the right moved +23.7px,
 * and the top -3.8px against the bottom +3.9px. Symmetric on both axes.
 *
 * THIS FILE PREVIOUSLY SAID THE HEIGHT NEVER MOVED, AND THAT WAS WRONG.
 * The measurement behind it used a vertical window that missed the
 * capsule's real edges: it reported a height of 234px when the true height
 * is 187px, and never varied because it was reading something else. That
 * one bad number produced a `scaleX`, and a horizontal-only scale is what
 * stretches letterforms sideways, which is what made the bar feel wrong.
 * A uniform scale magnifies type instead of distorting it, which is why
 * the reference can move everything and still look calm. **Never scale
 * this bar on one axis.**
 *
 * The shape is a swell, not a snap. Normalised against its own peak, with
 * t measured from the start of the travel:
 *
 *     0ms 0.05  67ms 0.26  100ms 0.35  133ms 0.49  167ms 0.74
 *     200ms 0.94  233ms 1.00  267ms 0.90  300ms 0.67  333ms 0.41
 *     367ms 0.17  400ms 0.05  433ms -0.03  467ms -0.035  500ms 0
 *
 * It takes **40% of its life to reach the peak** and comes back through a
 * slight undershoot before settling, which is the impulse response of
 * something springy rather than an ease. The old curve put the peak at 11%
 * and had no undershoot: that is a flinch, and it is the other half of why
 * the bar read as jumpy.
 */
export const SWELL_PEAK = 1.04;
export const SWELL_MS = 500;

/**
 * The capsule's keyframes for one travel, traced from the measurements
 * above. Returns null when there is no direction, because a cell that
 * resized under a still marker is not a journey and a bar that breathes at
 * nothing is a bar with a twitch.
 *
 * The direction does not change the shape: the reference scales about the
 * centre whichever way the marker is going, and a lean would be a second
 * opinion about direction that the marker already gives.
 */
export function swellFrames(dir: DockDir): Keyframe[] | null {
  if (!dir) return null;
  const grown = SWELL_PEAK - 1;
  /* Normalised samples, one per recorded frame of the reference. */
  const shape = [
    0, 0.26, 0.35, 0.49, 0.74, 0.94, 1, 0.9, 0.67, 0.41, 0.17, 0.05, -0.03,
    -0.035, -0.03, 0,
  ];
  return shape.map((v, i) => ({
    offset: i / (shape.length - 1),
    transform: `scale(${1 + grown * v})`,
    /*
     * Linear between samples on purpose. They are 33ms apart, which is one
     * frame of the recording, so the curve is already carried by the data
     * and any easing laid on top would be a second guess about a shape that
     * was measured.
     */
    easing: "linear",
  }));
}
