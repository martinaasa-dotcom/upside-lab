/*
  The numbers and the arithmetic behind pull to refresh, with no DOM in them.

  All of it lives here rather than inside the component because every one of
  these is a feel decision that somebody will want to argue with later, and an
  argument about how heavy a pull should be is much easier to have against a
  curve with a test around it than against a magic number buried in a touch
  handler.

  Upside Arena has the same file with the same numbers. The two apps are one
  design, so fix both or neither.
*/

/*
  THE PAGE MOVES, AND IT MOVES LESS THAN YOUR FINGER DOES.

  A pull that tracks the finger one for one has no way of saying "that is far
  enough" other than stopping dead, and a gesture that stops dead reads as a
  bug. Every native one resists instead: it starts exactly under the finger
  and gets heavier the further it goes, approaching a ceiling it never quite
  reaches.

  travel = CEILING * (1 - e^(-raw / CEILING))

  The derivative at raw = 0 is exactly 1, which is the half that matters most:
  the first pixel of the pull is the first pixel of the finger, so the page
  feels attached rather than lagging. From there it falls away smoothly and
  the page can never travel further than CEILING however hard anybody drags.

  Reaching TRIGGER takes 84px of finger for 56px of page, which is a
  deliberate pull rather than a twitch, and TRIGGER is well short of CEILING
  so there is still visible give left when the ring completes. That
  remaining give is what tells a thumb it has arrived somewhere rather than
  hit the end of the track.
*/
export const PULL_CEILING = 96;
export const PULL_TRIGGER = 56;

/** Finger movement before the gesture commits to being a pull or a scroll. */
export const PULL_SLOP = 6;

/*
  How long the ring is shown at the least, and how long it is shown at the
  most.

  A cached refresh can come back in 40ms, and a ring that appears and vanishes
  inside two frames reads as a glitch rather than as an answer, so the floor
  buys it enough time to be seen and understood. The ceiling is the other
  failure: a request that never settles would otherwise leave the ring turning
  for the rest of the session, and a spinner that never stops is the app
  lying about still trying.
*/
export const PULL_MIN_VISIBLE_MS = 450;
export const PULL_MAX_WAIT_MS = 8000;

/** Release travel, and the retract once the work is done. */
export const PULL_SETTLE_MS = 420;

/*
  The ring unwinding from a full circle into a turning arc, and closing again
  when the answer lands. Shorter than the settle because it is a change of
  character rather than a movement, and a slow one reads as the ring being
  unsure of itself.
*/
export const PULL_ARC_MS = 220;

/** The ring: a 22px box, a 9px radius, drawn from twelve o'clock. */
export const PULL_RING_PX = 22;
export const PULL_RING_RADIUS = 9;
export const PULL_RING_CIRCUMFERENCE = 2 * Math.PI * PULL_RING_RADIUS;

/** The fraction of the ring left drawn while the work is running. */
export const PULL_SPIN_ARC = 0.25;

/** How far the page has moved for a given amount of finger. */
export function pullTravel(raw: number): number {
  if (!(raw > 0)) return 0;
  return PULL_CEILING * (1 - Math.exp(-raw / PULL_CEILING));
}

/** 0 at rest, 1 exactly when the pull arms. Never above 1. */
export function pullProgress(travel: number): number {
  if (!(travel > 0)) return 0;
  return Math.min(1, travel / PULL_TRIGGER);
}

/** True once releasing would refresh. */
export function pullArmed(travel: number): boolean {
  return travel >= PULL_TRIGGER;
}

/*
  The ring fades in over the first 40% of the pull and grows into full size
  exactly as it arms.

  Both are continuous, which is the point: there is no frame where something
  appears, jumps or changes character. What says "let go now" is the ring
  being complete and at its full size, reached at the same instant, with no
  extra flourish laid on top.
*/
export function pullOpacity(progress: number): number {
  return Math.max(0, Math.min(1, progress / 0.4));
}

export function pullScale(progress: number): number {
  return 0.86 + 0.14 * Math.max(0, Math.min(1, progress));
}

/** How much of the ring is drawn, as a dash offset from a full circle. */
export function pullDashOffset(progress: number): number {
  return PULL_RING_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, progress)));
}

export type PullIntent = "wait" | "pull" | "scroll";

/*
  WHICH GESTURE THIS IS, DECIDED ONCE AND NOT REVISITED.

  A sideways swipe inside a table that scrolls sideways is not a pull, and
  neither is a drag upward, which is somebody scrolling the page the ordinary
  way. Both have to be let go of cleanly rather than fought, because the touch
  listeners here are passive and the browser is already scrolling by the time
  this is asked.

  "wait" is the answer inside the slop, where the finger has not yet said
  which of the two it is doing.
*/
export function pullIntent(dx: number, dy: number): PullIntent {
  if (Math.abs(dx) < PULL_SLOP && Math.abs(dy) < PULL_SLOP) return "wait";
  if (Math.abs(dx) > Math.abs(dy)) return "scroll";
  return dy > 0 ? "pull" : "scroll";
}
