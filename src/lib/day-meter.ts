/**
 * TODAY, AGAINST AN ORDINARY DAY, DRAWN.
 *
 * The hero card on Home says in a sentence whether today is an ordinary day
 * for this portfolio ("It moves about $153 on an ordinary day, so today is
 * one of those"). That sentence is the most useful one on the screen and
 * the slowest to read, so the card draws it too: a line with no move at its
 * centre, the ordinary range as a band around it, and today as a marker.
 * Inside the band is an ordinary day; past it is not. It is the same
 * arithmetic as the sentence (`daySize`), so the two cannot disagree.
 *
 * Pure: everything is a fraction of the track, 0 at the left, 1 at the
 * right, 0.5 at no move.
 */
import { BIG_MULTIPLE, ORDINARY_MULTIPLE } from "@/lib/typical-move";

export type DayMeter = {
  /** Where today's move sits on the track. */
  at: number;
  /** The ordinary band's two edges. */
  bandFrom: number;
  bandTo: number;
  /** Whether today lies inside the ordinary band. */
  ordinary: boolean;
  /** The move the track's right end stands for, as a fraction. */
  reach: number;
};

/**
 * Lay the meter out, or null when there is nothing honest to draw (no
 * ordinary day measured, or no move today).
 *
 * The track reaches to a big day either side, or a little past today if
 * today was bigger than that, so the marker is always on the line and an
 * ordinary day always takes up the same share of it.
 */
export function dayMeter(
  todayPct: number | null,
  typicalPct: number | null
): DayMeter | null {
  if (
    todayPct == null ||
    typicalPct == null ||
    !Number.isFinite(todayPct) ||
    !Number.isFinite(typicalPct) ||
    typicalPct <= 0
  ) {
    return null;
  }
  const reach = Math.max(typicalPct * BIG_MULTIPLE, Math.abs(todayPct) * 1.12);
  const toTrack = (pct: number) =>
    Math.min(1, Math.max(0, 0.5 + pct / (2 * reach)));
  const band = typicalPct * ORDINARY_MULTIPLE;
  return {
    at: toTrack(todayPct),
    bandFrom: toTrack(-band),
    bandTo: toTrack(band),
    ordinary: Math.abs(todayPct) / typicalPct <= ORDINARY_MULTIPLE,
    reach,
  };
}
