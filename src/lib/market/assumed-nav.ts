import { finiteNumber, roundMoney, safeDiv } from "@/lib/money";

/** Reconstruct a book's NAV path from current size × historical closes.
 * Assumes the viewer held the same names and share counts, and that cash
 * sat still. An educated fill-in, not a trade blotter.
 *
 * **The path starts on the first day the whole book can be priced**, and
 * that is the point of the `startAt` below. Holdings do not all have the
 * same amount of history: a recent listing, a name the provider only has
 * partial data for, or a gap in one series leaves some names with closes
 * on days the others do not have. A missing close mid-series is carried
 * forward from the last one, which is right. There is nothing to carry
 * forward from *before* a name's first close, and valuing it at zero there
 * does not understate the book quietly, it invents a rise:
 *
 *     100 shares of a steady $100 name, all week
 *     100 shares of a steady $50 name whose data starts on the 4th
 *     nothing moves, and the chart drew +50%
 *
 * A wrong level is a chart drawn slightly high or low. A wrong shape is a
 * chart that says the book did something it did not do, which is the only
 * thing a NAV line is for.
 *
 * What this still does not fix, deliberately: a holding the provider has
 * no closes for at all is dropped, so the whole line sits low by that
 * position's worth. That is a level error, it is constant across the
 * series, and `applyYtdAnchor` rescales it away when a real year start is
 * known. Refusing to draw anything because one obscure name is unpriced
 * would cost more than it buys.
 */

export type AssumedPosition = { ticker: string; shares: number };
export type NavPoint = { date: string; nav: number };
export type DailyClose = { date: string; close: number };

export function reconstructAssumedNav(
  cash: number,
  positions: AssumedPosition[],
  closesByTicker: Record<string, DailyClose[]>
): NavPoint[] {
  const legs = positions
    .map((p) => {
      const ticker = p.ticker.toUpperCase();
      const shares = Number(p.shares);
      if (!Number.isFinite(shares) || shares === 0) return null;
      const rows = closesByTicker[ticker] ?? [];
      if (rows.length === 0) return null;
      const byDate = new Map(rows.map((r) => [r.date, r.close]));
      return {
        shares,
        byDate,
        dates: rows.map((r) => r.date),
      };
    })
    .filter(
      (
        m
      ): m is {
        shares: number;
        byDate: Map<string, number>;
        dates: string[];
      } => m != null
    );

  if (legs.length === 0) return [];

  const allDates = [
    ...new Set(legs.flatMap((m) => m.dates)),
  ].sort();

  // The first day every leg has something to be valued at. Each leg's own
  // dates are already ascending, so its first is its earliest.
  const startAt = legs.reduce((latest, leg) => {
    const first = leg.dates[0];
    if (!first) return latest;
    return latest == null || first > latest ? first : latest;
  }, null as string | null);
  const dates = startAt == null ? allDates : allDates.filter((d) => d >= startAt);

  const lastClose = legs.map(() => 0);
  const out: NavPoint[] = [];
  for (const date of dates) {
    let nav = finiteNumber(cash);
    legs.forEach((leg, i) => {
      const close = leg.byDate.get(date);
      if (close != null && Number.isFinite(close) && close > 0) {
        lastClose[i] = close;
      }
      nav += leg.shares * (lastClose[i] ?? 0);
    });
    out.push({ date, nav: roundMoney(nav) });
  }
  return out;
}

/** Year-start book value implied by a live total and a year-to-date fraction. */
export function startNavFromYtdPct(liveNav: number, ytdPct: number): number {
  const denom = 1 + ytdPct;
  if (!(liveNav > 0) || !Number.isFinite(denom) || Math.abs(denom) < 1e-6) {
    return finiteNumber(liveNav);
  }
  return roundMoney(safeDiv(liveNav, denom));
}

/**
 * Keep the assumed path's shape, but pin the year to a real start value
 * and today's live total. Buys and sells still aren't in the line. The
 * size of the year is.
 */
export function applyYtdAnchor(
  points: NavPoint[],
  startNav: number,
  liveNav?: number
): NavPoint[] {
  if (points.length < 2 || !(startNav > 0) || !Number.isFinite(startNav)) {
    return points;
  }
  const first = points[0]!.nav;
  const last = points[points.length - 1]!.nav;
  const end =
    liveNav != null && Number.isFinite(liveNav) && liveNav > 0
      ? liveNav
      : last;
  const srcSpan = last - first;
  const dstSpan = end - startNav;
  if (Math.abs(srcSpan) < 1e-6) {
    const n = points.length - 1;
    return points.map((p, i) => ({
      date: p.date,
      nav: roundMoney(startNav + safeDiv(dstSpan * i, n)),
    }));
  }
  return points.map((p) => ({
    date: p.date,
    nav: roundMoney(startNav + safeDiv(p.nav - first, srcSpan) * dstSpan),
  }));
}

export function isUsableNav(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export function usableNavPoints(points: NavPoint[]): NavPoint[] {
  return points.filter(
    (p): p is NavPoint =>
      Boolean(p) && typeof p.date === "string" && isUsableNav(p.nav)
  );
}

/**
 * Build the line we actually draw. A history that belongs to a different
 * book, a zero live total, or a trailing empty point must not reach the
 * SVG. Switching sheets used to stitch today's number onto last sheet's
 * path and drop the line to the floor for a frame.
 */
export function paintBookNavSeries(input: {
  hist: NavPoint[];
  histBelongsToBook: boolean;
  liveNav: number;
  assumed?: boolean;
  startNav?: number | null;
}): NavPoint[] {
  if (!input.histBelongsToBook) return [];
  const hist = usableNavPoints(input.hist);
  if (hist.length === 0) return [];
  let next = [...hist];
  if (isUsableNav(input.liveNav)) {
    const last = next[next.length - 1]!;
    // One recorded night still needs a second point so "Start from 15 Aug"
    // can draw tonight, even when the book hasn't moved.
    if (Math.abs(last.nav - input.liveNav) > 0.5 || next.length < 2) {
      next.push({ date: "Live", nav: input.liveNav });
    } else {
      next[next.length - 1] = { ...last, nav: input.liveNav };
    }
  }
  if (next.length < 2) return [];
  if (
    input.assumed &&
    input.startNav != null &&
    isUsableNav(input.startNav) &&
    next.length >= 2
  ) {
    next = applyYtdAnchor(
      next,
      input.startNav,
      isUsableNav(input.liveNav) ? input.liveNav : undefined
    );
  }
  return next;
}

function isoWeekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((dt.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  );
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** One point per ISO week (last print in the week), plus the latest day. */
export function downsampleToWeeks(points: NavPoint[]): NavPoint[] {
  if (points.length <= 2) return points;
  const byWeek = new Map<string, NavPoint>();
  for (const p of points) {
    byWeek.set(isoWeekKey(p.date), p);
  }
  const out = [...byWeek.values()].sort((a, b) => a.date.localeCompare(b.date));
  const last = points[points.length - 1]!;
  if (out[out.length - 1]?.date !== last.date) out.push(last);
  return out;
}
