import { signedPercent } from "@/lib/format";

/**
 * The Fund is a race against one index fund, so its hero draws a race:
 * both runners on one track measured from where they started.
 *
 * Pure so the sentence and the geometry cannot disagree. The sentence is
 * a distance in percentage points between two returns a reader can see on
 * the same card, and it is never a verdict: "ahead" and "behind" describe
 * where a figure sits, the way the rest of the app describes a price.
 */

export type RaceRead = {
  /** Fund return minus the index's, in percentage points. */
  gapPts: number;
  lead: "ahead" | "behind" | "level";
  line: string;
};

/** Under this many points the two are said to be level. */
export const LEVEL_POINTS = 0.05;

function points(n: number): string {
  const v = Math.abs(n);
  return `${v.toFixed(1)} ${v.toFixed(1) === "1.0" ? "point" : "points"}`;
}

export function raceRead(
  fundPct: number | null | undefined,
  benchPct: number | null | undefined,
  benchName: string
): RaceRead | null {
  if (fundPct == null || benchPct == null) return null;
  if (!Number.isFinite(fundPct) || !Number.isFinite(benchPct)) return null;
  const gapPts = (fundPct - benchPct) * 100;
  if (Math.abs(gapPts) < LEVEL_POINTS) {
    return {
      gapPts,
      lead: "level",
      line: `Level with ${benchName} since the start, both ${signedPercent(fundPct)}.`,
    };
  }
  const lead = gapPts > 0 ? "ahead" : "behind";
  return {
    gapPts,
    lead,
    line: `${points(gapPts)} ${lead === "ahead" ? "ahead of" : "behind"} ${benchName} since the start.`,
  };
}

export type RaceTrack = {
  /** Where "no change since the start" sits, 0 to 1 along the track. */
  zero: number;
  fund: number;
  bench: number;
};

/** Room left at each end so a marker is never drawn on the track's edge. */
export const TRACK_PAD = 0.12;

/**
 * Places the start line and both runners on one scale that always includes
 * zero, padded at the ends. Two runners in the same place still get a
 * track with some width, so neither is drawn at an edge.
 */
export function raceTrack(fundPct: number, benchPct: number): RaceTrack {
  const lo = Math.min(0, fundPct, benchPct);
  const hi = Math.max(0, fundPct, benchPct);
  const span = hi - lo > 1e-6 ? hi - lo : 0.01;
  const usable = 1 - 2 * TRACK_PAD;
  const at = (v: number) => TRACK_PAD + ((v - lo) / span) * usable;
  return { zero: at(0), fund: at(fundPct), bench: at(benchPct) };
}
