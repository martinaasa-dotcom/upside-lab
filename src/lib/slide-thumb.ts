/**
 * ONE MARKER, EVERYWHERE A CHOICE IS MADE.
 *
 * The dock has always said where you are with a single pill that travels
 * between cells, its leading edge setting off before its trailing edge
 * follows. Every other choice in the app (USD or EUR, today or all time,
 * five years or thirty, a Lab tab) used to answer with a fill that
 * vanished from one cell and appeared in another, which is a different
 * object doing the same job. This is the dock's language for all of them:
 * one thumb behind the cells that moves to the one you chose.
 *
 * Pure, so the arithmetic is tested apart from the DOM. The thumb is given
 * its destination's width and height before the animation starts, so the
 * last frame is `scale(1, 1)` exactly and its corners are true whenever it
 * is still; it is only oval in flight. Rows matter because a filled grid
 * can wrap: a move between rows stretches on both axes the same way.
 */
import { eased } from "@/lib/dock-motion";

export type ThumbRect = { x: number; y: number; w: number; h: number };

/** How long a thumb travels, and how far behind its trailing edge runs. */
export const THUMB_MS = 340;
export const THUMB_LAG_MS = 30;
/** One sample per 8ms, the dock's own rate. */
const STEP_MS = 8;

/** The whole flight, trailing edge included, which is the animation's length. */
export function thumbTravelMs(
  durationMs: number = THUMB_MS,
  lagMs: number = THUMB_LAG_MS
): number {
  return durationMs + lagMs;
}

export function sameRect(a: ThumbRect | null, b: ThumbRect | null): boolean {
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.w - b.w) < 0.5 &&
    Math.abs(a.h - b.h) < 0.5
  );
}

/** Where the thumb rests: its own size, and a transform that is a move only. */
export function thumbRest(r: ThumbRect) {
  return {
    width: `${r.w}px`,
    height: `${r.h}px`,
    transform: `translate(${r.x}px, ${r.y}px) scale(1, 1)`,
  };
}

/**
 * The travel as compositor keyframes, with `transform-origin: 0 0`.
 *
 * Each axis has a leading and a trailing edge: whichever edge faces the
 * destination sets off first and the other follows `lagMs` later, on the
 * same curve, which is the back of a blob following the front at a fixed
 * distance rather than a rectangle being stretched.
 */
export function thumbTravel(
  from: ThumbRect,
  to: ThumbRect,
  opts: { durationMs?: number; lagMs?: number } = {}
): Keyframe[] {
  const durationMs = opts.durationMs ?? THUMB_MS;
  const lagMs = opts.lagMs ?? THUMB_LAG_MS;
  const right = to.x >= from.x;
  const down = to.y >= from.y;
  const fromR = from.x + from.w;
  const toR = to.x + to.w;
  const fromB = from.y + from.h;
  const toB = to.y + to.h;
  const total = thumbTravelMs(durationMs, lagMs);
  const frames: Keyframe[] = [];
  for (let t = 0; t < total; t += STEP_MS) {
    const lead = eased(t / durationMs);
    const trail = eased((t - lagMs) / durationMs);
    const l = right ? trail : lead;
    const r = right ? lead : trail;
    const tp = down ? trail : lead;
    const bt = down ? lead : trail;
    const x = from.x + (to.x - from.x) * l;
    const xr = fromR + (toR - fromR) * r;
    const y = from.y + (to.y - from.y) * tp;
    const yb = fromB + (toB - fromB) * bt;
    frames.push({
      offset: t / total,
      transform: `translate(${x}px, ${y}px) scale(${Math.max(0.01, (xr - x) / to.w)}, ${Math.max(0.01, (yb - y) / to.h)})`,
      easing: "linear",
    });
  }
  frames.push({
    offset: 1,
    transform: `translate(${to.x}px, ${to.y}px) scale(1, 1)`,
    easing: "linear",
  });
  return frames;
}
