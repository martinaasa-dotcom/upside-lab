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
