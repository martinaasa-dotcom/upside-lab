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

export type MixSlice = {
  key: string;
  label: string;
  pct: number;
  value: number;
  color: string;
};

export function mixSlices(
  holdings: Array<{ ticker: string; currentValue: number; sector?: string | null }>,
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
