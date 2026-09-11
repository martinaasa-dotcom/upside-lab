import { allocationBySector, type AllocationSlice } from "@/lib/allocation";

/**
 * The picture of what a portfolio is made of, as slices a chart can draw.
 *
 * One grouping, one vocabulary, one set of colours, for every room that
 * draws this. Lab drew it twice on one screen for a while, a donut by
 * investment theme directly above a bar list by sector, and read together
 * they contradicted each other: "other businesses 20%" over a card that
 * resolved the same money into household goods, shops and media. That is
 * the fault this whole pass opened with, in a new place, and the answer is
 * the same as it was -- a reader asking one question gets one answer.
 *
 * The sector wins over the theme, and the reason is who is holding it. A
 * theme list is a curated set of ideas, so it answers well for the
 * holdings it was written around and files everything else under
 * "other businesses". An ordinary first portfolio is mostly everything
 * else. The sector comes from the company's own filings for the whole
 * market, which is the only one of the two that works for somebody this
 * app has never met.
 */

/**
 * The categorical ramp, in the order a chart should spend it.
 *
 * Read from `globals.css`, where it is five hues at two lightnesses, laid
 * out so neighbouring entries are never neighbouring hues. Spending it in
 * order therefore gives the biggest slices the best separation, which is
 * the property `THEME_COLOR` was hand-tuned for and this gets by
 * construction.
 */
const MIX_COLORS = [
  "var(--cat-2)",
  "var(--cat-5)",
  "var(--cat-3)",
  "var(--cat-4)",
  "var(--cat-1)",
  "var(--cat-8)",
  "var(--cat-10)",
  "var(--cat-6)",
  "var(--cat-7)",
  "var(--cat-9)",
] as const;

/** What is left over after the fold, and an empty-looking group. */
const REST_COLOR = "var(--cat-neutral)";

/**
 * How many groups a chart draws before folding the tail.
 *
 * Not a palette limit, though it keeps us inside one. Eleven sectors plus
 * funds and coins is more categories than a person can hold in their head
 * from a ring of colours, and a real portfolio spans four or five, so the
 * fold almost never fires. When it does, one honest "everything else" is
 * a better read than four slivers nobody can tell apart.
 */
export const MAX_MIX_SLICES = 6;

/**
 * Under five points the two sides are the same portfolio with rounding
 * between them, and a sentence about it is noise.
 */
const GAP_WORTH_SAYING = 0.05;

export type MixHolding = {
  ticker: string;
  currentValue: number;
  sector?: string | null;
};

export type MixSlice = {
  key: string;
  label: string;
  pct: number;
  value: number;
  color: string;
};

export function mixSlices(
  holdings: MixHolding[],
  opts: {
    max?: number;
    /**
     * A colour for this label, when two charts have to agree.
     *
     * Circle draws the room's mix and the reader's own side by side to
     * answer how one differs from the other, and a colour picked by rank
     * inside each list would put the same group on two different colours.
     * The room's chart is built first and its colours are handed to the
     * reader's, so the comparison the panel exists for actually reads.
     */
    colorFor?: (label: string) => string | undefined;
  } = {}
): MixSlice[] {
  const max = opts.max ?? MAX_MIX_SLICES;
  const sorted = allocationBySector(holdings);
  if (sorted.length === 0) return [];

  const shown = sorted.slice(0, max);
  const folded = sorted.slice(max);

  const out: MixSlice[] = shown.map((slice: AllocationSlice, i) => ({
    key: slice.key,
    label: slice.label,
    pct: slice.pct,
    value: slice.value,
    color: opts.colorFor?.(slice.label) ?? MIX_COLORS[i % MIX_COLORS.length]!,
  }));

  if (folded.length > 0) {
    out.push({
      key: "everything-else",
      label:
        folded.length === 1
          ? folded[0]!.label
          : `${folded.length} smaller groups`,
      pct: folded.reduce((sum, s) => sum + s.pct, 0),
      value: folded.reduce((sum, s) => sum + s.value, 0),
      color:
        folded.length === 1
          ? (opts.colorFor?.(folded[0]!.label) ??
            MIX_COLORS[max % MIX_COLORS.length]!)
          : REST_COLOR,
    });
  }

  return out;
}

/**
 * Where the reader differs most from a room, as one sentence.
 *
 * This lived in `CircleHome` and read the two drawn charts, which is the
 * natural thing to do and is wrong in two ways that only show up on real
 * portfolios.
 *
 * **The fold is not a group.** Both charts fold their tail into one slice
 * keyed `everything-else`, and the tails are different sectors on each
 * side: measured on a circle holding eight sectors, the room's fold was
 * utilities and industrials and the reader's was technology and banks,
 * under one key and one label. Comparing them subtracts one set of
 * companies from an unrelated set and prints the result as a fact about
 * the reader, in a sentence naming neither.
 *
 * **And it could only ever answer about the room's own top six.** The old
 * loop walked the room's slices and looked each up on the reader's side,
 * so a sector the reader is heavily in could not be the answer unless the
 * room also held enough of it to survive the fold. Measured on a reader
 * who is 100% utilities inside a circle holding 0.5% of it, the panel
 * said "27 points less of Technology and software": true, and not the
 * thing anybody opened the panel to find out.
 *
 * So the comparison runs on the **unfolded** allocation of both sides,
 * over the union of what either holds. The fold exists so a chart stays
 * readable; it has no business deciding what a sentence compares.
 */
export function mixGapLine(
  circle: MixHolding[],
  you: MixHolding[]
): string | null {
  const room = mixSlices(circle, { max: Number.POSITIVE_INFINITY });
  const mine = mixSlices(you, { max: Number.POSITIVE_INFINITY });
  if (room.length === 0 || mine.length === 0) return null;

  const roomPct = new Map(room.map((s) => [s.key, s.pct]));
  const minePct = new Map(mine.map((s) => [s.key, s.pct]));
  const label = new Map([...room, ...mine].map((s) => [s.key, s.label]));

  let best: { key: string; gap: number } | null = null;
  for (const key of new Set([...roomPct.keys(), ...minePct.keys()])) {
    const gap = (minePct.get(key) ?? 0) - (roomPct.get(key) ?? 0);
    if (!best || Math.abs(gap) > Math.abs(best.gap)) best = { key, gap };
  }
  if (!best || Math.abs(best.gap) < GAP_WORTH_SAYING) return null;

  const points = Math.round(Math.abs(best.gap) * 100);
  const name = label.get(best.key) ?? "that group";
  return best.gap > 0
    ? `You hold ${points} points more of ${name} than the circle does.`
    : `You hold ${points} points less of ${name} than the circle does.`;
}
