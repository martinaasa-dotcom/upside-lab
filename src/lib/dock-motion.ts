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

/** A cell's place in the well: its left edge and its width, in pixels. */
export type DockMark = { left: number; width: number };

/** Which way the marker is going. Null before it has been anywhere. */
export type DockDir = "left" | "right" | null;

/** A cell's geometry, measured from its own layout box. */
export function markGeometry(cellLeft: number, cellWidth: number): DockMark {
  return { left: cellLeft, width: Math.max(0, cellWidth) };
}

/** Whether two measurements are the same, so measuring can be idempotent. */
export function sameMark(a: DockMark | null, b: DockMark | null): boolean {
  if (!a || !b) return a === b;
  return a.left === b.left && a.width === b.width;
}

/**
 * Which edge leads. Read off the left edge alone: a cell further right has a
 * larger one. A pure resize answers null, and both edges then settle
 * together, which is right, because a cell that grew under a still marker
 * has no direction.
 */
export function travelDirection(was: DockMark, next: DockMark): DockDir {
  if (next.left > was.left) return "right";
  if (next.left < was.left) return "left";
  return null;
}

/**
 * THE MARKER RUNS ON THE COMPOSITOR, AND THAT IS THE WHOLE REASON THIS
 * FUNCTION EXISTS.
 *
 * It used to be a CSS transition on `left` and `right`, which reads well
 * and cannot survive a navigation: those are layout properties, so every
 * frame is laid out and painted on the main thread, and the main thread is
 * exactly what a route change is busy with. Measured off a recording of
 * the real app on a phone, tracking the pill's centre frame by frame
 * through four travels, every one of them ran two or three frames, then
 * **stalled for four to six frames** while the new room rendered, then
 * teleported the rest of the way in one frame (+77px, +106px, +75px). That
 * is not a slow animation, it is a frozen one.
 *
 * `transform` is the only way out: a transform animation is handed to the
 * compositor and keeps its own clock, so it glides through a blocked main
 * thread. What a transform cannot do is ease two edges independently the
 * way two transitions could, so the two eased edges are sampled here and
 * handed over as keyframes. Sampling is what "more frames" means: at 8ms
 * the browser has a value for every frame it could possibly draw, and the
 * curve between them is the curve, not an approximation of it.
 *
 * The pill's width is set to its destination before the animation starts,
 * so `scaleX` is exactly 1 at rest and the round caps are perfect circles
 * whenever the marker is standing still. It is only during the travel that
 * they go slightly oval, which is the cost of the compositor and the
 * reason the lag below is small: a big lag on a 48px circle would read as
 * an egg.
 */
export const MARKER_MS = 300;
export const GHOST_MS = 200;
/**
 * How far the trailing edge follows behind, in time. A constant lag is the
 * back of a blob following the front at a fixed distance, which is what
 * makes it read as one object. Measured on a 120px cell this lands a
 * one-cell move at about 1.1x, where the reference's own pill reached
 * 1.29x -- deliberately gentler, because the reference is a phone bar of
 * glyphs and stretching a labelled cell reads much louder.
 */
export const MARKER_LAG_MS = 12;
export const GHOST_LAG_MS = 6;
/** Fitted numerically to the reference pill's own progress (sse 0.0011). */
export const TRAVEL_EASE = [0.5, 0.2, 0.05, 0.95] as const;
/** One sample per 8ms, so every frame the browser can draw has a value. */
export const SAMPLE_MS = 8;

function bezier(p1x: number, p1y: number, p2x: number, p2y: number, t: number) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const u = (lo + hi) / 2;
    const x = 3 * (1 - u) ** 2 * u * p1x + 3 * (1 - u) * u * u * p2x + u ** 3;
    if (x < t) lo = u;
    else hi = u;
  }
  const u = (lo + hi) / 2;
  return 3 * (1 - u) ** 2 * u * p1y + 3 * (1 - u) * u * u * p2y + u ** 3;
}

/**
 * The pill's travel, as compositor keyframes. `to.width` is the width the
 * element is given, so the animation ends at `scaleX(1)`.
 */
export function travelKeyframes(
  from: DockMark,
  to: DockMark,
  opts: { durationMs: number; lagMs: number } = {
    durationMs: MARKER_MS,
    lagMs: MARKER_LAG_MS,
  }
): Keyframe[] {
  const [a, b, c, d] = TRAVEL_EASE;
  const { durationMs, lagMs } = opts;
  const goingRight = to.left >= from.left;
  const fromRight = from.left + from.width;
  const toRight = to.left + to.width;

  const frames: Keyframe[] = [];
  for (let t = 0; t <= durationMs; t += SAMPLE_MS) {
    /* The leading edge sets off first; the trailing one is delayed. */
    const lead = bezier(a, b, c, d, t / durationMs);
    const trail = bezier(a, b, c, d, (t - lagMs) / durationMs);
    const l = goingRight ? trail : lead;
    const r = goingRight ? lead : trail;
    const left = from.left + (to.left - from.left) * l;
    const right = fromRight + (toRight - fromRight) * r;
    frames.push({
      offset: t / durationMs,
      transform: `translateX(${left}px) scaleX(${Math.max(0.01, (right - left) / to.width)})`,
      easing: "linear",
    });
  }
  frames.push({
    offset: 1,
    transform: `translateX(${to.left}px) scaleX(1)`,
    easing: "linear",
  });
  return frames;
}

/** Where the marker rests, so its width is right and `scaleX` is exactly 1. */
export function restingStyle(mark: DockMark) {
  return {
    width: `${mark.width}px`,
    transform: `translateX(${mark.left}px) scaleX(1)`,
  };
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
 * The magnitude is half what the reference measures, on purpose. The
 * recording is a phone bar of glyphs spanning nearly the whole screen,
 * where 4% is a breath; on a laptop capsule of labels the same number
 * reads as the bar lurching, and it is also the one part of this that
 * cannot leave the main thread, because scaling type re-rasterises it.
 * Half the scale over a shorter run is half the work and most of the read.
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
export const SWELL_PEAK = 1.02;
export const SWELL_MS = 380;

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
