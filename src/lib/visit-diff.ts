import { cashtag, signedCurrency, signedPercent } from "@/lib/format";
import type { OverviewModel } from "@/lib/overview";
import { todayKeyInTz } from "@/lib/timezone";

const KEY = "upside-last-visit-v2";
/** Ignore tiny gaps — refresh / tab switch isn't "away". */
const MIN_AWAY_MS = 3 * 60 * 60 * 1000; // 3 hours
/** Or a new Tallinn calendar day always counts as away. */

export type VisitSnapshot = {
  at: string;
  dayKey: string;
  totalValue: number;
  equityValue: number;
  cash: number;
  buyValue: number;
  todayDollar: number;
  quotedShare: number;
  byTicker: Record<
    string,
    { price: number; value: number; todayPct: number | null }
  >;
  bySheet: Record<string, { name: string; value: number }>;
};

export type VisitDiffLine = {
  id: string;
  text: string;
  tone: "up" | "down" | "neutral";
  /**
   * The move behind the line, for a caller that wants to write its own
   * sentence rather than drop this one into the middle of theirs.
   */
  deltaPct?: number;
  deltaValue?: number;
};

export type VisitDiff = {
  previousAt: string;
  lines: VisitDiffLine[];
};

/*
 * Money and percentages come from format.ts, like every other figure a
 * reader sees. These two used to be local, with U+2212 as the sign, so the
 * "Since you looked" card printed a minus one glyph wider than the one on
 * the tile directly above it.
 */
function money(n: number): string {
  return signedCurrency(n, 0);
}

function pct1(n: number): string {
  return signedPercent(n);
}

/** Fraction of tickers that look live-quoted (have a today %). */
export function quoteCoverage(model: OverviewModel): number {
  const n = model.tickers.length;
  if (n === 0) return 0;
  const live = model.tickers.filter((t) => t.todayPct != null).length;
  return live / n;
}

export function captureVisitSnapshot(model: OverviewModel): VisitSnapshot {
  const byTicker: VisitSnapshot["byTicker"] = {};
  for (const t of model.tickers) {
    byTicker[t.ticker] = {
      price: t.price,
      value: t.currentValue,
      todayPct: t.todayPct,
    };
  }
  const bySheet: VisitSnapshot["bySheet"] = {};
  for (const s of model.sheets) {
    bySheet[s.portfolio.id] = {
      name: s.portfolio.name,
      value: s.totalValue,
    };
  }
  return {
    at: new Date().toISOString(),
    dayKey: todayKeyInTz(),
    totalValue: model.totals.totalValue,
    equityValue: model.totals.equityValue,
    cash: model.totals.cash,
    buyValue: model.totals.buyValue,
    todayDollar: model.totals.todayDollar,
    quotedShare: quoteCoverage(model),
    byTicker,
    bySheet,
  };
}

export function loadVisitSnapshot(): VisitSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      // One-time migrate / drop broken v1 snapshots (often cost-basis garbage)
      localStorage.removeItem("upside-last-visit-v1");
      return null;
    }
    const parsed = JSON.parse(raw) as VisitSnapshot;
    if (!(parsed?.totalValue > 0) || !parsed.at) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveVisitSnapshot(snap: VisitSnapshot) {
  if (typeof window === "undefined") return;
  // Don't persist half-loaded books — next open would invent fake "gains"
  if (snap.quotedShare < 0.5) return;
  if (!(snap.totalValue > 0)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}

function isTrustedSnapshot(prev: VisitSnapshot): boolean {
  if (!(prev.totalValue > 0) || !prev.at) return false;
  if (typeof prev.quotedShare === "number" && prev.quotedShare < 0.5)
    return false;
  // Cost-basis shaped book: NAV ≈ buy (±3%) with almost no day move stored
  if (
    prev.buyValue > 0 &&
    Math.abs(prev.totalValue - prev.buyValue) / prev.buyValue < 0.03
  ) {
    return false;
  }
  return true;
}

function wasAwayLongEnough(prev: VisitSnapshot, nowMs = Date.now()): boolean {
  const age = nowMs - new Date(prev.at).getTime();
  if (!Number.isFinite(age) || age < 0) return false;
  if (prev.dayKey !== todayKeyInTz()) return age >= 15 * 60 * 1000;
  return age >= MIN_AWAY_MS;
}

/**
 * What actually moved while you were away — not lifetime P&L.
 * Returns null when the prior snapshot is too fresh or untrustworthy.
 */
export function diffSinceLastVisit(
  prev: VisitSnapshot,
  model: OverviewModel
): VisitDiff | null {
  if (!isTrustedSnapshot(prev)) return null;
  if (!wasAwayLongEnough(prev)) return null;
  if (quoteCoverage(model) < 0.5) return null;

  const lines: VisitDiffLine[] = [];
  const navDelta = model.totals.totalValue - prev.totalValue;

  // Guard: delta ≈ lifetime unrealized P&L → almost certainly a bad baseline
  const lifetimePnl = model.totals.roiDollar;
  if (
    Math.abs(lifetimePnl) > 1000 &&
    Math.abs(navDelta - lifetimePnl) / Math.max(Math.abs(lifetimePnl), 1) < 0.08
  ) {
    return null;
  }

  if (Math.abs(navDelta) >= 100) {
    lines.push({
      id: "nav",
      text: `Portfolio ${money(navDelta)} while you were away`,
      tone: navDelta > 0 ? "up" : navDelta < 0 ? "down" : "neutral",
    });
  }

  const cashDelta = model.totals.cash - prev.cash;
  if (Math.abs(cashDelta) >= 100) {
    lines.push({
      id: "cash",
      text: `Cash ${money(cashDelta)}`,
      tone: cashDelta > 0 ? "up" : "down",
    });
  }

  type Move = { ticker: string; deltaPct: number; deltaValue: number };
  const moves: Move[] = [];
  for (const t of model.tickers) {
    const p = prev.byTicker[t.ticker];
    if (!p || !(p.price > 0)) continue;
    const deltaPct = (t.price - p.price) / p.price;
    const deltaValue = t.currentValue - p.value;
    if (Math.abs(deltaPct) >= 0.02 || Math.abs(deltaValue) >= 500) {
      moves.push({ ticker: t.ticker, deltaPct, deltaValue });
    }
  }
  moves.sort((a, b) => Math.abs(b.deltaValue) - Math.abs(a.deltaValue));
  for (const m of moves.slice(0, 3)) {
    lines.push({
      id: `t-${cashtag(m.ticker)}`,
      text: `${cashtag(m.ticker)} ${pct1(m.deltaPct)} (${money(m.deltaValue)})`,
      tone: m.deltaPct >= 0 ? "up" : "down",
      deltaPct: m.deltaPct,
      deltaValue: m.deltaValue,
    });
  }

  const prevSet = new Set(Object.keys(prev.byTicker));
  const nowSet = new Set(model.tickers.map((t) => t.ticker));
  for (const t of nowSet) {
    if (!prevSet.has(t)) {
      lines.push({
        id: `new-${t}`,
        text: `New in your portfolio: ${cashtag(t)}`,
        tone: "neutral",
      });
    }
  }
  for (const t of prevSet) {
    if (!nowSet.has(t)) {
      lines.push({
        id: `gone-${t}`,
        text: `No longer held: ${cashtag(t)}`,
        tone: "neutral",
      });
    }
  }

  if (lines.length === 0) {
    lines.push({
      id: "quiet",
      text: "Quiet while you were away, barely moved",
      tone: "neutral",
    });
  }

  return { previousAt: prev.at, lines: lines.slice(0, 5) };
}
