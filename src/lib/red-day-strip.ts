/**
 * THE RED DAY, DRAWN.
 *
 * The landing's eight tiles ask which company had news, and the tiles alone
 * make the reader compare eight percentages in their head. Underneath them
 * sits the picture the answer actually is: a line from no move at all down
 * to the worst fall, the market's own move as a band on it, and every
 * company as a dot at its own move. Seven dots sit in the band. One does
 * not. That is the product in one glance, and it is drawn from the same
 * made-up day as every other card on the page.
 *
 * Pure, so the layout is tested apart from the page. Dots are placed by
 * value and then given a lane, top to bottom, so two that are close
 * together never draw over each other; the lane count is decided by the
 * width the strip actually has, because a dot is the same size on every
 * screen and the line is not.
 */

export type StripDot = {
  ticker: string;
  /** The day's move as a fraction, e.g. -0.012. */
  move: number;
  /** Distance from the strip's left edge, in pixels, of the dot's centre. */
  x: number;
  /** Which row the dot sits on, 0 at the top. */
  lane: number;
};

/** A dot's diameter plus the gap it needs from the next, in pixels. */
export const DOT_PX = 12;
const DOT_GAP_PX = 3;
/** Inset at both ends, so a dot at either extreme is whole. */
export const STRIP_INSET_PX = 10;

/**
 * Where a move lands on a strip `width` pixels wide, running from `low`
 * (the left end, the biggest fall) to `high` (the right end).
 */
export function stripX(
  move: number,
  width: number,
  low: number,
  high: number
): number {
  const span = high - low || 1;
  const usable = Math.max(1, width - STRIP_INSET_PX * 2);
  const t = Math.min(1, Math.max(0, (move - low) / span));
  return STRIP_INSET_PX + t * usable;
}

/**
 * The ends of the line: no move at the right, and a little past the
 * biggest fall at the left, rounded out to a whole per cent so the scale
 * reads as a scale rather than as the data's own extent.
 */
export function stripRange(moves: readonly number[]): { low: number; high: number } {
  const worst = Math.min(0, ...moves);
  const best = Math.max(0, ...moves);
  const low = Math.floor((worst - 0.005) * 100) / 100;
  const high = Math.ceil(best * 100) / 100;
  return { low, high };
}

/**
 * Lay the dots out: each one at its own move, on the first lane where it
 * clears every dot already placed there. Placed from the biggest fall up,
 * so a dot standing on its own is always on the top lane and only the
 * crowd around the market stacks beneath it.
 */
export function stripLayout(
  rows: readonly { ticker: string; move: number }[],
  width: number
): { dots: StripDot[]; lanes: number; low: number; high: number } {
  const { low, high } = stripRange(rows.map((r) => r.move));
  const placed: StripDot[] = [];
  const order = [...rows].sort((a, b) => a.move - b.move);
  for (const row of order) {
    const x = stripX(row.move, width, low, high);
    let lane = 0;
    while (
      placed.some(
        (d) => d.lane === lane && Math.abs(d.x - x) < DOT_PX + DOT_GAP_PX
      )
    ) {
      lane += 1;
    }
    placed.push({ ticker: row.ticker, move: row.move, x, lane });
  }
  const lanes = placed.reduce((n, d) => Math.max(n, d.lane + 1), 1);
  const byInput = rows.map((r) => placed.find((d) => d.ticker === r.ticker)!);
  return { dots: byInput, lanes, low, high };
}

/** How many times the market's own move a company fell, to the nearest whole. */
export function timesTheMarket(move: number, market: number): number | null {
  if (!Number.isFinite(move) || !Number.isFinite(market) || market === 0) {
    return null;
  }
  const times = move / market;
  return times > 0 ? Math.round(times) : null;
}
