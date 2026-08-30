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
 * The capsule breathes while the marker travels.
 *
 * This is the half of the reference that a moving pill alone does not
 * carry, and it is what makes the bar read as one soft object rather than
 * as a marker sliding inside a rigid tray. Measured off the reference
 * recording frame by frame at 30fps, tracking the capsule's own outer
 * edges rather than anything inside it, across three separate travels:
 *
 *   rest        1181px
 *   +33ms       1237px   +4.7%
 *   +67ms       1235px   +4.6%
 *   +133ms      1210px   +2.5%
 *   +200ms      1196px   +1.3%
 *   +300ms      1181px   settled
 *
 * The three travels peaked at +3.6%, +4.7% and +4.8%, so `SWELL_PEAK` is
 * the middle of that. **Its height never moved** (234px in every frame of
 * every travel), so this is horizontal and nothing else: a bar that also
 * grew taller would push the page's bottom padding around, and `useDockPad`
 * publishes that height for every notice on the screen to sit clear of.
 *
 * **It leans toward where the pill is going.** In the same frames the end
 * the marker was heading for pushed out 28px while the other end pushed out
 * 14px, which is exactly two to one, so the origin sits a third of the way
 * in from the trailing end rather than at the centre. A centred swell is
 * the same amount of motion saying nothing about direction.
 *
 * The shape is snap out, ease back: most of the growth is spent in the
 * first tenth and the return is four times longer, which is the press's
 * rule (`dock.css`) at the scale of the whole bar.
 */
export const SWELL_PEAK = 1.045;
export const SWELL_MS = 300;
/** How far in from the trailing end the swell is anchored. */
export const SWELL_ORIGIN = "33%";

/**
 * The capsule's keyframes for one travel, traced from the measurements
 * above. Returns null when there is no direction to lean toward, because a
 * cell that resized under a still marker is not a journey and a bar that
 * breathes at nothing is a bar with a twitch.
 */
export function swellFrames(dir: DockDir): Keyframe[] | null {
  if (!dir) return null;
  const origin =
    dir === "right"
      ? `${SWELL_ORIGIN} center`
      : `${100 - parseFloat(SWELL_ORIGIN)}% center`;
  const grown = SWELL_PEAK - 1;
  const at = (offset: number, of: number, easing: string): Keyframe => ({
    offset,
    transform: `scaleX(${1 + grown * of})`,
    transformOrigin: origin,
    easing,
  });
  /*
   * The easing on a keyframe is the segment that starts at it, so the first
   * one carries the snap and the rest carry the settle. Without them the
   * traced points are joined by straight lines and the bar changes speed at
   * each of them, which is visible as a flicker at this duration.
   */
  return [
    at(0, 0, "cubic-bezier(0.32, 0.72, 0, 1)"),
    at(0.11, 1, "cubic-bezier(0.4, 0, 0.6, 1)"),
    at(0.33, 0.98, "cubic-bezier(0.4, 0, 0.6, 1)"),
    at(0.56, 0.55, "cubic-bezier(0.4, 0, 0.6, 1)"),
    at(0.78, 0.29, "cubic-bezier(0.4, 0, 0.4, 1)"),
    at(1, 0, "linear"),
  ];
}
